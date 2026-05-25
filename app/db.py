import sqlite3

DB = "leakos.db"

def init():
    conn = sqlite3.connect(DB)
    c = conn.cursor()

    c.execute("""
    CREATE TABLE IF NOT EXISTS scans (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        total REAL
    )
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        payload TEXT
    )
    """)

    conn.commit()
    conn.close()

def save_scan(scan_id, user_id, total):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT INTO scans VALUES (?,?,?)", (scan_id, user_id, total))
    conn.commit()
    conn.close()

def save_event(event_type, payload):
    conn = sqlite3.connect(DB)
    c = conn.cursor()
    c.execute("INSERT INTO events(type,payload) VALUES (?,?)", (event_type, str(payload)))
    conn.commit()
    conn.close()
