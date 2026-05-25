"""
Siembra cortes de res en PostgreSQL con imágenes en backend/static (servidor).
Uso: cd backend && venv\\Scripts\\python.exe seed_cortes_res_servidor.py
"""
from app.database import SessionLocal
from app.catalogo_res import (
    ensure_cortes_res,
    migrar_cortes_res_existentes_a_local,
    public_api_base,
)


def main() -> None:
    base = public_api_base()
    db = SessionLocal()
    try:
        creados = ensure_cortes_res(db, base_url=base, actualizar_imagenes=True)
        migrados = migrar_cortes_res_existentes_a_local(db, base_url=base)
        print(f"Listo. Cortes nuevos: {len(creados)}. Imágenes locales actualizadas: {migrados}.")
        print(f"Base pública imágenes: {base}/static/cortes/res/")
    finally:
        db.close()


if __name__ == "__main__":
    main()
