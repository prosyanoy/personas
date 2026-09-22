import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from app import db
from app.scout.base import safe_scrape
from app.scout.cutshort import CutshortScraper
from app.scout.instahyre import InstahyreScraper
from app.scout.linkedin import LinkedInScraper
from app.scout.models import ALL_SOURCES, JobPosting, ScoutQuery, SourceName
from app.scout.naukri import NaukriScraper
from app.scout.telegram import TelegramScraper
from app.scout.wellfound import WellfoundScraper

logger = logging.getLogger(__name__)

SCRAPER_CLASSES = {
    "linkedin": LinkedInScraper,
    "naukri": NaukriScraper,
    "instahyre": InstahyreScraper,
    "cutshort": CutshortScraper,
    "wellfound": WellfoundScraper,
    "telegram": TelegramScraper,
}

def scrape_source(source: SourceName, query: ScoutQuery) -> list[JobPosting]:
    scraper = SCRAPER_CLASSES[source]()
    return safe_scrape(scraper, query)

def run_scout(
    query: ScoutQuery, sources: list[SourceName] | None = None
) -> dict[str, list[JobPosting]]:
    wanted = sources or ALL_SOURCES
    results: dict[str, list[JobPosting]] = {}
    with ThreadPoolExecutor(max_workers=len(wanted)) as pool:
        futures = {
            pool.submit(scrape_source, src, query): src for src in wanted
        }
        for fut in as_completed(futures):
            src = futures[fut]
            jobs = fut.result()
            deduped = _dedupe(jobs)
            results[src] = deduped
            db.save_jobs(deduped)
    return results

def _dedupe(jobs: list[JobPosting]) -> list[JobPosting]:
    seen: set[str] = set()
    out = []
    for j in jobs:
        key = j.dedupe_key
        if key in seen:
            continue
        seen.add(key)
        out.append(j)
    return out
