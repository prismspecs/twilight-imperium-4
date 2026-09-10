#!/usr/bin/env python3
"""
Scrape game data from AsyncTI4 (https://asyncti4.com/) for AI training.

AsyncTI4 exposes a public, unauthenticated JSON API at https://bot.asyncti4.com/api :
  GET /public/game/<gameName>/web-data   -> full final/current game snapshot
                                           (board, players, objectives, scores,
                                            cards, decks, techs, tile units, ...)
  GET /public/game/<gameName>/events     -> the MOVE-BY-MOVE log of a game. Each
                                           event has a seq, round, phase, faction,
                                           a structured payload (the command/action)
                                           and, for moves that mutate the board
                                           (TACTICAL_ACTION & friends), a full
                                           serialised `mapState` board snapshot.
                                           ONLY PRESENT FOR GAMES STILL WITHIN THE
                                           ROLLING ~2-MONTH RETENTION WINDOW: finished
                                           games keep their move log until they age out,
                                           then it is pruned to [] (live / in-progress
                                           games always have it).

Game IDs are of the form pbd<N>, mostly sequential from pbd1 to the current max
(~pbd28xxx at the time of writing) with occasional gaps (a gap returns HTTP 400).
This repo's data/asyncti4/statistics.json already lists 24k+ *finished* game IDs in
its `asyncGameID` field (use --from-dataset to feed from it).

Two scrape modes ("jobs"):
  snapshot  web-data for a set of game IDs  -> final-state corpus (all games,
             finished or live). Good for supervised endgame / win-rate / pick-rate
             learning and calibration.
  events    /events log for a set of game IDs -> MOVE-SEQUENCE corpus. Useful for
             any game still in the retention window (recently-finished OR live);
             old finished games yield empty logs. This is the data you want to
             train an agent to *play*. Collect the ~3.5k finished games in the
             current window (roughly pbd25300-pbd28900) promptly — they age out.

To capture move sequences you must run `events` against the live tail of games
continuously (e.g. a cron that re-scans the live range and pulls each in-progress
game's events before it finishes).

Output layout (under OUT_DIR, default data/asyncti4/raw):
  <gameName>.webdata.json
  <gameName>.events.json

Usage:
  python3 scripts/scrape_asyncti4.py snapshot   --id pbd13921
  python3 scripts/scrape_asyncti4.py snapshot   --ids 13920 13923 15000
  python3 scripts/scrape_asyncti4.py snapshot   --range 13900 13950
  python3 scripts/scrape_asyncti4.py snapshot   --from-dataset          # all IDs in statistics.json
  python3 scripts/scrape_asyncti4.py snapshot   --live                  # probe the live tail, snapshot both
  python3 scripts/scrape_asyncti4.py events     --range 27500 27600     # move logs (live games only)
  python3 scripts/scrape_asyncti4.py discover   --min 1 --max 28800     # list which IDs exist (HTTP 200)
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

BASE = "https://bot.asyncti4.com/api/public/game"
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "..", "data", "asyncti4", "raw")
STATS = os.path.join(os.path.dirname(__file__), "..", "data", "asyncti4", "statistics.json")
# NOTE: the server throttles/delays requests from TLS fingerprints it does not trust
# (e.g. Python's urllib can be stalled ~120s per request), while curl's TLS handshake
# completes in well under a second. So we shell out to curl for every request.
UA = "mecatol-online-ai-scraper/0.1 (training data collector)"


def http_get(url: str) -> tuple[int, bytes]:
    """GET url via curl. Returns (status_code, body_bytes)."""
    try:
        proc = subprocess.run(
            ["curl", "-sS", "--max-time", "60", "-H", f"User-Agent: {UA}", url],
            capture_output=True,
            check=False,
        )
    except FileNotFoundError:
        raise SystemExit("curl not found on PATH; the scraper requires curl (see module docstring)")
    if proc.returncode == 0 and proc.stdout:
        return 200, proc.stdout
    # A non-2xx/HTTP error: curl -sS writes the JSON error body to stdout with the
    # HTTPStatus code on stderr only when using -w. Re-run with -w to capture the code.
    proc2 = subprocess.run(
        ["curl", "-sS", "--max-time", "60", "-o", "/dev/null", "-w", "%{http_code}",
         "-H", f"User-Agent: {UA}", url],
        capture_output=True,
        check=False,
    )
    code = int(proc2.stdout.decode().strip() or "000")
    return code, b""


def fetch_json(game: str, endpoint: str) -> tuple[int, object]:
    status, body = http_get(f"{BASE}/{game}/{endpoint}")
    if status == 200:
        return status, json.loads(body)
    return status, None


def game_state(game: str) -> tuple[int, dict | None]:
    """Return (status, webdata). webdata is None on 400 (game not found)."""
    status, data = fetch_json(game, "web-data")
    return status, data


def snapshot_one(game: str, out_dir: str, capture_events: bool) -> bool:
    status, data = game_state(game)
    if status != 200:
        return False
    state = data.get("gameState", {})
    phase = state.get("phase")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{game}.webdata.json"), "w") as f:
        json.dump(data, f)
    if capture_events:
        _, events = fetch_json(game, "events")
        with open(os.path.join(out_dir, f"{game}.events.json"), "w") as f:
            json.dump(events if events is not None else [], f)
    return True


def ids_from_dataset() -> list[str]:
    with open(STATS) as f:
        games = json.load(f)
    ids = [g.get("asyncGameID") for g in games if isinstance(g, dict) and g.get("asyncGameID")]
    # Some dataset IDs may predate the pbd prefix; normalise + dedupe, keep order.
    seen: set[str] = set()
    out: list[str] = []
    for i in ids:
        s = str(i)
        if not s.startswith("pbd"):
            s = f"pbd{s}"
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("job", choices=["snapshot", "events", "discover"])
    ap.add_argument("--id")
    ap.add_argument("--ids", nargs="*")
    ap.add_argument("--range", nargs=2, type=int, metavar=("MIN", "MAX"))
    ap.add_argument("--from-dataset", action="store_true")
    ap.add_argument("--live", action="store_true", help="probe the live tail (in-progress games)")
    ap.add_argument("--min", type=int, default=1)
    ap.add_argument("--max", type=int, default=28800)
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--sleep", type=float, default=0.35, help="seconds between requests (be polite)")
    args = ap.parse_args()

    games: list[str] = []
    if args.id:
        games = [args.id if args.id.startswith("pbd") else f"pbd{args.id}"]
    if args.ids:
        games = [g if g.startswith("pbd") else f"pbd{g}" for g in args.ids]
    if args.range:
        games = [f"pbd{n}" for n in range(args.range[0], args.range[1] + 1)]
    if args.from_dataset:
        games = ids_from_dataset()
    if args.live:
        games = [f"pbd{n}" for n in range(args.min, args.max + 1)]

    if not games:
        ap.error("specify --id, --ids, --range, --from-dataset, or --live")

    print(f"job={args.job} games={len(games)} out={args.out}")
    found = missing = 0
    t0 = time.time()
    for i, game in enumerate(games):
        if args.job == "discover":
            status, data = game_state(game)
            if status == 200:
                found += 1
                phase = data.get("gameState", {}).get("phase")
                print(f"{game}\t{phase}")
            else:
                missing += 1
            time.sleep(args.sleep)
            continue

        status, data = game_state(game)
        if status == 200:
            found += 1
            if args.job == "events":
                _, events = fetch_json(game, "events")
                os.makedirs(args.out, exist_ok=True)
                with open(os.path.join(args.out, f"{game}.events.json"), "w") as f:
                    json.dump(events if events is not None else [], f)
                print(f"[{i+1}/{len(games)}] {game}: events={len(events) if events else 0} "
                      f"phase={data.get('gameState', {}).get('phase')}")
            else:  # snapshot
                snapshot_one(game, args.out, capture_events=False)
                print(f"[{i+1}/{len(games)}] {game}: webdata ok")
        else:
            missing += 1
        time.sleep(args.sleep)

    dt = time.time() - t0
    print(f"\ndone in {dt:.1f}s: found={found} missing={missing}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        sys.exit(130)
