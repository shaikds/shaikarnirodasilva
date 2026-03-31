"""Client CRUD service layer."""

from __future__ import annotations

from sqlalchemy.orm import Session

from models import Client
from schemas import ClientCreate, ClientUpdate


def create_client(db: Session, data: ClientCreate) -> Client:
    client = Client(**data.model_dump())
    db.add(client)
    db.commit()
    db.refresh(client)
    return client


def get_clients(db: Session) -> list[Client]:
    return db.query(Client).order_by(Client.created_at.desc()).all()


def get_client(db: Session, client_id: int) -> Client | None:
    return db.query(Client).filter(Client.id == client_id).first()


def update_client(db: Session, client_id: int, data: ClientUpdate) -> Client | None:
    client = get_client(db, client_id)
    if not client:
        return None

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(client, key, value)

    db.commit()
    db.refresh(client)
    return client


def delete_client(db: Session, client_id: int) -> bool:
    client = get_client(db, client_id)
    if not client:
        return False
    db.delete(client)
    db.commit()
    return True
