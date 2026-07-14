from django.urls import path

from . import views

urlpatterns = [
    path("auth/register/", views.register),
    path("auth/login/", views.login),
    path("games/", views.games),
    path("games/<int:game_id>/", views.game_detail),
    path("games/<int:game_id>/join/", views.join),
    path("pieces/", views.pieces),
]
