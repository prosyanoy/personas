import logging
from typing import Protocol

from app.scout.models import JobPosting, ScoutQuery

logger = logging.getLogger(__name__)

class JobScraper(Protocol):
    name: str

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        ...

def safe_scrape(scraper: JobScraper, query: ScoutQuery) -> list[JobPosting]:
    try:
        jobs = scraper.scrape(query)
        logger.info("[%s] scraped %d jobs", scraper.name, len(jobs))
        return jobs
    except Exception:
        logger.exception("[%s] scraper failed", scraper.name)
        return []
