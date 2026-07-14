import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from . import state
from .models import Game
from .state import MoveError


class GameConsumer(AsyncWebsocketConsumer):
    """Real-time game channel.

    Client -> server messages:
      {"action": "place", "piece": "T5", "orientation": 2, "x": 4, "y": 7}

    Server -> client messages:
      {"type": "state", "game": {...}}          full game state
      {"type": "error", "message": "..."}       rejected action (sender only)
    """

    async def connect(self):
        self.game_id = int(self.scope["url_route"]["kwargs"]["game_id"])
        self.group = f"game_{self.game_id}"
        user = self.scope["user"]
        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return
        game = await self._get_game()
        if game is None:
            await self.close(code=4004)
            return
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self._send_state(game)

    async def disconnect(self, code):
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        try:
            data = json.loads(text_data)
        except (json.JSONDecodeError, TypeError):
            await self._send_error("Malformed message.")
            return

        if data.get("action") == "place":
            try:
                await self._play_move(data)
            except MoveError as e:
                await self._send_error(str(e))
                return
            except (KeyError, TypeError, ValueError):
                await self._send_error("Invalid move payload.")
                return
            # Broadcast the new state to everyone in the room.
            await self.channel_layer.group_send(
                self.group, {"type": "game_state_changed"}
            )
        else:
            await self._send_error("Unknown action.")

    async def game_state_changed(self, event):
        game = await self._get_game()
        if game is not None:
            await self._send_state(game)

    # -- helpers ---------------------------------------------------------

    @database_sync_to_async
    def _get_game(self):
        try:
            return Game.objects.get(pk=self.game_id)
        except Game.DoesNotExist:
            return None

    @database_sync_to_async
    def _play_move(self, data):
        return state.play_move(
            self.game_id,
            self.scope["user"],
            str(data["piece"]),
            int(data["orientation"]),
            int(data["x"]),
            int(data["y"]),
        )

    @database_sync_to_async
    def _serialize(self, game):
        return state.serialize_game(game, for_user=self.scope["user"])

    async def _send_state(self, game):
        payload = await self._serialize(game)
        await self.send(json.dumps({"type": "state", "game": payload}))

    async def _send_error(self, message):
        await self.send(json.dumps({"type": "error", "message": message}))
