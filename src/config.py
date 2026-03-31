from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "AI Agent Hub"
    app_env: str = "development"
    app_debug: bool = True

    # Database
    database_url: str = "sqlite:///./agent_hub.db"

    # JWT
    jwt_secret_key: str = "change-this-to-a-random-secret-key-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
