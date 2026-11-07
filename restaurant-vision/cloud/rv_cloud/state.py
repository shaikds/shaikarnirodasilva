"""Process-wide collaborators of one app instance (stored on ``app.state.rv``)."""

from dataclasses import dataclass

from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from .clock import Clock
from .config import Settings
from .push import Notifier
from .realtime import EventBroker
from .security import PasswordHasher, RateLimiter, TokenService


@dataclass
class AppState:
    settings: Settings
    engine: Engine
    session_factory: sessionmaker[Session]
    clock: Clock
    broker: EventBroker
    notifier: Notifier
    hasher: PasswordHasher
    tokens: TokenService
    login_limiter: RateLimiter
    pair_limiter: RateLimiter
