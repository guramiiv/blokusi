"""Finished games keep only their final board and scores; move history
is now deleted at finish. Purge the moves of games that finished before
this change."""

from django.db import migrations


def purge_finished_moves(apps, schema_editor):
    Move = apps.get_model("game", "Move")
    Move.objects.filter(game__status="finished").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("game", "0003_game_human_seats"),
    ]

    operations = [
        migrations.RunPython(purge_finished_moves, migrations.RunPython.noop),
    ]
