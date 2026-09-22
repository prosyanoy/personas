import base64
import logging
import time

from Crypto.Cipher import PKCS1_v1_5
from Crypto.PublicKey import RSA

from app.scout.http import make_session
from app.scout.models import JobPosting, ScoutQuery
from app.scout.textnorm import detect_remote, parse_experience, parse_posted_date, parse_salary

logger = logging.getLogger(__name__)

JOB_SEARCH_URL = "https://www.naukri.com/jobapi/v3/search"

_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBALrlQ+djR0RjJwBF1xuisHmdFv334MIm
K6LgzJhmLhN7B5yuEyaKoasgXQk3+OQglsOaBxEJ0j5PcTL3nbOvt80CAwEAAQ==
-----END PUBLIC KEY-----"""

_cipher = PKCS1_v1_5.new(RSA.import_key(_PUBLIC_KEY))

def generate_nkparam(page_type: str = "srp") -> str:
    plaintext = f"v0|{int(time.time() * 1000)}|121_{page_type}"
    return base64.b64encode(_cipher.encrypt(plaintext.encode())).decode()

class NaukriScraper:
    name = "naukri"

    def __init__(self, pages: int = 2):
        self.session = make_session()
        self.pages = pages

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        jobs: list[JobPosting] = []
        seen: set[str] = set()
        for page in range(1, self.pages + 1):
            for raw in self._search(query, page):
                job = self._to_posting(raw)
                if job.external_id and job.external_id not in seen:
                    seen.add(job.external_id)
                    jobs.append(job)
            if len(jobs) >= query.limit_per_source:
                break
        return jobs[: query.limit_per_source]

    @staticmethod
    def _seo_key(keyword: str, location: str, page: int) -> str:
        kw = (
            keyword.strip().lower()
            .replace(".", "-dot-")
            .replace(" ", "-")
            .replace("+", "-")
            .strip("-")
        )
        if location.strip():
            return f"{kw}-jobs-in-{location.strip().lower().replace(' ', '-')}-{page}"
        return f"{kw}-jobs-{page}"

    def _search(self, query: ScoutQuery, page: int) -> list[dict]:
        headers = {
            "accept": "application/json",
            "appid": "109",
            "clientid": "d3skt0p",
            "content-type": "application/json",
            "gid": "LOCATION,INDUSTRY,EDUCATION,FAREA_ROLE",
            "nkparam": generate_nkparam("srp"),
            "referer": "https://www.naukri.com/",
            "systemid": "jobseeker",
            "x-requested-with": "XMLHttpRequest",
        }
        params = {
            "noOfResults": min(query.limit_per_source, 40),
            "urlType": "search_by_keyword",
            "searchType": "adv",
            "keyword": query.keywords,
            "k": query.keywords,
            "pageNo": page,
            "location": query.location or "",
            "jobAge": 7,
            "nignbevent_src": "jobsearchDeskGNB",
            "seoKey": self._seo_key(query.keywords, query.location, page),
            "src": "jobsearchDesk",
            "latLong": "",
        }
        resp = self.session.get(JOB_SEARCH_URL, headers=headers, params=params)
        if resp.status_code == 403:
            logger.warning("naukri 403 — nkparam rejected")
            return []
        if resp.status_code == 406:
            logger.warning("naukri 406 validation error: %s", resp.text[:200])
            return []
        if not resp.ok:
            logger.warning("naukri search failed: %s", resp.status_code)
            return []
        data = resp.json()
        return data.get("jobDetails") or data.get("jobs") or []

    @staticmethod
    def _to_posting(raw: dict) -> JobPosting:
        exp_label = sal_label = loc_label = ""
        for p in raw.get("placeholders") or []:
            t = p.get("type")
            if t == "experience":
                exp_label = p.get("label") or ""
            elif t == "salary":
                sal_label = p.get("label") or ""
            elif t == "location":
                loc_label = p.get("label") or ""

        exp_min, exp_max = parse_experience(exp_label)
        sal_min, sal_max, cur = parse_salary(sal_label)
        jd_url = raw.get("jdURL") or ""
        skills = (
            [s.strip() for s in raw.get("tagsAndSkills", "").split(",") if s.strip()]
            if raw.get("tagsAndSkills")
            else []
        )
        return JobPosting(
            source="naukri",
            external_id=str(raw.get("jobId") or raw.get("id") or ""),
            title=raw.get("title") or raw.get("jobTitle") or "",
            company=raw.get("companyName") or raw.get("company") or "",
            location=loc_label,
            remote=detect_remote(loc_label, raw.get("title")),
            url=f"https://www.naukri.com{jd_url}" if jd_url else "",
            description=raw.get("jobDescription") or "",
            skills=skills,
            experience_min=exp_min,
            experience_max=exp_max,
            salary_min=sal_min,
            salary_max=sal_max,
            salary_currency=cur,
            posted_at=parse_posted_date(
                raw.get("footerPlaceholderLabel") or raw.get("postedDate")
            ),
        )
