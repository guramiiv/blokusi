import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'blokus.settings')
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402

from game.routing import websocket_urlpatterns  # noqa: E402
from game.ws_auth import TokenAuthMiddleware  # noqa: E402

# The frontend runs on its own domain, so validate WebSocket origins
# against the explicit allow-list instead of ALLOWED_HOSTS.
application = ProtocolTypeRouter(
    {
        'http': django_asgi_app,
        'websocket': OriginValidator(
            TokenAuthMiddleware(URLRouter(websocket_urlpatterns)),
            settings.WS_ALLOWED_ORIGINS,
        ),
    }
)
