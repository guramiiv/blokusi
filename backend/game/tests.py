from django.contrib.auth.models import User
from django.test import TestCase

from . import bot, logic, state
from .models import Game
from .pieces import ALL_PIECE_IDS, ORIENTATIONS, PIECE_SIZES
from .state import MoveError


class PieceTests(TestCase):
    def test_piece_set_matches_official_rules(self):
        # 21 pieces: 1x1, 1x2, 2x3, 5x4, 12x5 = 89 squares total
        self.assertEqual(len(ALL_PIECE_IDS), 21)
        by_size = {}
        for pid, size in PIECE_SIZES.items():
            by_size.setdefault(size, []).append(pid)
        self.assertEqual(len(by_size[1]), 1)
        self.assertEqual(len(by_size[2]), 1)
        self.assertEqual(len(by_size[3]), 2)
        self.assertEqual(len(by_size[4]), 5)
        self.assertEqual(len(by_size[5]), 12)
        self.assertEqual(sum(PIECE_SIZES.values()), 89)

    def test_orientation_counts(self):
        # Known symmetry classes: X has 1 orientation, sticks have 2, F has 8
        self.assertEqual(len(ORIENTATIONS["X"]), 1)
        self.assertEqual(len(ORIENTATIONS["I1"]), 1)
        self.assertEqual(len(ORIENTATIONS["O4"]), 1)
        self.assertEqual(len(ORIENTATIONS["I5"]), 2)
        self.assertEqual(len(ORIENTATIONS["F"]), 8)
        self.assertEqual(len(ORIENTATIONS["L5"]), 8)
        self.assertEqual(len(ORIENTATIONS["T5"]), 4)


class PlacementTests(TestCase):
    def setUp(self):
        self.board = logic.empty_board()

    def test_first_move_must_cover_corner(self):
        ok, _ = logic.validate_placement(self.board, "blue", "V5", 0, 5, 5, True)
        self.assertFalse(ok)
        ok, _ = logic.validate_placement(self.board, "blue", "V5", 0, 0, 0, True)
        self.assertTrue(ok)

    def test_first_move_corner_is_per_color(self):
        # blue's corner is (0,0); playing on green's corner (0,19) is illegal
        ok, _ = logic.validate_placement(self.board, "blue", "I1", 0, 0, 19, True)
        self.assertFalse(ok)
        ok, _ = logic.validate_placement(self.board, "green", "I1", 0, 0, 19, True)
        self.assertTrue(ok)

    def test_same_color_edge_contact_forbidden(self):
        logic.apply_placement(self.board, "blue", "I2", 0, 0, 0)  # (0,0),(1,0)
        # I2 at (2,0) touches (1,0) along an edge -> illegal
        ok, _ = logic.validate_placement(self.board, "blue", "I2", 0, 2, 0, False)
        self.assertFalse(ok)
        # I2 at (2,1) touches (1,0) only diagonally -> legal
        ok, _ = logic.validate_placement(self.board, "blue", "I2", 0, 2, 1, False)
        self.assertTrue(ok)

    def test_corner_contact_required(self):
        logic.apply_placement(self.board, "blue", "I2", 0, 0, 0)
        # far away, no corner contact -> illegal
        ok, _ = logic.validate_placement(self.board, "blue", "I2", 0, 10, 10, False)
        self.assertFalse(ok)

    def test_different_colors_may_touch_edges(self):
        logic.apply_placement(self.board, "blue", "I2", 0, 0, 0)
        logic.apply_placement(self.board, "yellow", "I2", 0, 18, 0)
        # yellow edge-adjacent to blue is fine (corner contact with own color)
        ok, _ = logic.validate_placement(self.board, "yellow", "I2", 0, 16, 1, False)
        self.assertTrue(ok)

    def test_overlap_and_bounds(self):
        logic.apply_placement(self.board, "blue", "O4", 0, 0, 0)
        ok, _ = logic.validate_placement(self.board, "yellow", "I1", 0, 0, 0, False)
        self.assertFalse(ok)
        ok, _ = logic.validate_placement(self.board, "yellow", "I5", 0, 18, 0, True)
        self.assertFalse(ok)  # runs off the right edge

    def test_scoring(self):
        self.assertEqual(logic.score([], "I1"), 20)   # all placed, mono last
        self.assertEqual(logic.score([], "T5"), 15)   # all placed
        self.assertEqual(logic.score(["I5", "T4"], "X"), -9)


class GameFlowTests(TestCase):
    def setUp(self):
        self.users = [
            User.objects.create_user(f"player{i}", password="pass123456")
            for i in range(4)
        ]
        self.game = Game.objects.create(name="test", created_by=self.users[0])
        for u in self.users:
            state.join_game(self.game.id, u)
        self.game.refresh_from_db()

    def user_for(self, color):
        return self.game.players.get(color=color).user

    def test_game_starts_when_four_join(self):
        self.assertEqual(self.game.status, Game.STATUS_ACTIVE)
        self.assertEqual(self.game.current_color, "blue")

    def test_fifth_player_rejected(self):
        extra = User.objects.create_user("extra", password="pass123456")
        with self.assertRaises(MoveError):
            state.join_game(self.game.id, extra)

    def test_turn_rotation_and_rule_enforcement(self):
        blue = self.user_for("blue")
        yellow = self.user_for("yellow")

        # Out-of-turn move rejected
        with self.assertRaises(MoveError):
            state.play_move(self.game.id, yellow, "I1", 0, 19, 0)

        # Blue plays in the wrong corner -> rejected
        with self.assertRaises(MoveError):
            state.play_move(self.game.id, blue, "I1", 0, 19, 19)

        # Blue plays correctly, turn passes to yellow
        game = state.play_move(self.game.id, blue, "V5", 0, 0, 0)
        self.assertEqual(game.current_color, "yellow")
        self.assertEqual(game.board[0][0], "blue")

        # Blue can't reuse a played piece next round
        state.play_move(self.game.id, yellow, "I1", 0, 19, 0)
        state.play_move(self.game.id, self.user_for("red"), "I1", 0, 19, 19)
        state.play_move(self.game.id, self.user_for("green"), "I1", 0, 0, 19)
        with self.assertRaises(MoveError):
            state.play_move(self.game.id, blue, "V5", 0, 3, 3)

    def test_full_random_game_reaches_finish(self):
        """Play random legal moves until the game ends; state must stay valid."""
        import random

        random.seed(42)
        game = self.game
        safety = 0
        while game.status == Game.STATUS_ACTIVE and safety < 200:
            safety += 1
            player = game.players.get(color=game.current_color)
            move = self._find_any_move(game, player)
            self.assertIsNotNone(move, "current player must always have a move")
            pid, oi, x, y = move
            game = state.play_move(game.id, player.user, pid, oi, x, y)

        self.assertEqual(game.status, Game.STATUS_FINISHED)
        for p in game.players.all():
            self.assertIsNotNone(p.score)
        # A finished game keeps board + scores but drops its move history.
        self.assertEqual(game.moves.count(), 0)
        self.assertTrue(any(cell for row in game.board for cell in row))

    def _find_any_move(self, game, player):
        import random

        is_first = len(player.remaining_pieces) == len(ALL_PIECE_IDS)
        pieces = list(player.remaining_pieces)
        random.shuffle(pieces)
        anchors = logic._candidate_anchors(game.board, player.color, is_first)
        random.shuffle(anchors)
        for pid in pieces:
            for oi in range(len(ORIENTATIONS[pid])):
                for ax, ay in anchors:
                    for dx, dy in ORIENTATIONS[pid][oi]:
                        ok, _ = logic.validate_placement(
                            game.board, player.color, pid, oi, ax - dx, ay - dy, is_first
                        )
                        if ok:
                            return pid, oi, ax - dx, ay - dy
        return None


class LobbyListTests(TestCase):
    def test_finished_games_listed_with_winner(self):
        from rest_framework.test import APIClient

        user = User.objects.create_user("viewer", password="pass123456")
        game = Game.objects.create(name="old game", created_by=user, human_seats=1)
        state.join_game(game.id, user)
        game.refresh_from_db()
        game.status = Game.STATUS_FINISHED
        game.save(update_fields=["status"])
        for p in game.players.all():
            p.score = 5 if p.color == "red" else -5  # the red bot wins
            p.save(update_fields=["score"])

        client = APIClient()
        client.force_authenticate(user)
        data = client.get("/api/games/").json()
        self.assertEqual([g["id"] for g in data["finished"]], [game.id])
        self.assertEqual(data["finished"][0]["winner"], "🤖 Red")
        # finished games stay out of the active lists
        self.assertEqual(data["mine"], [])
        self.assertEqual(data["open"], [])


class LeaderboardTests(TestCase):
    def _finished_bot_game(self, user, human_score, bot_score):
        game = Game.objects.create(name="vs bots", created_by=user, human_seats=1)
        state.join_game(game.id, user)
        game.refresh_from_db()
        game.status = Game.STATUS_FINISHED
        game.save(update_fields=["status"])
        for p in game.players.all():
            p.score = human_score if p.user_id else bot_score
            p.save(update_fields=["score"])
        return game

    def _get(self, user):
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(user)
        return client.get("/api/leaderboard/").json()

    def test_winning_a_bot_game_counts_and_bots_stay_hidden(self):
        user = User.objects.create_user("solo", password="pass123456")
        self._finished_bot_game(user, human_score=20, bot_score=-10)
        rows = self._get(user)
        self.assertEqual(
            rows, [{"username": "solo", "games": 1, "wins": 1, "points": 20}]
        )

    def test_no_win_when_a_bot_outscores_the_human(self):
        user = User.objects.create_user("solo", password="pass123456")
        self._finished_bot_game(user, human_score=-5, bot_score=5)
        rows = self._get(user)
        self.assertEqual(
            rows, [{"username": "solo", "games": 1, "wins": 0, "points": -5}]
        )


class BotTests(TestCase):
    def setUp(self):
        self.human = User.objects.create_user("human", password="pass123456")
        self.game = Game.objects.create(
            name="bot game", created_by=self.human, human_seats=1
        )
        state.join_game(self.game.id, self.human)
        self.game.refresh_from_db()

    def test_bot_game_starts_immediately_with_human_as_blue(self):
        self.assertEqual(self.game.status, Game.STATUS_ACTIVE)
        self.assertEqual(self.game.players.get(user=self.human).color, "blue")
        self.assertEqual(self.game.players.filter(user__isnull=True).count(), 3)

    def test_two_human_game_fills_with_bots_when_second_joins(self):
        friend = User.objects.create_user("friend", password="pass123456")
        game = Game.objects.create(
            name="duo", created_by=self.human, human_seats=2
        )
        state.join_game(game.id, self.human)
        game.refresh_from_db()
        self.assertEqual(game.status, Game.STATUS_WAITING)
        self.assertEqual(game.players.count(), 1)

        state.join_game(game.id, friend)
        game.refresh_from_db()
        self.assertEqual(game.status, Game.STATUS_ACTIVE)
        self.assertEqual(game.players.filter(user__isnull=False).count(), 2)
        self.assertEqual(game.players.filter(user__isnull=True).count(), 2)
        # humans took the first two colors, bots the rest
        self.assertEqual(game.players.get(color="blue").user, self.human)
        self.assertEqual(game.players.get(color="yellow").user, friend)

    def test_bots_are_serialized_with_names(self):
        data = state.serialize_game(self.game, for_user=self.human)
        by_color = {p["color"]: p for p in data["players"]}
        self.assertEqual(by_color["yellow"]["username"], "🤖 Yellow")
        self.assertTrue(by_color["blue"]["is_you"])
        self.assertFalse(by_color["red"]["is_you"])

    def test_bot_does_not_move_on_humans_turn(self):
        self.assertIsNone(state.play_bot_move(self.game.id))

    def test_bots_play_until_humans_turn(self):
        game = state.play_move(self.game.id, self.human, "V5", 0, 0, 0)
        self.assertEqual(game.current_color, "yellow")
        for _ in range(3):
            game = state.play_bot_move(self.game.id)
            self.assertIsNotNone(game)
        # All three bots moved (first move covers their corner); human again.
        self.assertEqual(game.current_color, "blue")
        self.assertIsNone(state.play_bot_move(self.game.id))
        self.assertEqual(game.board[0][19], "yellow")
        self.assertEqual(game.board[19][19], "red")
        self.assertEqual(game.board[19][0], "green")

    def test_human_turn_is_skipped_when_they_have_no_legal_move(self):
        game = state.play_move(self.game.id, self.human, "V5", 0, 0, 0)
        # Block the human: occupy every empty cell diagonally adjacent to
        # their pieces, so no corner-touching placement can ever exist.
        for x, y in logic._candidate_anchors(game.board, "blue", False):
            game.board[y][x] = "red"
        game.save(update_fields=["board"])

        # The three bots play; when the turn would come back to the
        # human, they are marked blocked and skipped.
        for _ in range(3):
            game = state.play_bot_move(game.id)
            self.assertIsNotNone(game)

        self.assertEqual(game.status, Game.STATUS_ACTIVE)
        self.assertTrue(game.players.get(color="blue").is_blocked)
        self.assertEqual(game.current_color, "yellow")  # a bot, not the human

    def test_full_bot_game_reaches_finish(self):
        import random

        random.seed(7)
        game = self.game
        safety = 0
        while game.status == Game.STATUS_ACTIVE and safety < 200:
            safety += 1
            player = game.players.get(color=game.current_color)
            if player.is_bot:
                game = state.play_bot_move(game.id)
            else:
                is_first = len(player.remaining_pieces) == len(ALL_PIECE_IDS)
                move = bot.choose_move(
                    game.board, player.color, player.remaining_pieces, is_first
                )
                self.assertIsNotNone(move)
                game = state.play_move(game.id, self.human, *move)
        self.assertEqual(game.status, Game.STATUS_FINISHED)
        for p in game.players.all():
            self.assertIsNotNone(p.score)
        self.assertEqual(game.moves.count(), 0)
