"""End-to-end check: 4 users register, create/join a game over REST,
then play a full game over WebSockets until it finishes.

Run:  venv/bin/python e2e_check.py
"""

import asyncio
import json
import random
import urllib.request

import websockets

API = "http://localhost:8000/api"
WS = "ws://localhost:8000/ws"


def post(path, body, token=None):
    req = urllib.request.Request(
        f"{API}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if token:
        req.add_header("Authorization", f"Token {token}")
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


async def main():
    import time

    suffix = int(time.time())
    random.seed(suffix)

    # register 4 users
    tokens = {}
    for i in range(4):
        name = f"e2e_{suffix}_{i}"
        res = post("/auth/register/", {"username": name, "password": "secret123"})
        tokens[name] = res["token"]
    users = list(tokens)
    print("registered:", users)

    # user 0 creates, others join
    game = post("/games/", {"name": "e2e game"}, tokens[users[0]])
    gid = game["id"]
    for u in users[1:]:
        post(f"/games/{gid}/join/", {}, tokens[u])
    print(f"game {gid} created and joined by 4 players")

    # connect all four over websockets
    conns = {}
    states = {}
    for u in users:
        ws = await websockets.connect(
            f"{WS}/game/{gid}/?token={tokens[u]}",
            origin="http://localhost:3000",
        )
        msg = json.loads(await ws.recv())
        assert msg["type"] == "state", msg
        states[u] = msg["game"]
        conns[u] = ws
    assert states[users[0]]["status"] == "active"
    print("all connected; game active; first turn:", states[users[0]]["current_color"])

    color_to_user = {
        p["color"]: p["username"] for p in states[users[0]]["players"]
    }

    # local mirror of rules for move search
    import sys

    sys.path.insert(0, ".")
    import os

    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "blokus.settings")
    from game import logic
    from game.pieces import ALL_PIECE_IDS, ORIENTATIONS

    def find_move(board, color, remaining):
        is_first = len(remaining) == len(ALL_PIECE_IDS)
        anchors = logic._candidate_anchors(board, color, is_first)
        random.shuffle(anchors)
        pieces = sorted(remaining, key=lambda p: -len(ORIENTATIONS[p][0]))
        for pid in pieces:
            for oi in range(len(ORIENTATIONS[pid])):
                for ax, ay in anchors:
                    for dx, dy in ORIENTATIONS[pid][oi]:
                        ok, _ = logic.validate_placement(
                            board, color, pid, oi, ax - dx, ay - dy, is_first
                        )
                        if ok:
                            return pid, oi, ax - dx, ay - dy
        return None

    async def drain_all(current_state):
        """Every connection should receive the broadcast state."""
        newest = current_state
        for u, ws in conns.items():
            msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            while msg["type"] != "state":
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5))
            newest = msg["game"]
        return newest

    state = states[users[0]]
    moves = 0
    rejected_checked = False
    while state["status"] == "active" and moves < 100:
        color = state["current_color"]
        user = color_to_user[color]
        player = next(p for p in state["players"] if p["color"] == color)
        mv = find_move(state["board"], color, player["remaining_pieces"])
        assert mv, f"server says {color} can move but no move found"
        pid, oi, x, y = mv

        # once, try an illegal move first and expect an error back
        if not rejected_checked and moves > 0:
            await conns[user].send(
                json.dumps({"action": "place", "piece": pid, "orientation": oi, "x": 0, "y": 9})
            )
            msg = json.loads(await asyncio.wait_for(conns[user].recv(), timeout=5))
            assert msg["type"] == "error", f"expected rejection, got {msg['type']}"
            print("  illegal move correctly rejected:", msg["message"])
            rejected_checked = True

        await conns[user].send(
            json.dumps({"action": "place", "piece": pid, "orientation": oi, "x": x, "y": y})
        )
        state = await drain_all(state)
        moves += 1

    assert state["status"] == "finished", f"game did not finish ({moves} moves)"
    print(f"\ngame finished after {moves} moves; final scores:")
    for p in sorted(state["players"], key=lambda p: -(p["score"] or 0)):
        print(f"  {p['color']:>6} {p['username']:<20} {p['score']} pts")

    for ws in conns.values():
        await ws.close()
    print("\nE2E CHECK PASSED")


asyncio.run(main())
