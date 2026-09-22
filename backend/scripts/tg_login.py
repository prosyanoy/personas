import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
load_dotenv(BACKEND_DIR / ".env")

from telethon import TelegramClient

api_id = os.getenv("TG_API_ID")
api_hash = os.getenv("TG_API_HASH")
if not api_id or not api_hash:
    sys.exit("TG_API_ID / TG_API_HASH missing from backend/.env")

client = TelegramClient(str(BACKEND_DIR / "tg_session"), int(api_id), api_hash)

async def main():
    await client.start()
    me = await client.get_me()
    print(f"Logged in as {me.first_name} (@{me.username})")
    print(f"Session saved to {BACKEND_DIR / 'tg_session.session'}")

with client:
    client.loop.run_until_complete(main())
