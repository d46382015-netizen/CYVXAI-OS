#!/usr/bin/env python3
from __future__ import annotations

import fcntl
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVENTS = ROOT / "data" / "events.jsonl"


def main() -> int:
    if len(sys.argv) < 3:
        print("usage: record.py EVENT STATUS [DETAIL]", file=sys.stderr)
        return 2
    event = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event": sys.argv[1],
        "status": sys.argv[2],
        "detail": sys.argv[3] if len(sys.argv) > 3 else "",
    }
    EVENTS.parent.mkdir(parents=True, exist_ok=True)
    with EVENTS.open("a", encoding="utf-8") as handle:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        handle.write(json.dumps(event, separators=(",", ":")) + "\n")
        handle.flush()
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
