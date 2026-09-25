import json
import random
import sqlite3
import threading
from pathlib import Path
from uuid import UUID, uuid4

from app.schemas import IngestProfile, ProfileOut, ResumeFields
from app.scout.models import JobPosting

DB_PATH = Path(__file__).resolve().parent.parent / "personas.db"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None

def _connect() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS resume_profiles (
                id TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_size INTEGER,
                fields TEXT NOT NULL,
                raw_text TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
            """
        )
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                dedupe_key TEXT PRIMARY KEY,
                source TEXT NOT NULL,
                external_id TEXT,
                payload TEXT NOT NULL,
                posted_at TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
            """
        )
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS shared_questions (
                id TEXT PRIMARY KEY,
                profile_id TEXT,
                author TEXT NOT NULL,
                question TEXT NOT NULL,
                topic TEXT,
                skills TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
            """
        )
        _conn.execute(
            """
            CREATE TABLE IF NOT EXISTS question_answers (
                id TEXT PRIMARY KEY,
                question_id TEXT NOT NULL,
                author TEXT NOT NULL,
                body TEXT NOT NULL,
                likes INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
            """
        )
        qcols = {r[1] for r in _conn.execute("PRAGMA table_info(shared_questions)")}
        if "kind" not in qcols:
            _conn.execute(
                "ALTER TABLE shared_questions ADD COLUMN kind TEXT NOT NULL DEFAULT 'unknown'"
            )
        if "description" not in qcols:
            _conn.execute("ALTER TABLE shared_questions ADD COLUMN description TEXT")
        for table in ('resume_profiles', 'shared_questions', 'question_answers'):
            columns = {r[1] for r in _conn.execute(f'PRAGMA table_info({table})')}
            if 'user_id' not in columns:
                _conn.execute(f'ALTER TABLE {table} ADD COLUMN user_id TEXT')
            _conn.execute(f'CREATE INDEX IF NOT EXISTS {table}_user ON {table}(user_id)')
        _conn.executescript('''
            CREATE TABLE IF NOT EXISTS auth_users (
                id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
                onboarding_completed INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS auth_sessions (
                token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS auth_challenges (
                id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, purpose TEXT NOT NULL,
                code_hash TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at REAL NOT NULL,
                expires_at REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
                used INTEGER NOT NULL DEFAULT 0, delivered INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS challenges_email_time ON auth_challenges(email, created_at);
            CREATE INDEX IF NOT EXISTS challenges_ip_time ON auth_challenges(ip_hash, created_at);
        ''')
        _conn.commit()
    return _conn

def insert_profile(profile_id: UUID, body: IngestProfile, user_id: str) -> ProfileOut:
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT INTO resume_profiles (id, source, file_name, file_size, fields, raw_text, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (str(profile_id), body.source, body.fileName, body.fileSize,
             body.fields.model_dump_json(), body.rawText, user_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM resume_profiles WHERE id = ?", (str(profile_id),)
        ).fetchone()
    return _to_out(row)

def update_profile_fields(profile_id: UUID, patch: dict, user_id: str) -> ProfileOut | None:
    with _lock:
        conn = _connect()
        row = conn.execute(
            "SELECT fields FROM resume_profiles WHERE id = ? AND user_id = ?", (str(profile_id), user_id)
        ).fetchone()
        if row is None:
            return None
        fields = json.loads(row["fields"])
        fields.update({k: v for k, v in patch.items() if v is not None})
        conn.execute(
            "UPDATE resume_profiles SET fields = ? WHERE id = ?",
            (json.dumps(fields), str(profile_id)),
        )
        conn.commit()
    return get_profile(profile_id, user_id)

def get_profile(profile_id: UUID, user_id: str) -> ProfileOut | None:
    row = _connect().execute(
        "SELECT * FROM resume_profiles WHERE id = ? AND user_id = ?", (str(profile_id), user_id)
    ).fetchone()
    return _to_out(row) if row else None

def list_profiles(user_id: str) -> list[ProfileOut]:
    rows = _connect().execute(
        "SELECT * FROM resume_profiles WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", (user_id,)
    ).fetchall()
    return [_to_out(r) for r in rows]

def _to_out(row: sqlite3.Row) -> ProfileOut:
    return ProfileOut(
        id=UUID(row["id"]),
        source=row["source"],
        fileName=row["file_name"],
        fields=ResumeFields.model_validate(json.loads(row["fields"])),
        createdAt=row["created_at"],
    )

def save_jobs(jobs: list[JobPosting]) -> int:
    if not jobs:
        return 0
    with _lock:
        conn = _connect()
        conn.executemany(
            """
            INSERT INTO jobs (dedupe_key, source, external_id, payload, posted_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(dedupe_key) DO UPDATE SET
                payload = excluded.payload,
                posted_at = excluded.posted_at
            """,
            [
                (
                    j.dedupe_key,
                    j.source,
                    j.external_id,
                    j.model_dump_json(),
                    j.posted_at.isoformat() if j.posted_at else None,
                )
                for j in jobs
            ],
        )
        conn.commit()
    return len(jobs)

def list_jobs(source: str | None = None, limit: int = 500) -> list[JobPosting]:
    sql = "SELECT payload FROM jobs"
    args: tuple = ()
    if source:
        sql += " WHERE source = ?"
        args = (source,)
    sql += " ORDER BY COALESCE(posted_at, created_at) DESC LIMIT ?"
    args += (limit,)
    rows = _connect().execute(sql, args).fetchall()
    out = []
    for r in rows:
        try:
            out.append(JobPosting.model_validate(json.loads(r["payload"])))
        except Exception:
            continue
    return out

_PEERS = [
    ("Neha K.", "NK", "#059669"),
    ("Rohit P.", "RP", "#0e7490"),
    ("Tina L.", "TL", "#7c3aed"),
    ("Arjun M.", "AM", "#0f62fe"),
]
_PEER_BODIES = [
    "Got this exact one last week — I framed it around a concrete incident and it landed well.",
    "I would answer with the STAR format here: situation first, then the trade-off you chose.",
    "This came up in my loop too. The interviewer was probing for real production experience.",
    "I struggled with this one — ended up sketching the approach on a whiteboard first.",
]

def share_questions(
    profile_id: str | None,
    author: str,
    items: list[dict],
    user_id: str,
    seed_replies: bool = False,
) -> list[str]:
    ids = []
    with _lock:
        conn = _connect()
        for it in items:
            existing = conn.execute(
                "SELECT id FROM shared_questions WHERE user_id = ? AND profile_id IS ? AND kind = 'unknown' AND question = ?",
                (user_id, profile_id, it['question']),
            ).fetchone()
            if existing:
                ids.append(existing['id'])
                continue
            qid = uuid4().hex
            conn.execute(
                "INSERT INTO shared_questions (id, profile_id, author, question, topic, skills, kind, description, user_id) VALUES (?, ?, ?, ?, ?, ?, 'unknown', ?, ?)",
                (qid, profile_id, author, it["question"], it.get("topic"), json.dumps(it.get("skills") or []), it.get("description"), user_id),
            )
            ids.append(qid)
            if seed_replies:
                for author_name, _ini, _col in random.sample(_PEERS, k=random.randint(1, 2)):
                    conn.execute(
                        "INSERT INTO question_answers (id, question_id, author, body, likes) VALUES (?, ?, ?, ?, ?)",
                        (uuid4().hex, qid, author_name, random.choice(_PEER_BODIES), random.randint(2, 24)),
                    )
        conn.commit()
    return ids

def post_question(
    profile_id: str | None,
    author: str,
    question: str,
    description: str | None,
    topic: str | None,
    skills: list[str],
    user_id: str,
) -> str:
    qid = uuid4().hex
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT INTO shared_questions (id, profile_id, author, question, topic, skills, kind, description, user_id) VALUES (?, ?, ?, ?, ?, ?, 'post', ?, ?)",
            (qid, profile_id, author, question, topic, json.dumps(skills), description, user_id),
        )
        conn.commit()
    return qid

_PEER_QUESTIONS: list[dict] = [
    {
        "author": "Priya S.",
        "question": "How do you explain a useEffect race condition without fumbling the cleanup semantics?",
        "description": "Interviewer asked me to walk through fetch-in-effect gone wrong and I blanked on the exact sequencing.",
        "topic": "Frontend",
        "skills": ["react", "typescript"],
        "answers": [
            ("Arjun M.", "I always anchor on 'the effect re-runs when deps change — cleanup runs first'. Then show the stale-closure fetch and the AbortController fix. Concrete beats theoretical."),
            ("Neha K.", "Draw the timeline on the whiteboard: render → commit → effect → cleanup → effect. They want to see you know when cleanup fires."),
            ("Rohit P.", "Mention React 18 strict mode double-invoking effects in dev — that's usually the follow-up question."),
        ],
    },
    {
        "author": "Tina L.",
        "question": "System design: how would you design a rate limiter for a public API?",
        "description": None,
        "topic": "System Design",
        "skills": ["system design", "redis"],
        "answers": [
            ("Arjun M.", "Token bucket in Redis with a Lua script for atomicity — state the QPS target first, they want numbers."),
            ("Priya S.", "Ask about per-user vs per-IP vs per-tenant limits before proposing anything. Scoping is half the answer."),
            ("Kabir J.", "Sliding window log is more accurate but heavier; token bucket is the safe default. Know both trade-offs."),
            ("Neha K.", "Don't forget the response side: 429 + Retry-After header, and what the client should do."),
        ],
    },
    {
        "author": "Rohit P.",
        "question": "Explain the GIL to someone who thinks Python is single-threaded",
        "description": "Got asked this in a screening round — how deep do they expect you to go?",
        "topic": "Data",
        "skills": ["python"],
        "answers": [
            ("Kabir J.", "60 seconds version: GIL serializes bytecode execution, so threads help for I/O but not CPU. Then name the escapes: multiprocessing, C extensions, free-threaded 3.13."),
            ("Tina L.", "I drew a CPU-bound vs I/O-bound chart. The interviewer nodded and moved on — they want clarity, not CPython internals."),
        ],
    },
    {
        "author": "Neha K.",
        "question": "Product sense: 'Design a feature to improve LinkedIn job applications' — where do you start?",
        "description": None,
        "topic": "Product",
        "skills": ["product management", "analytics"],
        "answers": [
            ("Priya S.", "Clarify the metric first — applications sent? quality? response rate? Then pick a user segment and pain point before ideating."),
            ("Arjun M.", "I framed it as a funnel problem: discovery → click → apply → response. Fixing the weakest step first is an easy structure."),
            ("Kabir J.", "Mention edge cases: ghost postings, applicant spam, recruiter latency. Shows you've thought about the ecosystem."),
        ],
    },
    {
        "author": "Kabir J.",
        "question": "Behavioral deep-dive: 'Tell me about a time you disagreed with your manager' — how honest is too honest?",
        "description": "I have a real story but it makes my ex-manager look bad. Should I sanitize it?",
        "topic": "HR",
        "skills": ["stakeholder management"],
        "answers": [
            ("Tina L.", "Use the real story but center it on the *disagreement mechanics*: what data you brought, how you committed after the decision. Never dwell on the person."),
            ("Rohit P.", "Rule of thumb: if the story ends with 'and I was right', pick a different story. They want commitment-after-disagreement."),
        ],
    },
    {
        "author": "Arjun M.",
        "question": "How do you answer 'why is my PostgreSQL query suddenly slow' when you can't see the DB?",
        "description": "On-call scenario question. They gave me a symptom and 10 minutes.",
        "topic": "Data",
        "skills": ["postgresql", "sql"],
        "answers": [
            ("Priya S.", "Verbalize the checklist: EXPLAIN plan, recent stats/autovacuum, index usage, lock contention. They score the method, not the guess."),
            ("Neha K.", "Say 'parameter sniffing' at least once — plan regression after stats change is the classic answer."),
        ],
    },
    {
        "author": "Priya S.",
        "question": "When would you pick Kubernetes over a simple Docker Compose deploy?",
        "description": None,
        "topic": "System Design",
        "skills": ["kubernetes", "docker"],
        "answers": [
            ("Arjun M.", "Answer with costs first: operational overhead, team size, failure blast radius. 'K8s when you need self-healing multi-node scheduling' is the honest take."),
            ("Kabir J.", "I said 'probably never at my scale' and justified it — interviewer loved it. They test conviction, not YAML."),
        ],
    },
    {
        "author": "Neha K.",
        "question": "HR asked 'what's your expected CTC' in round 1 — how do you deflect without being weird?",
        "description": None,
        "topic": "HR",
        "skills": [],
        "answers": [
            ("Tina L.", "Give a researched range anchored to the market, not your current pay. 'Based on the scope, I'm expecting X–Y, open to discussing the full package' worked for me."),
            ("Rohit P.", "I ask for the band first. If they won't share, I give a wide range and move on — a refusal to answer reads worse than a number."),
        ],
    },
]

def _seed_peer_questions(conn: sqlite3.Connection) -> None:
    have = conn.execute(
        "SELECT COUNT(*) AS n FROM shared_questions WHERE kind = 'peer'"
    ).fetchone()["n"]
    if have:
        return
    for q in _PEER_QUESTIONS:
        qid = uuid4().hex
        conn.execute(
            "INSERT INTO shared_questions (id, profile_id, author, question, topic, skills, kind, description) VALUES (?, NULL, ?, ?, ?, ?, 'peer', ?)",
            (qid, q["author"], q["question"], q["topic"], json.dumps(q["skills"]), q["description"]),
        )
        for author_name, body in q["answers"]:
            conn.execute(
                "INSERT INTO question_answers (id, question_id, author, body, likes) VALUES (?, ?, ?, ?, ?)",
                (uuid4().hex, qid, author_name, body, random.randint(2, 24)),
            )
    conn.commit()

def list_shared_questions() -> list[sqlite3.Row]:
    with _lock:
        conn = _connect()
        _seed_peer_questions(conn)
        return conn.execute(
            "SELECT * FROM shared_questions ORDER BY created_at DESC LIMIT 100"
        ).fetchall()

def list_answers(question_id: str) -> list[sqlite3.Row]:
    return _connect().execute(
        "SELECT * FROM question_answers WHERE question_id = ? ORDER BY created_at",
        (question_id,),
    ).fetchall()

def add_answer(question_id: str, author: str, body: str, user_id: str) -> None:
    with _lock:
        conn = _connect()
        conn.execute(
            "INSERT INTO question_answers (id, question_id, author, body, user_id) VALUES (?, ?, ?, ?, ?)",
            (uuid4().hex, question_id, author, body, user_id),
        )
        conn.commit()

def list_profile_questions(user_id: str) -> list[sqlite3.Row]:
    return _connect().execute(
        "SELECT * FROM shared_questions WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    ).fetchall()
