"""Blokus rules engine: placement validation, blocking detection, scoring.

Board is a 20x20 grid stored as a list of lists;
board[y][x] is None (empty) or a color string.
Colors play in the fixed order: blue, yellow, red, green.
"""

from .pieces import ORIENTATIONS, PIECE_SIZES

BOARD_SIZE = 20
COLORS = ["blue", "yellow", "red", "green"]

# Each color starts in its own corner (classic board layout).
START_CORNERS = {
    "blue": (0, 0),
    "yellow": (BOARD_SIZE - 1, 0),
    "red": (BOARD_SIZE - 1, BOARD_SIZE - 1),
    "green": (0, BOARD_SIZE - 1),
}

EDGE_NEIGHBORS = [(1, 0), (-1, 0), (0, 1), (0, -1)]
DIAG_NEIGHBORS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]


def empty_board():
    return [[None] * BOARD_SIZE for _ in range(BOARD_SIZE)]


def placement_cells(piece_id, orientation_index, x, y):
    """Absolute board cells for a piece placed with its normalized
    origin at (x, y). Returns None if orientation index is invalid."""
    orientations = ORIENTATIONS.get(piece_id)
    if orientations is None or not (0 <= orientation_index < len(orientations)):
        return None
    return [(x + dx, y + dy) for dx, dy in orientations[orientation_index]]


def validate_placement(board, color, piece_id, orientation_index, x, y, is_first_move):
    """Return (ok, error_message). Checks all Blokus placement rules."""
    cells = placement_cells(piece_id, orientation_index, x, y)
    if cells is None:
        return False, "Unknown piece or orientation."

    touches_own_corner = False
    for cx, cy in cells:
        if not (0 <= cx < BOARD_SIZE and 0 <= cy < BOARD_SIZE):
            return False, "Piece is out of bounds."
        if board[cy][cx] is not None:
            return False, "Those squares are already occupied."
        # Same color may never share an edge.
        for dx, dy in EDGE_NEIGHBORS:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < BOARD_SIZE and 0 <= ny < BOARD_SIZE:
                if board[ny][nx] == color:
                    return False, "Pieces of the same color cannot touch along an edge."
        for dx, dy in DIAG_NEIGHBORS:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < BOARD_SIZE and 0 <= ny < BOARD_SIZE:
                if board[ny][nx] == color:
                    touches_own_corner = True

    if is_first_move:
        if START_CORNERS[color] not in cells:
            return False, "Your first piece must cover your starting corner."
    elif not touches_own_corner:
        return False, "Each new piece must touch a piece of your color at a corner."

    return True, None


def apply_placement(board, color, piece_id, orientation_index, x, y):
    for cx, cy in placement_cells(piece_id, orientation_index, x, y):
        board[cy][cx] = color


def has_any_move(board, color, remaining_piece_ids, is_first_move):
    """True if the color can legally place at least one remaining piece."""
    candidates = _candidate_anchors(board, color, is_first_move)
    if not candidates:
        return False
    for piece_id in remaining_piece_ids:
        for oi, cells in enumerate(ORIENTATIONS[piece_id]):
            for ax, ay in candidates:
                # Try aligning each cell of the piece onto the anchor.
                for dx, dy in cells:
                    ok, _ = validate_placement(
                        board, color, piece_id, oi, ax - dx, ay - dy, is_first_move
                    )
                    if ok:
                        return True
    return False


def _candidate_anchors(board, color, is_first_move):
    """Empty cells where a new piece of this color could have a cell:
    the starting corner on the first move, otherwise cells diagonally
    adjacent to the color's existing pieces."""
    if is_first_move:
        cx, cy = START_CORNERS[color]
        return [] if board[cy][cx] is not None else [(cx, cy)]
    anchors = set()
    for y in range(BOARD_SIZE):
        for x in range(BOARD_SIZE):
            if board[y][x] != color:
                continue
            for dx, dy in DIAG_NEIGHBORS:
                nx, ny = x + dx, y + dy
                if 0 <= nx < BOARD_SIZE and 0 <= ny < BOARD_SIZE and board[ny][nx] is None:
                    anchors.add((nx, ny))
    return list(anchors)


def score(remaining_piece_ids, last_piece_id):
    """Blokus scoring: -1 per unit square left; +15 if all placed,
    +5 more if the last piece placed was the single square."""
    if not remaining_piece_ids:
        return 20 if last_piece_id == "I1" else 15
    return -sum(PIECE_SIZES[pid] for pid in remaining_piece_ids)
