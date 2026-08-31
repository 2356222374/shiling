"""访问统计 - SQLite 持久化（写入走后台线程，不阻塞请求）"""

import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue

BASE_DIR = Path(__file__).parent
DB_PATH = Path(os.getenv("STATS_DB_PATH", str(BASE_DIR / "data" / "stats.db")))


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_iso(dt: datetime | None = None) -> str:
    return (dt or _utc_now()).isoformat()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _connect() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS visits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                user_agent TEXT DEFAULT '',
                visited_at TEXT NOT NULL,
                visit_date TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
            CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits(ip);
            CREATE INDEX IF NOT EXISTS idx_visits_endpoint ON visits(endpoint);
        """)


@contextmanager
def _connect():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


_write_queue: Queue = Queue()
_writer_started = False


def _writer_loop():
    while True:
        item = _write_queue.get()
        if item is None:
            break
        try:
            with _connect() as conn:
                conn.execute(
                    "INSERT INTO visits (ip, endpoint, user_agent, visited_at, visit_date) VALUES (?, ?, ?, ?, ?)",
                    item,
                )
        except Exception:
            pass


def _ensure_writer():
    global _writer_started
    if not _writer_started:
        _writer_started = True
        t = threading.Thread(target=_writer_loop, daemon=True)
        t.start()


def record_visit(ip: str, endpoint: str, user_agent: str = ""):
    _ensure_writer()
    now = _utc_now()
    _write_queue.put((ip, endpoint, user_agent[:200], _utc_iso(now), now.strftime("%Y-%m-%d")))


def get_client_ip(request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def get_stats_summary(recent_limit: int = 50, ip_limit: int = 50) -> dict:
    with _connect() as conn:
        total_pv = conn.execute("SELECT COUNT(*) FROM visits").fetchone()[0]
        unique_uv = conn.execute("SELECT COUNT(DISTINCT ip) FROM visits").fetchone()[0]

        daily_rows = conn.execute("""
            SELECT visit_date,
                   COUNT(*) AS pv,
                   COUNT(DISTINCT ip) AS uv
            FROM visits
            GROUP BY visit_date
            ORDER BY visit_date DESC
            LIMIT 30
        """).fetchall()

        api_rows = conn.execute("""
            SELECT endpoint, COUNT(*) AS cnt
            FROM visits
            GROUP BY endpoint
            ORDER BY cnt DESC
        """).fetchall()

        recent_rows = conn.execute("""
            SELECT ip, endpoint, visited_at, user_agent
            FROM visits
            ORDER BY id DESC
            LIMIT ?
        """, (recent_limit,)).fetchall()

        ip_rows = conn.execute("""
            SELECT ip,
                   COUNT(*) AS visit_count,
                   MIN(visited_at) AS first_seen,
                   MAX(visited_at) AS last_seen
            FROM visits
            GROUP BY ip
            ORDER BY visit_count DESC, last_seen DESC
            LIMIT ?
        """, (ip_limit,)).fetchall()

        first_visit = conn.execute("SELECT MIN(visited_at) FROM visits").fetchone()[0]

    daily_pv = {r["visit_date"]: r["pv"] for r in daily_rows}
    daily_uv = {r["visit_date"]: r["uv"] for r in daily_rows}

    return {
        "db_path": str(DB_PATH),
        "tracking_since": first_visit,
        "total_page_views": total_pv,
        "unique_visitors": unique_uv,
        "api_calls": {r["endpoint"]: r["cnt"] for r in api_rows},
        "daily_pv_last_30days": daily_pv,
        "daily_uv_last_30days": daily_uv,
        "recent_visits": [dict(r) for r in recent_rows],
        "ip_summary": [dict(r) for r in ip_rows],
    }
