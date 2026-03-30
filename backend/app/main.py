from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List, Optional
import socketio
import threading

from . import models, schemas, crud, database, auth, background_tasks
from .database import engine, get_db, SessionLocal

# 1. Initialize FastAPI app
app = FastAPI(title="Supertiendas Cañaveral API")

# 2. CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Socket.io Setup
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')
socket_app = socketio.ASGIApp(sio, app)

# 4. Create database tables
models.Base.metadata.create_all(bind=engine)

# 5. Start background popularity task
threading.Thread(target=background_tasks.popularity_background_task, args=(SessionLocal,), daemon=True).start()

# --- Socket.io Events ---
@sio.event
async def connect(sid, environ):
    print(f"Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Client disconnected: {sid}")

@sio.on("join_room")
async def join_room(sid, room_name):
    await sio.enter_room(sid, room_name)
    print(f"Client {sid} joined room: {room_name}")

# --- API Routes ---

@app.get("/")
def read_root():
    return {"message": "Supertiendas Cañaveral API is running", "docs": "/docs"}

@app.post("/register", response_model=schemas.User)
def register_user(user: schemas.UserBase, password: Optional[str] = None, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # If no password is provided (e.g., for butchers), use a dummy password
    actual_password = password if password else "nopassword_carnicero_default"
    password_hash = auth.get_password_hash(actual_password)
    
    new_user = models.User(
        username=user.username,
        role=user.role,
        sede_id=user.sede_id,
        password_hash=password_hash
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@app.post("/login", response_model=schemas.Token)
def login(login_data: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=login_data.username)
    if not user or not auth.verify_password(login_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    # If user is a sede (butcher shop), ensure session is active
    if user.role == models.UserRole.SEDE_BUTCHER:
        # Always set to active (1) for direct access
        if user.session_active != 1:
            user.session_active = 1
            db.commit()
            db.refresh(user)
    
    access_token = auth.create_access_token(data={"sub": user.username})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user
    }

@app.post("/logout")
async def logout(user_id: int, db: Session = Depends(get_db)):
    """Logout endpoint that revokes session for sedes"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Deactivate session
    if user.role == models.UserRole.SEDE_BUTCHER:
        crud.update_session_status(db, user_id, 0)
        # Notify via socket
        await sio.emit("sede_logout", {"user_id": user_id}, room=f"sede_{user.sede_id}")
    
    return {"success": True, "message": "Logged out successfully"}

# DEPRECATED: /approve-sedes endpoint removed

@app.put("/users/{user_id}", response_model=schemas.User)
def update_user(user_id: int, user: schemas.UserBase, db: Session = Depends(get_db)):
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return crud.update_user(db=db, user_id=user_id, user=user)

@app.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db)):
    return crud.delete_user(db, user_id)

@app.get("/sedes", response_model=List[schemas.Sede])
def read_sedes(db: Session = Depends(get_db)):
    return crud.get_sedes(db)

@app.post("/sedes", response_model=schemas.Sede)
def create_sede(sede: schemas.SedeCreate, db: Session = Depends(get_db)):
    return crud.create_sede(db, sede)

@app.put("/sedes/{sede_id}", response_model=schemas.Sede)
def update_sede(sede_id: int, sede: schemas.SedeUpdate, db: Session = Depends(get_db)):
    return crud.update_sede(db, sede_id, sede)

@app.delete("/sedes/{sede_id}")
def delete_sede(sede_id: int, db: Session = Depends(get_db)):
    return crud.delete_sede(db, sede_id)

@app.get("/categorias", response_model=List[schemas.Categoria])
def read_categories(db: Session = Depends(get_db)):
    return crud.get_categories(db)

@app.post("/categorias", response_model=schemas.Categoria)
def create_category(cat: schemas.CategoriaBase, db: Session = Depends(get_db)):
    return crud.create_category(db, cat)

@app.put("/categorias/{cat_id}", response_model=schemas.Categoria)
def update_category(cat_id: int, cat: schemas.CategoriaBase, db: Session = Depends(get_db)):
    return crud.update_category(db, cat_id, cat)

@app.delete("/categorias/{cat_id}")
def delete_category(cat_id: int, db: Session = Depends(get_db)):
    return crud.delete_category(db, cat_id)

@app.get("/cortes", response_model=List[schemas.Corte])
def read_cortes(categoria_id: int = None, db: Session = Depends(get_db)):
    return crud.get_cortes(db, categoria_id)

@app.post("/cortes", response_model=schemas.Corte)
def create_corte(corte: schemas.CorteBase, db: Session = Depends(get_db)):
    return crud.create_corte(db, corte)

@app.put("/cortes/{corte_id}", response_model=schemas.Corte)
def update_corte(corte_id: int, corte: schemas.CorteBase, db: Session = Depends(get_db)):
    return crud.update_corte(db, corte_id, corte)

@app.delete("/cortes/{corte_id}")
def delete_corte(corte_id: int, db: Session = Depends(get_db)):
    return crud.delete_corte(db, corte_id)

@app.get("/tipos-corte", response_model=List[schemas.TipoCorte])
def read_tipos_corte(db: Session = Depends(get_db)):
    return crud.get_tipos_corte(db)

@app.get("/users/carniceros/{sede_id}", response_model=List[schemas.User])
def get_sede_carniceros(sede_id: str, db: Session = Depends(get_db)):
    return crud.get_carniceros_by_sede(db, sede_id)

@app.post("/users/carniceros", response_model=schemas.User)
def create_carnicero_endpoint(carnicero: schemas.CarniceroCreate, db: Session = Depends(get_db)):
    db_user = crud.get_user_by_username(db, username=carnicero.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    password_hash = auth.get_password_hash(carnicero.password)
    return crud.create_carnicero(db, carnicero, password_hash)

@app.put("/users/carniceros/{user_id}/availability", response_model=schemas.User)
def update_carnicero_availability_endpoint(user_id: int, is_available: bool, db: Session = Depends(get_db)):
    db_user = crud.update_carnicero_availability(db, user_id, is_available)
    if not db_user:
        raise HTTPException(status_code=404, detail="Carnicero no encontrado")
    return db_user

@app.put("/users/carniceros/{user_id}", response_model=schemas.User)
def update_carnicero_endpoint(user_id: int, carnicero: schemas.CarniceroUpdate, db: Session = Depends(get_db)):
    password_hash = None
    if carnicero.password:
        password_hash = auth.get_password_hash(carnicero.password)
    db_user = crud.update_carnicero(db, user_id, carnicero, password_hash)
    if not db_user:
        raise HTTPException(status_code=404, detail="Carnicero no encontrado")
    return db_user

@app.delete("/users/carniceros/{user_id}")
def delete_carnicero_endpoint(user_id: int, db: Session = Depends(get_db)):
    db_user = crud.delete_user(db, user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="Carnicero no encontrado")
    return {"message": "Carnicero eliminado correctamente"}

@app.get("/users", response_model=List[schemas.User])
def read_users(db: Session = Depends(get_db)):
    return crud.get_users(db)

@app.get("/stats/orders-by-sede")
def get_stats_orders(db: Session = Depends(get_db)):
    result = crud.get_stats_orders_by_sede(db)
    return [{"name": r[0], "count": r[1]} for r in result]

@app.get("/stats/top-cuts")
def get_stats_cuts(db: Session = Depends(get_db)):
    result = crud.get_stats_top_cuts(db)
    return [{"name": r[0], "total_kg": r[1]} for r in result]

@app.get("/pedidos", response_model=List[schemas.Pedido])
def read_pedidos(sede_id: str = None, db: Session = Depends(get_db)):
    if sede_id:
        return crud.get_pedidos_by_sede(db, sede_id)
    return db.query(models.Pedido).all()

@app.post("/pedidos", response_model=schemas.Pedido)
async def create_pedido_endpoint(pedido: schemas.PedidoCreate, db: Session = Depends(get_db)):
    db_pedido = crud.create_pedido(db=db, pedido=pedido)
    # Notify Butcher in the same sede
    await sio.emit("new_order", schemas.Pedido.model_validate(db_pedido).model_dump(mode='json'), room=f"sede_{db_pedido.sede_id}")
    return db_pedido

@app.put("/pedidos/{pedido_id}/estado", response_model=schemas.Pedido)
async def update_pedido_estado_endpoint(pedido_id: int, estado: str, carnicero_id: Optional[int] = None, db: Session = Depends(get_db)):
    db_pedido = crud.update_pedido_estado(db=db, pedido_id=pedido_id, estado=estado, carnicero_id=carnicero_id)
    if not db_pedido:
        raise HTTPException(status_code=404, detail="Pedido not found")
    await sio.emit("order_update", schemas.Pedido.model_validate(db_pedido).model_dump(mode='json'), room=f"sede_{db_pedido.sede_id}")
    return db_pedido

@app.put("/pedidos/{pedido_id}/problema", response_model=schemas.Pedido)
async def report_pedido_problema_endpoint(pedido_id: int, problema: str, db: Session = Depends(get_db)):
    db_pedido = crud.report_pedido_problema(db=db, pedido_id=pedido_id, problema=problema)
    if not db_pedido:
        raise HTTPException(status_code=404, detail="Pedido not found")
    
    # Notify Butcher/Manager about the problem (optional, but good for real-time)
    await sio.emit("order_problem", {
        "pedido_id": pedido_id,
        "problema": problema
    }, room=f"sede_{db_pedido.sede_id}")
    
    return db_pedido

# Butcher Availability Endpoints
@app.get("/butchers/sede/{sede_id}", response_model=List[schemas.User])
def get_butchers_for_sede(sede_id: str, db: Session = Depends(get_db)):
    """Get all butchers for a specific sede"""
    return crud.get_butchers_by_sede(db, sede_id)

@app.get("/availability/{sede_id}/{date}")
def get_availability(sede_id: str, date: str, db: Session = Depends(get_db)):
    """Get availability records for a specific sede and date"""
    from datetime import datetime
    date_obj = datetime.strptime(date, "%Y-%m-%d").date()
    availabilities = crud.get_availability_for_date(db, sede_id, date_obj)
    return [schemas.ButcherAvailability.model_validate(a).model_dump(mode='json') for a in availabilities]

@app.post("/availability")
async def set_availability_bulk(data: schemas.ButcherAvailabilityBulkUpdate, manager_id: int, sede_id: str, db: Session = Depends(get_db)):
    """Bulk update availability for multiple butchers on a specific date"""
    results = []
    for item in data.availabilities:
        availability = crud.set_butcher_availability(
            db=db,
            butcher_id=item['butcher_id'],
            sede_id=sede_id,
            date=data.date,
            is_available=item['is_available'],
            manager_id=manager_id
        )
        results.append(availability)
    
    # Notify via socket about availability changes
    await sio.emit("availability_update", {
        "sede_id": sede_id,
        "date": str(data.date),
        "count": len(results)
    }, room=f"sede_{sede_id}")
    
    return {"success": True, "updated": len(results)}

# Final app definition for ASGI
app = socket_app
