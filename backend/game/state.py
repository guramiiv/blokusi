"""Game state service: serialization and move handling.

All mutations happen inside a transaction with the game row locked,
so concurrent WebSocket messages cannot corrupt state.
"""

from django.db import transaction
from django.utils import timezone

from . import logic
from .logic import COLORS
from .models import Game, GamePlayer, Move
from .pieces import ORIENTATIONS, PIECES


class MoveError(Exception):
    pass


def serialize_game(game, for_user=None):
    players = {p.color: p for p in game.players.select_related("user")}
    return {
        "id": game.id,
        "name": game.name,
        "status": game.status,
        "board": game.board,
        "current_color": game.current_color if game.status == Game.STATUS_ACTIVE else None,
        "players": [
            {
                "color": color,
                "username": players[color].user.username if color in players else None,
                "remaining_pieces": players[color].remaining_pieces if color in players else [],
                "is_blocked": players[color].is_blocked if color in players else False,
                "score": players[color].score if color in players else None,
                "is_you": bool(
                    for_user
                    and color in players
                    and players[color].user_id == for_user.id
                ),
            }
            for color in COLORS
        ],
        "start_corners": {c: list(xy) for c, xy in logic.START_CORNERS.items()},
    }


def join_game(game_id, user):
    """Seat a user in a waiting game; start the game when full."""
    with transaction.atomic():
        game = Game.objects.select_for_update().get(pk=game_id)
        if game.players.filter(user=user).exists():
            return game  # already seated — rejoin is fine
        if game.status != Game.STATUS_WAITING:
            raise MoveError("This game has already started.")
        taken = set(game.players.values_list("color", flat=True))
        free = [c for c in COLORS if c not in taken]
        if not free:
            raise MoveError("This game is full.")
        GamePlayer.objects.create(game=game, user=user, color=free[0])
        if len(taken) + 1 == 4:
            game.status = Game.STATUS_ACTIVE
            game.save(update_fields=["status"])
        return game


def play_move(game_id, user, piece_id, orientation, x, y):
    """Validate and apply a move. Returns the updated Game.

    Raises MoveError with a player-facing message on any rule violation.
    """
    with transaction.atomic():
        game = Game.objects.select_for_update().get(pk=game_id)
        if game.status != Game.STATUS_ACTIVE:
            raise MoveError("The game is not in progress.")

        try:
            player = game.players.get(user=user)
        except GamePlayer.DoesNotExist:
            raise MoveError("You are not a player in this game.")
        if player.color != game.current_color:
            raise MoveError("It is not your turn.")
        if piece_id not in player.remaining_pieces:
            raise MoveError("You have already played that piece.")

        is_first = len(player.remaining_pieces) == len(PIECES)
        ok, err = logic.validate_placement(
            game.board, player.color, piece_id, orientation, x, y, is_first
        )
        if not ok:
            raise MoveError(err)

        logic.apply_placement(game.board, player.color, piece_id, orientation, x, y)
        player.remaining_pieces = [p for p in player.remaining_pieces if p != piece_id]
        player.last_piece = piece_id
        player.save(update_fields=["remaining_pieces", "last_piece"])

        Move.objects.create(
            game=game,
            player=player,
            number=game.moves.count() + 1,
            piece=piece_id,
            orientation=orientation,
            x=x,
            y=y,
        )

        _advance_turn(game)
        game.save()
        return game


def _advance_turn(game):
    """Move to the next color that can still play; finish the game if none can."""
    players = {p.color: p for p in game.players.all()}
    for step in range(1, 5):
        idx = (game.current_turn + step) % 4
        player = players[COLORS[idx]]
        if player.is_blocked:
            continue
        is_first = len(player.remaining_pieces) == len(PIECES)
        if player.remaining_pieces and logic.has_any_move(
            game.board, player.color, player.remaining_pieces, is_first
        ):
            game.current_turn = idx
            return
        player.is_blocked = True
        player.save(update_fields=["is_blocked"])
    _finish(game, players)


def _finish(game, players):
    game.status = Game.STATUS_FINISHED
    game.finished_at = timezone.now()
    for player in players.values():
        player.score = logic.score(player.remaining_pieces, player.last_piece)
        player.save(update_fields=["score"])


def piece_shapes():
    """Static piece/orientation data for the frontend."""
    return {
        pid: [[list(c) for c in orient] for orient in orients]
        for pid, orients in ORIENTATIONS.items()
    }
