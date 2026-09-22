import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
COOKIE_FILE = BACKEND_DIR / "wellfound_cookies.json"

def main() -> None:
    raw = " ".join(sys.argv[1:]).strip()
    if not raw:
        raw = input("Paste the datadome cookie value: ").strip()
    if "datadome=" in raw:
        raw = raw.split("datadome=", 1)[1].split(";", 1)[0].strip()
    if not raw:
        sys.exit("empty cookie")
    COOKIE_FILE.write_text(json.dumps({"datadome": raw}, indent=1))
    print(f"saved to {COOKIE_FILE}")

if __name__ == "__main__":
    main()
