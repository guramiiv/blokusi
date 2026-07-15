from django.contrib import admin

from .models import Game, GamePlayer, Move


class GamePlayerInline(admin.TabularInline):
    model = GamePlayer
    extra = 0
    fields = ("user", "color", "is_blocked", "score", "last_piece")


@admin.register(Game)
class GameAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "status", "current_color", "created_by", "created_at", "finished_at")
    list_filter = ("status",)
    search_fields = ("name", "created_by__username")
    inlines = [GamePlayerInline]


@admin.register(GamePlayer)
class GamePlayerAdmin(admin.ModelAdmin):
    list_display = ("id", "game", "user", "color", "is_blocked", "score")
    list_filter = ("color", "is_blocked")
    search_fields = ("user__username", "game__name")


@admin.register(Move)
class MoveAdmin(admin.ModelAdmin):
    list_display = ("id", "game", "number", "player", "piece", "orientation", "x", "y", "created_at")
    list_filter = ("piece",)
    search_fields = ("game__name", "player__user__username")
