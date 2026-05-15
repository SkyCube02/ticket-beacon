from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    ANTHROPIC_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:5173"
    AZURE_CLIENT_ID: str = ""
    AZURE_TENANT_ID: str = ""

    # Azure Blob Storage — leave empty for local-DB fallback
    AZURE_STORAGE_CONNECTION_STRING: str = ""
    AZURE_STORAGE_CONTAINER: str = "beacon-attachments"

    # Azure Monitor Application Insights — leave empty to disable telemetry
    APPLICATIONINSIGHTS_CONNECTION_STRING: str = ""

    # Azure PostgreSQL — set True when DATABASE_URL points at Azure
    DB_SSL_REQUIRED: bool = False

    class Config:
        env_file = ".env"

settings = Settings()
