"""Configuration handling for the Flowport backend."""

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration values."""

    app_name: str = "Flowport API"
    storage_dir: Path = Path("data/knowledge_bases")
    prebuilt_dir: Path = Path("app/data/prebuilt")
    default_top_k: int = 4

    model_config = SettingsConfigDict(env_prefix="FLOWPORT_", env_file=".env", env_file_encoding="utf-8")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""

    settings = Settings()
    settings.storage_dir = Path(settings.storage_dir)
    settings.prebuilt_dir = Path(settings.prebuilt_dir)
    return settings
