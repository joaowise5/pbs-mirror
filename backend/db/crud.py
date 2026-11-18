from sqlalchemy.orm import Session
from . import models

# --- User Helpers ---
def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email.lower().strip()).first()


def create_user(db: Session, email: str, hashed_password: str):
    user = models.User(email=email.lower().strip(), hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_conversation_for_user(db: Session, conversation_id: int, user_id: int):
    return (
        db.query(models.Conversation)
        .filter(
            models.Conversation.id == conversation_id,
            models.Conversation.user_id == user_id,
        )
        .first()
    )

# --- Conversation Helpers ---
def create_conversation(db: Session, user_id: int, title: str = "New Chat"):
    convo = models.Conversation(user_id=user_id, title=title)
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return convo

def get_user_conversations(db: Session, user_id: int):
    return (
        db.query(models.Conversation)
        .filter(models.Conversation.user_id == user_id)
        .order_by(models.Conversation.created_at.desc())
        .all()
    )

# --- Message Helpers ---
def save_message(db: Session, conversation_id: int, role: str, content: str, payload: dict | None = None):
    msg = models.Message(
        conversation_id=conversation_id,
        role=role,
        content=content,
        payload=payload,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg

def get_conversation_messages(db: Session, conversation_id: int):
    return (
        db.query(models.Message)
        .filter(models.Message.conversation_id == conversation_id)
        .order_by(models.Message.created_at.asc())
        .all()
    )

