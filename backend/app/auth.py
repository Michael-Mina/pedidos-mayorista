from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

from . import crud, models, role_catalog
from .database import get_db

load_dotenv()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

SECRET_KEY = os.getenv("SECRET_KEY", "canaveral_secret_key_2026")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o sesión expirada",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = crud.get_user_by_username(db, username=username)
    if user is None:
        raise credentials_exception
    return user


def is_admin_panel_user(user: models.User) -> bool:
    return user.role in (models.UserRole.ADMIN.value, models.UserRole.MASTER.value)


def require_admin(current_user: models.User = Depends(get_current_user)) -> models.User:
    if not is_admin_panel_user(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo administradores pueden realizar esta acción",
        )
    return current_user


def require_master(current_user: models.User = Depends(get_current_user)) -> models.User:
    if current_user.role != models.UserRole.MASTER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el usuario master puede realizar esta acción",
        )
    return current_user


def is_jefe_panel_user(db: Session, user: models.User) -> bool:
    panel = role_catalog.get_role_panel(db, user.role)
    return panel == "jefe"


def require_catalog_manager(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> models.User:
    if not is_jefe_panel_user(db, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Solo el supervisor de carnes puede gestionar el catálogo de productos",
        )
    if not current_user.sede_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El supervisor no tiene sede asignada",
        )
    return current_user


def require_catalog_reader(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    if not current_user.sede_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Usuario sin sede asignada",
        )
    return current_user
