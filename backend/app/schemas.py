from pydantic import BaseModel, ConfigDict
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

class Pedido(PedidoBase):
    id: int
    mayorista_id: int
    carnicero_id: Optional[int] = None
    carnicero: Optional[User] = None
    sede: Optional[Sede] = None
    estado: PedidoEstado
    timestamp: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    updated_at: datetime
    problema_reportado: Optional[str] = None
    detalles: List[DetallePedido]
    model_config = ConfigDict(from_attributes=True)

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
