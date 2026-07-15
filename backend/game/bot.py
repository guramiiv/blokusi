"""Computer opponent: a simple greedy Blokus player.

Strategy: play the biggest piece that still fits (the standard Blokus
heuristic — small pieces are worth saving for the endgame), at a random
legal placement. Fast enough to run inline on a request/consumer thread.
"""

import random

from . import logic
from .pieces import ORIENTATIONS, PIECE_SIZES


def choose_move(board, color, remaining_piece_ids, is_first_move):
    """Return (piece_id, orientation, x, y) or None if no legal move exists."""
    anchors = logic._candidate_anchors(board, color, is_first_move)
    if not anchors:
        return None
    # Biggest pieces first; equal sizes in random order for variety.
    pieces = sorted(
        remaining_piece_ids, key=lambda p: (-PIECE_SIZES[p], random.random())
    )
    for piece_id in pieces:
        tried = set()
        legal = []
        for oi, cells in enumerate(ORIENTATIONS[piece_id]):
            for ax, ay in anchors:
                # Try aligning each cell of the piece onto the anchor.
                for dx, dy in cells:
                    key = (oi, ax - dx, ay - dy)
                    if key in tried:
                        continue
                    tried.add(key)
                    ok, _ = logic.validate_placement(
                        board, color, piece_id, key[0], key[1], key[2], is_first_move
                    )
                    if ok:
                        legal.append(key)
        if legal:
            oi, x, y = random.choice(legal)
            return piece_id, oi, x, y
    return None
