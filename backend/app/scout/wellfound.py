import logging
import os
import re
import time
from pathlib import Path

from app.scout.http import get_with_retry, make_session
from app.scout.models import JobPosting, ScoutQuery
from app.scout.textnorm import detect_remote, parse_experience, parse_posted_date, parse_salary

logger = logging.getLogger(__name__)

COOKIE_FILE = Path(__file__).resolve().parent.parent.parent / "wellfound_cookies.txt"

class WellfoundScraper:
    name = "wellfound"

    def __init__(self, use_browser: bool = True, headless: bool | None = None):
        self.session = make_session()
        self.use_browser = use_browser
        if headless is None:
            import os

            headless = os.getenv("WELLFOUND_HEADED", "").lower() not in ("1", "true")
        self.headless = headless

    def scrape(self, query: ScoutQuery) -> list[JobPosting]:
        jobs = self._try_http(query)
        if not jobs and self.use_browser:
            jobs = self._try_browser(query)
        return jobs[: query.limit_per_source]

    def _try_http(self, query: ScoutQuery) -> list[JobPosting]:
        slug = re.sub(r"[^a-z0-9]+", "-", query.keywords.lower()).strip("-")
        url = f"https://wellfound.com/role/r/{slug}"
        resp = get_with_retry(self.session, url, retries=1)
        if resp is None or resp.status_code != 200:
            return []
        return self._parse_dom_cards(resp.text)

    def _try_browser(self, query: ScoutQuery) -> list[JobPosting]:
        try:
            from selenium import webdriver
        except ImportError:
            logger.warning("selenium not installed — skipping wellfound browser path")
            return []

        driver = self._launch(webdriver)
        if driver is None:
            return []
        try:
            driver.get("https://wellfound.com")
            time.sleep(4)
            self._inject_cookies(driver)
            slug = re.sub(r"[^a-z0-9]+", "-", query.keywords.lower()).strip("-")
            jobs: list[JobPosting] = []
            for url in (
                f"https://wellfound.com/role/r/{slug}",
                "https://wellfound.com/jobs",
            ):
                driver.get(url)
                if not self._wait_past_challenge(driver):
                    continue
                jobs = self._parse_dom_cards(driver.page_source)
                if jobs:
                    break
            self._persist_cookies(driver)
            return jobs
        except Exception:
            logger.exception("wellfound browser path failed")
            return []
        finally:
            driver.quit()

    def _launch(self, webdriver):
        try:
            from selenium.webdriver.firefox.options import Options as FFOptions

            opts = FFOptions()
            if self.headless:
                opts.add_argument("-headless")
            opts.set_preference("dom.webdriver.enabled", False)
            opts.set_preference("useAutomationExtension", False)
            return webdriver.Firefox(options=opts)
        except Exception:
            pass
        try:
            from selenium.webdriver.chrome.options import Options as COptions

            opts = COptions()
            if self.headless:
                opts.add_argument("--headless=new")
            opts.add_argument("--no-sandbox")
            opts.add_argument("--disable-blink-features=AutomationControlled")
            return webdriver.Chrome(options=opts)
        except Exception:
            logger.warning("no usable browser for wellfound")
            return None

    @staticmethod
    def _inject_cookies(driver) -> None:
        try:
            lines = COOKIE_FILE.read_text().splitlines()
        except OSError:
            return
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) < 7:
                continue
            domain, _, path, _, _, name, value = parts[:7]
            try:
                driver.add_cookie(
                    {
                        "name": name,
                        "value": value,
                        "domain": domain.lstrip("."),
                        "path": path,
                    }
                )
            except Exception:
                continue

    @staticmethod
    def _wait_past_challenge(driver, attempts: int = 8) -> bool:
        for _ in range(attempts):
            title = (driver.title or "").lower()
            if "just a moment" not in title and "security check" not in title:
                return True
            time.sleep(4)
        return False

    @staticmethod
    def _persist_cookies(driver) -> None:
        try:
            lines = []
            for c in driver.get_cookies():
                lines.append(
                    "\t".join(
                        [
                            c.get("domain", ".wellfound.com"),
                            "TRUE" if c.get("domain", "").startswith(".") else "FALSE",
                            c.get("path", "/"),
                            "TRUE" if c.get("secure") else "FALSE",
                            str(int(c.get("expiry") or 0)),
                            c.get("name", ""),
                            c.get("value", ""),
                        ]
                    )
                )
            if any("\tcf_clearance\t" in ln for ln in lines):
                COOKIE_FILE.write_text("\n".join(lines) + "\n")
        except OSError:
            pass

    def _graphql_in_page(self, driver, query: ScoutQuery) -> list[JobPosting]:
        script = """
        const [kw, opId, done] = [arguments[0], arguments[1], arguments[arguments.length-1]];
        (async () => {
          try {
            const csrf = document.querySelector('meta[name="csrf-token"]');
            const resp = await fetch('/graphql?fallbackAOR=talent', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf ? csrf.getAttribute('content') : '',
              },
              body: JSON.stringify({
                operationName: 'JobSearchResultsX',
                variables: {filterConfigurationInput: {
                  page: 1, keywords: [kw],
                  jobTypes: ['full_time'], remotePreference: 'REMOTE_OK',
                }},
                extensions: {operationId: opId},
              }),
            });
            done(resp.status === 200 ? await resp.json() : {status: resp.status});
          } catch (e) { done({error: String(e)}); }
        })();
        """
        try:
            result = driver.execute_async_script(
                script, query.keywords, JOB_SEARCH_OP_ID
            )
        except Exception:
            logger.exception("wellfound in-page graphql failed")
            return []
        if not isinstance(result, dict) or "data" not in result:
            logger.warning("wellfound graphql rejected: %s", str(result)[:200])
            return []
        return self._parse_graphql(result)

    def _parse_graphql(self, data: dict) -> list[JobPosting]:
        jobs: list[JobPosting] = []
        try:
            results = (
                data["data"]["talent"]["jobSearchResults"]
                or data["data"]["jobSearchResults"]
            )
            edges = results.get("jobListings") or results.get("edges") or []
        except (KeyError, TypeError, AttributeError):
            return []
        for edge in edges:
            node = edge.get("node") if isinstance(edge, dict) else None
            node = node or edge
            if not isinstance(node, dict):
                continue
            startup = node.get("startup") or {}
            locs = node.get("locationNames") or node.get("locations") or []
            loc = ", ".join(locs) if isinstance(locs, list) else str(locs)
            comp = node.get("compensation") or ""
            sal_min, sal_max, cur = parse_salary(str(comp))
            jid = str(node.get("id") or node.get("slug") or "")
            jobs.append(
                JobPosting(
                    source="wellfound",
                    external_id=jid,
                    title=node.get("title") or "",
                    company=startup.get("name") or "",
                    location=loc,
                    remote=detect_remote(loc, node.get("title"), node.get("remote")),
                    url=f"https://wellfound.com/jobs/{jid}" if jid else "",
                    description=node.get("description") or "",
                    salary_min=sal_min,
                    salary_max=sal_max,
                    salary_currency=cur,
                    posted_at=parse_posted_date(
                        node.get("liveStartAt") or node.get("postedAt")
                    ),
                )
            )
        return jobs

    @staticmethod
    def _parse_dom_cards(html: str) -> list[JobPosting]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        jobs: list[JobPosting] = []
        seen: set[str] = set()
        for a in soup.find_all("a", href=re.compile(r"/jobs/\d+")):
            href = a["href"].split("?")[0]
            jid = re.search(r"/jobs/(\d+)", href)
            if not jid or jid.group(1) in seen:
                continue
            card = a.find_parent(["li", "div"], class_=True) or a.parent
            text = card.get_text(" ", strip=True) if card else a.get_text(" ", strip=True)
            seen.add(jid.group(1))
            sal_min, sal_max, cur = parse_salary(text)
            exp_min, exp_max = parse_experience(text)
            jobs.append(
                JobPosting(
                    source="wellfound",
                    external_id=jid.group(1),
                    title=a.get_text(" ", strip=True)[:160] or text[:160],
                    location=text[:200],
                    remote=detect_remote(text),
                    url=f"https://wellfound.com{href}",
                    salary_min=sal_min,
                    salary_max=sal_max,
                    salary_currency=cur,
                    experience_min=exp_min,
                    experience_max=exp_max,
                )
            )
        return jobs
