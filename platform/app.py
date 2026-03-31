"""SilvA.i Project Manager - FastAPI application entry point."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import Base, engine
from routers.clients import router as clients_router
from routers.projects import router as projects_router, actions_router
from routers.dashboard import router as dashboard_router

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SilvA.i Project Manager")

# CORS - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files (directory must exist)
static_dir = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(static_dir, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Include API routers
app.include_router(clients_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(actions_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")


# Serve frontend pages
@app.get("/")
async def root():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "SilvA.i Project Manager API", "docs": "/docs"}


@app.get("/project/{project_id}")
async def project_page(project_id: int):
    page_path = os.path.join(static_dir, "project.html")
    if os.path.exists(page_path):
        return FileResponse(page_path)
    return {"message": "Project page not yet available", "project_id": project_id}


@app.get("/new")
async def new_project_page():
    page_path = os.path.join(static_dir, "new-project.html")
    if os.path.exists(page_path):
        return FileResponse(page_path)
    return {"message": "New project page not yet available"}
