import logging
import re
from datetime import datetime, timezone
from urllib.parse import quote

from bs4 import BeautifulSoup

from app.scout.http import get_with_retry, make_session
from app.scout.models import JobPosting, ScoutQuery
from app.scout.textnorm import detect_remote, parse_experience, parse_salary

logger = logging.getLogger(__name__)

SEARCH_URL = (
    "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
    "?keywords={keywords}&location={location}&f_WT={f_wt}&geoId=&f_TPR={timespan}&start={start}"
)
JOB_URL = "https://www.linkedin.com/jobs/view/{job_id}/"

class LinkedInScraper:
    name = "linkedin"

    def __init__(self, fetch_descriptions: bool = True, pages: int = 2):
        self.session = make_session()
        self.fetch_descriptions = fetch_descriptions
        self.pages = pages

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        cards = self._get_cards(query)
        jobs = []
        for card in cards[: query.limit_per_source]:
            if self.fetch_descriptions:
                desc = self._get_description(card["job_id"])
                if desc:
                    card["description"] = desc
            jobs.append(self._to_posting(card))
        return jobs

    def _get_cards(self, query: ScoutQuery) -> list[dict]:
        cards: list[dict] = []
        seen: set[str] = set()
        keywords = quote(query.keywords)
        location = quote(query.location or "India")
        f_wt = "2" if query.remote_ok and not query.location else ""
        for i in range(self.pages):
            url = SEARCH_URL.format(
                keywords=keywords,
                location=location,
                f_wt=f_wt,
                timespan="r604800",
                start=25 * i,
            )
            resp = get_with_retry(self.session, url, headers={"User-Agent": _ua()})
            if resp is None or resp.status_code != 200:
                logger.warning("linkedin search failed: %s", url)
                continue
            soup = BeautifulSoup(resp.content, "html.parser")
            for item in soup.find_all("div", class_="base-search-card__info"):
                card = self._parse_card(item)
                if card and card["job_id"] not in seen:
                    seen.add(card["job_id"])
                    cards.append(card)
        return cards

    @staticmethod
    def _parse_card(item) -> dict | None:
        title = item.find("h3")
        if title is None:
            return None
        company = item.find("a", class_="hidden-nested-link")
        location = item.find("span", class_="job-search-card__location")
        parent = item.parent
        urn = (parent.get("data-entity-urn") or "") if parent else ""
        job_id = urn.split(":")[-1]
        time_tag = item.find("time", class_="job-search-card__listdate") or item.find(
            "time", class_="job-search-card__listdate--new"
        )
        return {
            "title": title.text.strip(),
            "company": company.text.strip().replace("\n", " ") if company else "",
            "location": location.text.strip() if location else "",
            "date": time_tag.get("datetime") if time_tag else None,
            "job_id": job_id,
            "description": "",
        }

    def _get_description(self, job_id: str) -> str:
        resp = get_with_retry(
            self.session, JOB_URL.format(job_id=job_id), headers={"User-Agent": _ua()}
        )
        if resp is None or resp.status_code != 200:
            return ""
        soup = BeautifulSoup(resp.content, "html.parser")
        div = soup.find("div", class_="description__text description__text--rich")
        if not div:
            div = soup.find("div", class_=re.compile(r"description__text"))
        if not div:
            return ""
        for el in div.find_all(["span", "a"]):
            el.decompose()
        for ul in div.find_all("ul"):
            for li in ul.find_all("li"):
                li.insert(0, "-")
        text = div.get_text(separator="\n").strip()
        return text.replace("::marker", "-").replace("Show less", "").replace(
            "Show more", ""
        )

    @staticmethod
    def _to_posting(card: dict) -> JobPosting:
        posted_at = None
        if card.get("date"):
            try:
                posted_at = datetime.strptime(card["date"], "%Y-%m-%d").replace(
                    tzinfo=timezone.utc
                )
            except ValueError:
                pass
        desc = card.get("description", "")
        exp_min, exp_max = parse_experience(desc)
        sal_min, sal_max, cur = parse_salary(desc)
        return JobPosting(
            source="linkedin",
            external_id=card["job_id"],
            title=card["title"],
            company=card["company"],
            location=card["location"],
            remote=detect_remote(card["location"], card["title"], desc[:500]),
            url=JOB_URL.format(job_id=card["job_id"]) if card["job_id"] else "",
            description=desc,
            experience_min=exp_min,
            experience_max=exp_max,
            salary_min=sal_min,
            salary_max=sal_max,
            salary_currency=cur,
            posted_at=posted_at,
        )

def _ua() -> str:
    from app.scout.http import USER_AGENT

    return USER_AGENT
