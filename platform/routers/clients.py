"""Client API endpoints."""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas import ClientCreate, ClientOut, ClientUpdate
from services import client_service

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientOut, status_code=201)
def create(data: ClientCreate, db: Session = Depends(get_db)):
    return client_service.create_client(db, data)


@router.get("", response_model=List[ClientOut])
def list_all(db: Session = Depends(get_db)):
    return client_service.get_clients(db)


@router.get("/{client_id}", response_model=ClientOut)
def get_one(client_id: int, db: Session = Depends(get_db)):
    c = client_service.get_client(db, client_id)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


@router.put("/{client_id}", response_model=ClientOut)
def update(client_id: int, data: ClientUpdate, db: Session = Depends(get_db)):
    c = client_service.update_client(db, client_id, data)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


@router.delete("/{client_id}")
def delete(client_id: int, db: Session = Depends(get_db)):
    if not client_service.delete_client(db, client_id):
        raise HTTPException(404, "Client not found")
    return {"ok": True}
