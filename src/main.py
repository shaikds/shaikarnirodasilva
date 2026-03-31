from fastapi import FastAPI

from src.config import settings
from src.database import Base, engine
from src.routers import agents, auth, executions

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    description="API for creating, managing, and executing AI agents",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Register routers
app.include_router(auth.router)
app.include_router(agents.router)
app.include_router(executions.router)


@app.get("/", tags=["Health"])
def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": "1.0.0",
    }
