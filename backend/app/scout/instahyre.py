import json
import logging
import re
import time
from datetime import datetime, timezone

from app.scout.http import get_with_retry, make_session
from app.scout.models import JobPosting, ScoutQuery
from app.scout.textnorm import detect_remote, parse_experience, parse_salary

logger = logging.getLogger(__name__)

API_URL = "https://www.instahyre.com/api/v1/job_search"
LD_RE = re.compile(
    r'<script type="application/ld\+json">(.*?)</script>', re.S
)

JOB_FUNCTION_IDS = {
    "backend": "10",
    "fullstack": "1",
    "data": "9",
    "frontend": None,
}

class InstahyreScraper:
    name = "instahyre"

    def __init__(self, pages: int = 2, enrich_limit: int = 15, delay: float = 0.6):
        self.session = make_session()
        self.pages = pages
        self.enrich_limit = enrich_limit
        self.delay = delay

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        raws: list[dict] = []
        seen: set[int] = set()
        offset = 0
        limit = min(query.limit_per_source, 35)
        params_base = {"job_type": "0", "limit": limit}
        fn_id = self._job_function_for(query.keywords)
        if fn_id:
            params_base["job_functions"] = fn_id

        for _ in range(self.pages):
            params = dict(params_base, offset=offset)
            resp = get_with_retry(self.session, API_URL, params=params)
            if resp is None or not resp.ok:
                break
            try:
                data = resp.json()
            except Exception:
                break
            objects = data.get("objects") or []
            if not objects:
                break
            for o in objects:
                if o.get("id") not in seen:
                    seen.add(o.get("id"))
                    raws.append(o)
            offset += len(objects)
            total = (data.get("meta") or {}).get("total_count", 0)
            if offset >= total or len(raws) >= query.limit_per_source:
                break
            time.sleep(self.delay)

        jobs = []
        for i, raw in enumerate(raws[: query.limit_per_source]):
            job = self._to_posting(raw)
            if i < self.enrich_limit and job.url:
                self._enrich(job)
                time.sleep(self.delay)
            jobs.append(job)
        return jobs

    @staticmethod
    def _job_function_for(keywords: str) -> str | None:
        kw = keywords.lower()
        if any(w in kw for w in ("backend", "back-end", "back end")):
            return "10"
        if any(w in kw for w in ("fullstack", "full-stack", "full stack")):
            return "1"
        if any(w in kw for w in ("data", "ml", "machine learning", "ai")):
            return "9"
        return None

    def _enrich(self, job: JobPosting) -> None:
        resp = get_with_retry(self.session, job.url)
        if resp is None or not resp.ok:
            return
        for block in LD_RE.findall(resp.text):
            try:
                data = json.loads(block.strip())
            except json.JSONDecodeError:
                continue
            if data.get("@type") != "JobPosting":
                continue
            desc_html = data.get("description") or ""
            job.description = re.sub(r"<[^>]+>", " ", desc_html)
            job.description = re.sub(r"\s+", " ", job.description).strip()
            if data.get("datePosted"):
                try:
                    job.posted_at = datetime.strptime(
                        data["datePosted"], "%Y-%m-%d"
                    ).replace(tzinfo=timezone.utc)
                except ValueError:
                    pass
            salary = data.get("baseSalary") or {}
            if isinstance(salary, dict):
                value = salary.get("value") or {}
                if isinstance(value, dict):
                    job.salary_min = job.salary_min or _fnum(value.get("minValue"))
                    job.salary_max = job.salary_max or _fnum(value.get("maxValue"))
                    job.salary_currency = job.salary_currency or salary.get(
                        "currency"
                    )
            break
        if job.experience_min is None and job.description:
            job.experience_min, job.experience_max = parse_experience(
                job.description[:2000]
            )
        if job.salary_min is None and job.description:
            job.salary_min, job.salary_max, job.salary_currency = parse_salary(
                job.description[:2000]
            )

    @staticmethod
    def _to_posting(raw: dict) -> JobPosting:
        employer = raw.get("employer") or {}
        keywords = raw.get("keywords") or []
        url = raw.get("public_url") or ""
        m = re.search(r"/job-(\d+)-", url)
        return JobPosting(
            source="instahyre",
            external_id=str(raw.get("id") or (m.group(1) if m else "")),
            title=raw.get("title") or "",
            company=employer.get("company_name") or "",
            location=raw.get("locations") or "",
            remote=detect_remote(raw.get("locations"), raw.get("title")),
            url=url,
            skills=[k for k in keywords if isinstance(k, str)],
            raw={"employee_count": employer.get("employee_count")},
        )

def _fnum(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
