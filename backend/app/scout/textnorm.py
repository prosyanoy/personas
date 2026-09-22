import re
from datetime import datetime, timedelta, timezone

_EXP_RANGE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*(?:\+)?\s*(?:years?|yrs?)\b",
    re.I,
)
_EXP_MIN = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b", re.I)

def parse_experience(text: str | None) -> tuple[float | None, float | None]:
    if not text:
        return None, None
    m = _EXP_RANGE.search(text)
    if m:
        return float(m.group(1)), float(m.group(2))
    m = _EXP_MIN.search(text)
    if m:
        val = float(m.group(1))
        return val, None
    if re.search(r"fresher|entry level|0\s*-\s*1", text, re.I):
        return 0.0, 1.0
    return None, None

_LPA_RANGE = re.compile(
    r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*"
    r"(l(?:akh|ac|pa)?s?\.?\s*(?:p\.?a\.?|per annum|/ ?yr|/ ?year)?|k\b)",
    re.I,
)
_LPA_SINGLE = re.compile(
    r"(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(l(?:akh|ac|pa)?s?|k)\b", re.I
)
_PLAIN_RANGE = re.compile(
    r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(?:-|–|to)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)",
    re.I,
)
_USD_RANGE = re.compile(
    r"\$\s*([\d,]+(?:\.\d+)?)\s*k?\s*(?:-|–|to)\s*\$?\s*([\d,]+(?:\.\d+)?)\s*k?",
    re.I,
)

def _unit_mult(unit: str) -> float:
    u = unit.lower().strip()
    if u.startswith("k"):
        return 1_000.0
    return 100_000.0

def parse_salary(text: str | None) -> tuple[float | None, float | None, str | None]:
    if not text:
        return None, None, None
    t = text.strip()
    if not t or re.search(r"not disclosed|competitive|as per|negotiable", t, re.I):
        return None, None, None

    m = _PLAIN_RANGE.search(t)
    if m:
        lo = float(m.group(1).replace(",", ""))
        hi = float(m.group(2).replace(",", ""))
        return lo, hi, "INR"

    m = _LPA_RANGE.search(t)
    if m:
        mult = _unit_mult(m.group(3))
        return float(m.group(1)) * mult, float(m.group(2)) * mult, "INR"

    m = _USD_RANGE.search(t)
    if m:
        lo, hi = float(m.group(1).replace(",", "")), float(m.group(2).replace(",", ""))
        if lo < 1000:
            lo, hi = lo * 1000, hi * 1000
        return lo, hi, "USD"

    m = _LPA_SINGLE.search(t)
    if m:
        mult = _unit_mult(m.group(2))
        v = float(m.group(1)) * mult
        return v, v, "INR"

    return None, None, None

_RELATIVE = re.compile(
    r"(\d+)\s+(minute|hour|day|week|month)s?\s+ago", re.I
)
_REL_UNITS = {
    "minute": timedelta(minutes=1),
    "hour": timedelta(hours=1),
    "day": timedelta(days=1),
    "week": timedelta(weeks=1),
    "month": timedelta(days=30),
}

def parse_posted_date(text: str | None) -> datetime | None:
    if not text:
        return None
    t = text.strip()

    m = _RELATIVE.search(t)
    if m:
        return datetime.now(timezone.utc) - int(m.group(1)) * _REL_UNITS[m.group(2).lower()]

    if re.search(r"\b(today|just now|new)\b", t, re.I):
        return datetime.now(timezone.utc)
    if re.search(r"\byesterday\b", t, re.I):
        return datetime.now(timezone.utc) - timedelta(days=1)

    t2 = re.sub(r"(?i)\bposted\b|\bon\b", "", t).strip()
    try:
        dt = datetime.fromisoformat(t2.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d %B %Y", "%d-%m-%Y", "%Y-%m-%dT%H:%M:%S%z"):
        try:
            dt = datetime.strptime(t2, fmt)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None

def detect_remote(*texts: str | None) -> bool | None:
    blob = " ".join(t for t in texts if t).lower()
    if not blob.strip():
        return None
    if re.search(r"\bremote\b|work from home|wfh|anywhere", blob):
        return True
    if re.search(r"\bon-?site\b|\bin office\b|hybrid", blob):
        return False
    return None
