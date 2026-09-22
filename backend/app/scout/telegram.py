import asyncio
import csv
import logging
import os
import re
from pathlib import Path

from dotenv import load_dotenv

from app.scout.models import JobPosting, ScoutQuery
from app.scout.textnorm import detect_remote, parse_experience, parse_posted_date, parse_salary

logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_CSV = _BACKEND_DIR / "data" / "telemetr_india_career.csv"
SESSION_PATH = _BACKEND_DIR / "tg_session"

URL_RE = re.compile(r"https?://[^\s)\]>\"']+")
LABELS = {
    "title": r"(?:job\s*title|role|position|designation|hiring\s*for|opening\s*for|profile)",
    "company": r"(?:company|organization|organisation|employer|firm)",
    "location": r"(?:location|loc|city|place|work\s*location|job\s*location)",
    "salary": r"(?:ctc|salary|stipend|package|pay|compensation|lpa)",
    "experience": r"(?:experience|exp|yrs?\.?\s*(?:of)?\s*exp)",
    "apply": r"(?:apply|link|url|registration|register)",
}
_LABEL_LINE = {
    k: re.compile(rf"^\W*({v})\W*[:\-–]\W*(.+)$", re.I | re.M)
    for k, v in LABELS.items()
}
_APPLY_HINT = re.compile(
    r"apply|regist|hiring|opening|vacanc|job|role|position|intern", re.I
)

def _load_channels(csv_path: Path) -> list[dict]:
    channels = []
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            slug = (row.get("telemetr_slug") or "").strip()
            url = (row.get("telegram_url_inferred") or "").strip()
            if not slug and "t.me/" in url:
                slug = url.rsplit("/", 1)[-1]
            if slug:
                channels.append(
                    {
                        "slug": slug,
                        "name": (row.get("name") or slug).strip(),
                        "id": (row.get("channel_id") or "").strip(),
                    }
                )
    return channels

class TelegramScraper:
    name = "telegram"

    def __init__(
        self,
        csv_path: Path = DEFAULT_CSV,
        session_path: Path = SESSION_PATH,
        messages_per_channel: int = 30,
        max_channels: int = 30,
    ):
        load_dotenv(_BACKEND_DIR / ".env")
        self.api_id = os.getenv("TG_API_ID")
        self.api_hash = os.getenv("TG_API_HASH")
        self.csv_path = csv_path
        self.session_path = str(session_path)
        self.messages_per_channel = messages_per_channel
        self.max_channels = max_channels

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        if not self.api_id or not self.api_hash:
            logger.warning("TG_API_ID/TG_API_HASH not set — skipping telegram")
            return []
        if not Path(self.session_path + ".session").exists():
            logger.warning(
                "no telegram session at %s.session — run scripts/tg_login.py first",
                self.session_path,
            )
            return []
        return asyncio.run(self._scrape_async(query))

    async def _scrape_async(self, query: ScoutQuery) -> list[JobPosting]:
        from telethon import TelegramClient
        from telethon.errors import (
            ChannelPrivateError,
            UsernameInvalidError,
            UsernameNotOccupiedError,
        )

        jobs: list[JobPosting] = []
        channels = _load_channels(self.csv_path)[: self.max_channels]
        kw_terms = set(query.keywords.lower().split())

        async with TelegramClient(
            self.session_path, int(self.api_id), self.api_hash
        ) as client:
            for ch in channels:
                try:
                    entity = await client.get_entity(ch["slug"])
                except (
                    UsernameNotOccupiedError,
                    UsernameInvalidError,
                    ChannelPrivateError,
                    ValueError,
                ):
                    continue
                except Exception:
                    logger.debug("telegram: skip %s", ch["slug"], exc_info=True)
                    continue

                try:
                    async for msg in client.iter_messages(
                        entity, limit=self.messages_per_channel
                    ):
                        text = (msg.message or "").strip()
                        if len(text) < 40 or not _APPLY_HINT.search(text):
                            continue
                        job = self._parse_message(text, msg, ch)
                        if job is None:
                            continue
                        if kw_terms and not self._relevant(job, kw_terms):
                            continue
                        jobs.append(job)
                except Exception:
                    logger.debug("telegram: read failed %s", ch["slug"], exc_info=True)
                    continue
        return jobs

    @staticmethod
    def _relevant(job: JobPosting, kw_terms: set[str]) -> bool:
        blob = f"{job.title} {job.description} {' '.join(job.skills)}".lower()
        return any(len(t) > 2 and t in blob for t in kw_terms)

    @staticmethod
    def _parse_message(text: str, msg, channel: dict) -> JobPosting | None:
        fields: dict[str, str] = {}
        for key, rx in _LABEL_LINE.items():
            m = rx.search(text)
            if m:
                fields[key] = m.group(2).strip().split("\n")[0][:200]

        urls = URL_RE.findall(text)
        apply_url = ""
        if "apply" in fields:
            m = URL_RE.search(fields["apply"])
            apply_url = m.group(0) if m else ""
        if not apply_url:
            non_tg = [u for u in urls if "t.me" not in u]
            apply_url = non_tg[0] if non_tg else (urls[0] if urls else "")
        if not apply_url:
            apply_url = f"https://t.me/{channel['slug']}/{msg.id}"

        title = fields.get("title", "")
        if not title:
            first = next(
                (ln.strip(" \t*-•🔹💼📌") for ln in text.splitlines() if ln.strip()),
                "",
            )
            title = first[:160]

        company = fields.get("company", "")
        if not company:
            m = re.search(
                r"\bat\s+([A-Z][A-Za-z0-9&.,' -]{2,40}?)(?:,|\.| - |\||$)", text
            )
            if m:
                company = m.group(1).strip()

        sal_min, sal_max, cur = parse_salary(fields.get("salary") or text[:2000])
        exp_min, exp_max = parse_experience(fields.get("experience") or text[:2000])

        return JobPosting(
            source="telegram",
            external_id=f"{channel['id'] or channel['slug']}:{msg.id}",
            title=title,
            company=company,
            location=fields.get("location", ""),
            remote=detect_remote(fields.get("location"), text[:400]),
            url=apply_url,
            description=text[:4000],
            experience_min=exp_min,
            experience_max=exp_max,
            salary_min=sal_min,
            salary_max=sal_max,
            salary_currency=cur,
            posted_at=msg.date,
            channel=channel["name"],
        )
