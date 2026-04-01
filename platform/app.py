"""SilvA.i Project Manager – FastAPI entry point."""
from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from database import Base, engine
import models  # noqa: F401 - ensure models registered before create_all

Base.metadata.create_all(bind=engine)

app = FastAPI(title="SilvA.i Project Manager", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

from routers.clients import router as clients_router
from routers.projects import router as projects_router, actions_router
from routers.dashboard import router as dashboard_router

app.include_router(clients_router, prefix="/api")
app.include_router(projects_router, prefix="/api")
app.include_router(actions_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")

def _serve_index() -> FileResponse:
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/")
async def root():
    return _serve_index()

@app.get("/project/{project_id}")
async def project_page(project_id: int):
    return _serve_index()

@app.get("/new")
async def new_page():
    return _serve_index()

@app.get("/clients")
async def clients_page():
    return _serve_index()
