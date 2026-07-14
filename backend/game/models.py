from django.conf import settings
from django.db import models

from .logic import COLORS, empty_board
from .pieces import ALL_PIECE_IDS


def all_pieces():
    return list(ALL_PIECE_IDS)


class Game(models.Model):
    STATUS_WAITING = "waiting"
    STATUS_ACTIVE = "active"
    STATUS_FINISHED = "finished"
    STATUS_CHOICES = [
        (STATUS_WAITING, "Waiting for players"),
        (STATUS_ACTIVE, "In progress"),
        (STATUS_FINISHED, "Finished"),
    ]

    name = models.CharField(max_length=80)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_WAITING)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_games"
    )
    board = models.JSONField(default=empty_board)
    # Index into COLORS of the color whose turn it is.
    current_turn = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.status})"

    @property
    def current_color(self):
        return COLORS[self.current_turn]


class GamePlayer(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="players")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="game_seats"
    )
    color = models.CharField(max_length=6)
    remaining_pieces = models.JSONField(default=all_pieces)
    last_piece = models.CharField(max_length=3, blank=True, default="")
    is_blocked = models.BooleanField(default=False)
    score = models.IntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["game", "color"], name="unique_color_per_game"),
            models.UniqueConstraint(fields=["game", "user"], name="unique_user_per_game"),
        ]

    def __str__(self):
        return f"{self.user.username} as {self.color} in {self.game_id}"


class Move(models.Model):
    game = models.ForeignKey(Game, on_delete=models.CASCADE, related_name="moves")
    player = models.ForeignKey(GamePlayer, on_delete=models.CASCADE, related_name="moves")
    number = models.PositiveIntegerField()
    piece = models.CharField(max_length=3)
    orientation = models.PositiveSmallIntegerField()
    x = models.PositiveSmallIntegerField()
    y = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(fields=["game", "number"], name="unique_move_number"),
        ]
