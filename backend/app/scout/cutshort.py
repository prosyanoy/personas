import json
import logging
import re

from app.scout.http import get_with_retry, make_session
from app.scout.models import JobPosting, ScoutQuery
from app.scout.textnorm import detect_remote, parse_posted_date

logger = logging.getLogger(__name__)

API = "https://cutshort.io/backend-api/webpage/jobs"

class CutshortScraper:
    name = "cutshort"

    def __init__(self, pages: int = 1):
        self.session = make_session()
        self.pages = pages
        self._categories: list[str] | None = None

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        for url in self._candidate_urls(query):
            jobs = self._scrape_url(url, query)
            if jobs:
                return jobs[: query.limit_per_source]
        return []

    def _candidate_urls(self, query: ScoutQuery) -> list[str]:
        tokens = re.sub(r"[^a-z0-9 ]", "", query.keywords.lower()).split()
        slugs = ["-".join(tokens[:i]) for i in range(len(tokens), 0, -1)]
        best = self._best_category_slug(query)
        tail = ["startup-jobs"]
        if best:
            tail = [best, *tail]
        ordered = [*[f"{s}-jobs" for s in slugs], *tail]
        if query.location:
            loc = re.sub(r"[^a-z0-9]+", "-", query.location.lower()).strip("-")
            ordered.insert(0, f"{ordered[0]}-in-{loc}")
        if query.remote_ok:
            ordered.insert(0, f"remote-{ordered[0]}")
        seen, urls = set(), []
        for slug in ordered:
            url = f"{API}/{slug}"
            if slug not in seen:
                seen.add(slug)
                urls.append(url)
        return urls

    def _category_slugs(self) -> list[str]:
        if self._categories is not None:
            return self._categories
        self._categories = []
        resp = get_with_retry(self.session, f"{API}?page=1")
        if resp is not None and resp.ok:
            try:
                for ld in (resp.json().get("data") or {}).get("seoData", {}).get(
                    "jsonlds", []
                ):
                    for el in ld.get("itemListElement", []):
                        url = el.get("url", "")
                        if "/jobs/" in url:
                            self._categories.append(url.rsplit("/jobs/", 1)[-1])
            except (json.JSONDecodeError, ValueError, AttributeError):
                pass
        return self._categories

    def _best_category_slug(self, query: ScoutQuery) -> str | None:
        terms = {t for t in query.keywords.lower().split() if len(t) > 2}
        if not terms:
            return None
        best, best_score = None, 0
        for slug in self._category_slugs():
            score = sum(1 for t in terms if t in slug)
            if score > best_score:
                best, best_score = slug, score
        return best

    def _scrape_url(self, url: str, query: ScoutQuery) -> list[JobPosting]:
        resp = get_with_retry(self.session, url)
        if resp is None or not resp.ok:
            return []
        try:
            raws = (resp.json().get("data") or {}).get("pageData", {}).get("jobs")
        except (json.JSONDecodeError, ValueError):
            return []
        if not raws:
            return []
        terms = [t for t in query.keywords.lower().split() if len(t) > 2]
        if terms:
            raws = [
                r
                for r in raws
                if any(t in json.dumps(r, default=str).lower() for t in terms)
            ] or raws
        return [self._to_posting(r) for r in raws]

    @staticmethod
    def _to_posting(raw: dict) -> JobPosting:
        salary = raw.get("salaryRange") or {}
        exp = raw.get("expRange") or {}
        company = raw.get("companyDetails") or raw.get("companyId") or {}
        desc_html = raw.get("sanitizedComment") or ""
        description = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", desc_html)).strip()
        locations = raw.get("locations") or []
        loc_text = raw.get("locationsText") or ", ".join(
            l if isinstance(l, str) else l.get("name", "") for l in locations
        )
        url = raw.get("publicUrl") or ""
        remote = (raw.get("remoteType") or "") in ("remote_only", "remote") or detect_remote(
            loc_text, raw.get("headline")
        )
        posted_at = parse_posted_date((raw.get("jobFactSummary") or {}).get("postedDate"))
        return JobPosting(
            source="cutshort",
            external_id=str(raw.get("_id") or ""),
            title=raw.get("headline") or "",
            company=company.get("name") or "",
            location=loc_text,
            remote=remote,
            url=url,
            description=description,
            skills=[s for s in (raw.get("allSkills") or []) if isinstance(s, str)],
            experience_min=_fnum(exp.get("min")),
            experience_max=_fnum(exp.get("max")),
            salary_min=_fnum(salary.get("min")),
            salary_max=_fnum(salary.get("max")),
            salary_currency=salary.get("currency"),
            posted_at=posted_at,
        )

def _fnum(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None
