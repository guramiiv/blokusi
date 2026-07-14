from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.db.models import Count
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import state
from .models import Game, GamePlayer
from .state import MoveError


@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    username = (request.data.get("username") or "").strip()
    password = request.data.get("password") or ""
    if len(username) < 3:
        return Response({"error": "Username must be at least 3 characters."}, status=400)
    if len(password) < 6:
        return Response({"error": "Password must be at least 6 characters."}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return Response({"error": "That username is taken."}, status=400)
    user = User.objects.create_user(username=username, password=password)
    token = Token.objects.create(user=user)
    return Response({"token": token.key, "username": user.username}, status=201)


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    user = authenticate(
        username=request.data.get("username"), password=request.data.get("password")
    )
    if user is None:
        return Response({"error": "Invalid username or password."}, status=400)
    token, _ = Token.objects.get_or_create(user=user)
    return Response({"token": token.key, "username": user.username})


@api_view(["GET", "POST"])
def games(request):
    if request.method == "POST":
        name = (request.data.get("name") or "").strip() or f"{request.user.username}'s game"
        game = Game.objects.create(name=name[:80], created_by=request.user)
        state.join_game(game.id, request.user)
        game = Game.objects.annotate(seat_count=Count("players")).get(pk=game.id)
        return Response(_summary(game), status=201)

    open_games = (
        Game.objects.annotate(seat_count=Count("players"))
        .filter(status=Game.STATUS_WAITING)
        .select_related("created_by")[:50]
    )
    my_games = (
        Game.objects.annotate(seat_count=Count("players"))
        .filter(players__user=request.user)
        .exclude(status=Game.STATUS_FINISHED)
        .select_related("created_by")[:50]
    )
    return Response(
        {
            "open": [_summary(g) for g in open_games],
            "mine": [_summary(g) for g in my_games],
        }
    )


def _summary(game):
    return {
        "id": game.id,
        "name": game.name,
        "status": game.status,
        "created_by": game.created_by.username,
        "player_count": game.seat_count,
    }


@api_view(["POST"])
def join(request, game_id):
    try:
        game = state.join_game(game_id, request.user)
    except Game.DoesNotExist:
        return Response({"error": "Game not found."}, status=404)
    except MoveError as e:
        return Response({"error": str(e)}, status=400)
    # Tell everyone already in the room that the seats (or status) changed.
    async_to_sync(get_channel_layer().group_send)(
        f"game_{game.id}", {"type": "game_state_changed"}
    )
    return Response({"id": game.id, "status": game.status})


@api_view(["GET"])
def game_detail(request, game_id):
    try:
        game = Game.objects.get(pk=game_id)
    except Game.DoesNotExist:
        return Response({"error": "Game not found."}, status=404)
    return Response(state.serialize_game(game, for_user=request.user))


@api_view(["GET"])
@permission_classes([AllowAny])
def pieces(request):
    return Response(state.piece_shapes())


@api_view(["GET"])
def leaderboard(request):
    """Top players across finished games: wins, games played, total points."""
    players = GamePlayer.objects.filter(
        game__status=Game.STATUS_FINISHED
    ).select_related("user")

    best = {}  # game_id -> winning score
    for p in players:
        if p.score is not None:
            best[p.game_id] = max(best.get(p.game_id, p.score), p.score)

    stats = {}
    for p in players:
        s = stats.setdefault(
            p.user_id,
            {"username": p.user.username, "games": 0, "wins": 0, "points": 0},
        )
        s["games"] += 1
        s["points"] += p.score or 0
        if p.score is not None and p.score == best.get(p.game_id):
            s["wins"] += 1

    top = sorted(
        stats.values(), key=lambda s: (-s["wins"], -s["points"], s["username"])
    )[:10]
    return Response(top)
