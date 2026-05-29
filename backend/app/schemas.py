import json
from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime, date
from typing import List, Optional
from .models import UserRole, PedidoEstado

class SedeBase(BaseModel):
    nombre: str
    ciudad: Optional[str] = "Centro de Operación"

class SedeCreate(SedeBase):
    id: Optional[int] = None
    password: str

class SedeUpdate(BaseModel):
    nombre: Optional[str] = None
    ciudad: Optional[str] = None
    password: Optional[str] = None

class Sede(SedeBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class UserBase(BaseModel):
    username: str
    role: UserRole
    sede_id: int
    session_active: Optional[int] = 0
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    numero_carnicero: Optional[str] = None
    is_available: Optional[bool] = True


class UserUpdate(BaseModel):
    username: str
    role: UserRole
    sede_id: int
    password: Optional[str] = None
    session_active: Optional[int] = None

    @field_validator("sede_id", mode="before")
    @classmethod
    def coerce_sede_id(cls, v):
        if v is None or v == "":
            raise ValueError("sede_id es obligatorio")
        return int(v)

class CarniceroCreate(UserBase):
    password: str

class CarniceroUpdate(BaseModel):
    nombre: Optional[str] = None
    apellido: Optional[str] = None
    numero_carnicero: Optional[str] = None
    is_available: Optional[bool] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


MASTER_CREATABLE_ROLES = frozenset({
    UserRole.ADMIN,
    UserRole.MAYORISTA,
    UserRole.JEFE_CARNES,
})


class ProfileCreate(BaseModel):
    username: str
    password: str
    role: UserRole
    sede_id: int

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El usuario es obligatorio")
        return v

    @field_validator("password")
    @classmethod
    def password_not_empty(cls, v: str) -> str:
        if not v or not str(v).strip():
            raise ValueError("La contraseña es obligatoria")
        return str(v).strip()

    @field_validator("role")
    @classmethod
    def role_allowed(cls, v: UserRole) -> UserRole:
        if v not in MASTER_CREATABLE_ROLES:
            raise ValueError("Rol no permitido para creación de perfiles")
        return v

    @field_validator("sede_id", mode="before")
    @classmethod
    def coerce_sede_id(cls, v):
        if v is None or v == "":
            raise ValueError("sede_id es obligatorio")
        return int(v)


class ProfileUpdate(BaseModel):
    username: str
    role: UserRole
    sede_id: int
    password: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_not_empty(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("El usuario es obligatorio")
        return v

    @field_validator("role")
    @classmethod
    def role_allowed(cls, v: UserRole) -> UserRole:
        if v not in MASTER_CREATABLE_ROLES:
            raise ValueError("Rol no permitido")
        return v

    @field_validator("sede_id", mode="before")
    @classmethod
    def coerce_sede_id(cls, v):
        if v is None or v == "":
            raise ValueError("sede_id es obligatorio")
        return int(v)

class Token(BaseModel):
    access_token: str
    token_type: str
    user: User

class LoginRequest(BaseModel):
    username: str
    password: str

class CategoriaBase(BaseModel):
    nombre: str
    imagen_url: Optional[str] = None
    popularidad_score: float = 0.0

class Categoria(CategoriaBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class TipoCorteBase(BaseModel):
    nombre: str

class TipoCorte(TipoCorteBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class CorteBase(BaseModel):
    categoria_id: int
    nombre: str
    imagen_url: Optional[str] = None
    tipos_corte_ids: Optional[List[int]] = []

class Corte(CorteBase):
    id: int
    tipos_corte: List[TipoCorte] = []
    model_config = ConfigDict(from_attributes=True)

class DetallePedidoBase(BaseModel):
    corte_id: int
    tipo_corte_id: int
    cantidad_kg: float
    observaciones: Optional[str] = None

class DetallePedidoCreate(DetallePedidoBase):
    pass

class DetallePedido(DetallePedidoBase):
    id: int
    pedido_id: int
    corte: Optional[Corte] = None
    tipo_corte: Optional[TipoCorte] = None
    model_config = ConfigDict(from_attributes=True)

class PedidoBase(BaseModel):
    cliente_nombre: str
    sede_id: int
    observaciones: Optional[str] = None

class PedidoCreate(PedidoBase):
    mayorista_id: int
    detalles: List[DetallePedidoCreate]

class ReporteMensaje(BaseModel):
    rol: str  # mayorista | carniceria
    texto: str
    at: Optional[str] = None


class Pedido(PedidoBase):
    id: int
    numero_pedido: Optional[str] = None
    mayorista_id: int
    mayorista: Optional[User] = None
    carnicero_id: Optional[int] = None
    carnicero: Optional[User] = None
    sede: Optional[Sede] = None
    estado: PedidoEstado
    timestamp: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    updated_at: datetime
    problema_reportado: Optional[str] = None
    problema_respuesta: Optional[str] = None
    reporte_mensajes: Optional[List[ReporteMensaje]] = None
    detalles: List[DetallePedido]
    model_config = ConfigDict(from_attributes=True)

    @field_validator("reporte_mensajes", mode="before")
    @classmethod
    def parse_reporte_mensajes(cls, v):
        if v is None or v == "":
            return None
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                return parsed if isinstance(parsed, list) else None
            except json.JSONDecodeError:
                return None
        return v

class PedidoProblemaReport(BaseModel):
    """Cuerpo JSON para PUT /pedidos/{id}/problema (evita límites de URL del query param)."""

    problema: str

class PedidoProblemaRespuesta(BaseModel):
    """Cuerpo JSON para PUT /pedidos/{id}/problema/respuesta."""

    respuesta: str

class ButcherAvailabilityBase(BaseModel):
    butcher_id: int
    sede_id: int
    date: date
    is_available: bool = True

class ButcherAvailabilityCreate(ButcherAvailabilityBase):
    set_by_manager_id: int

class ButcherAvailability(ButcherAvailabilityBase):
    id: int
    set_by_manager_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)

class ButcherAvailabilityBulkUpdate(BaseModel):
    date: date
    availabilities: List[dict]  # [{butcher_id: int, is_available: bool}]

class ApproveSedesRequest(BaseModel):
    sede_ids: List[int]
