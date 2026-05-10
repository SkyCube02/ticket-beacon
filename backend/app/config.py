from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    ANTHROPIC_API_KEY: str = ""
    FRONTEND_URL: str = "http://localhost:5173"
    AZURE_CLIENT_ID: str = ""
    AZURE_TENANT_ID: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
