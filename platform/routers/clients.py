"""Client API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from schemas import ClientCreate, ClientOut, ClientUpdate
from services import client_service

router = APIRouter(prefix="/clients", tags=["clients"])


@router.post("", response_model=ClientOut, status_code=201)
def create_client(data: ClientCreate, db: Session = Depends(get_db)):
    return client_service.create_client(db, data)


@router.get("", response_model=list[ClientOut])
def list_clients(db: Session = Depends(get_db)):
    return client_service.get_clients(db)


@router.get("/{client_id}", response_model=ClientOut)
def get_client(client_id: int, db: Session = Depends(get_db)):
    client = client_service.get_client(db, client_id)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.put("/{client_id}", response_model=ClientOut)
def update_client(client_id: int, data: ClientUpdate, db: Session = Depends(get_db)):
    client = client_service.update_client(db, client_id, data)
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return client


@router.delete("/{client_id}", status_code=204)
def delete_client(client_id: int, db: Session = Depends(get_db)):
    deleted = client_service.delete_client(db, client_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Client not found")
    return None
