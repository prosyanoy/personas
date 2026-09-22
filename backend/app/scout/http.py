import logging
import random
import time

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

try:
    from curl_cffi import requests as _cffi

    _HAS_CFFI = True
except ImportError:
    _HAS_CFFI = False

def make_session():
    if _HAS_CFFI:
        return _cffi.Session(impersonate="chrome124", timeout=30)
    return httpx.Client(
        timeout=30,
        follow_redirects=True,
        headers={"User-Agent": USER_AGENT},
    )

def get_with_retry(
    session,
    url: str,
    *,
    retries: int = 3,
    base_delay: float = 1.0,
    **kwargs,
):
    delay = base_delay
    for attempt in range(1, retries + 1):
        try:
            resp = session.get(url, **kwargs)
        except Exception as exc:
            if attempt == retries:
                raise
            logger.warning("GET %s failed (%s), retrying", url, exc)
        else:
            if resp.status_code not in (429, 500, 502, 503, 504):
                return resp
            if attempt == retries:
                return resp
            logger.warning("GET %s -> %s, retrying", url, resp.status_code)
        time.sleep(delay * (1 + 0.3 * random.random()))
        delay = min(delay * 2, 30)
    return None
