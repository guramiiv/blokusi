"""The 21 Blokus polyomino pieces and their orientations.

Each piece is a list of (x, y) cells. Orientations are precomputed:
all unique rotations/reflections, normalized so min x = min y = 0.
"""

PIECES = {
    # 1 square
    "I1": [(0, 0)],
    # 2 squares
    "I2": [(0, 0), (1, 0)],
    # 3 squares
    "I3": [(0, 0), (1, 0), (2, 0)],
    "V3": [(0, 0), (1, 0), (1, 1)],
    # 4 squares
    "I4": [(0, 0), (1, 0), (2, 0), (3, 0)],
    "O4": [(0, 0), (1, 0), (0, 1), (1, 1)],
    "T4": [(0, 0), (1, 0), (2, 0), (1, 1)],
    "L4": [(0, 0), (1, 0), (2, 0), (2, 1)],
    "S4": [(0, 0), (1, 0), (1, 1), (2, 1)],
    # 5 squares (the 12 pentominoes)
    "F": [(1, 0), (2, 0), (0, 1), (1, 1), (1, 2)],
    "I5": [(0, 0), (1, 0), (2, 0), (3, 0), (4, 0)],
    "L5": [(0, 0), (1, 0), (2, 0), (3, 0), (3, 1)],
    "N": [(0, 0), (1, 0), (1, 1), (2, 1), (3, 1)],
    "P": [(0, 0), (1, 0), (0, 1), (1, 1), (0, 2)],
    "T5": [(0, 0), (1, 0), (2, 0), (1, 1), (1, 2)],
    "U": [(0, 0), (2, 0), (0, 1), (1, 1), (2, 1)],
    "V5": [(0, 0), (0, 1), (0, 2), (1, 2), (2, 2)],
    "W": [(0, 0), (0, 1), (1, 1), (1, 2), (2, 2)],
    "X": [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)],
    "Y": [(1, 0), (0, 1), (1, 1), (1, 2), (1, 3)],
    "Z5": [(0, 0), (1, 0), (1, 1), (1, 2), (2, 2)],
}

ALL_PIECE_IDS = list(PIECES.keys())


def _normalize(cells):
    min_x = min(c[0] for c in cells)
    min_y = min(c[1] for c in cells)
    return tuple(sorted((x - min_x, y - min_y) for x, y in cells))


def _rotate90(cells):
    # (x, y) -> (y, -x)
    return [(y, -x) for x, y in cells]


def _flip(cells):
    # mirror horizontally: (x, y) -> (-x, y)
    return [(-x, y) for x, y in cells]


def _orientations(cells):
    """All unique orientations of a piece, in a stable order."""
    seen = []
    current = list(cells)
    for _ in range(2):
        for _ in range(4):
            norm = _normalize(current)
            if norm not in seen:
                seen.append(norm)
            current = _rotate90(current)
        current = _flip(current)
    return [list(o) for o in seen]


# piece_id -> list of orientations; each orientation is a list of (x, y)
ORIENTATIONS = {pid: _orientations(cells) for pid, cells in PIECES.items()}

PIECE_SIZES = {pid: len(cells) for pid, cells in PIECES.items()}
