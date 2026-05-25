"""Descarga solo imágenes faltantes (pausas largas para evitar rate-limit)."""
from app.catalogo_res import (
    CORTES_RES_CATALOGO,
    CATEGORIA_RES_IMAGEN,
    STATIC_CORTES_RES_DIR,
    _asegurar_archivo_imagen,
    migrar_cortes_res_existentes_a_local,
    ensure_cortes_res,
    public_api_base,
)
from app.database import SessionLocal


def main() -> None:
    print("Descargando imágenes a", STATIC_CORTES_RES_DIR)
    _asegurar_archivo_imagen(
        STATIC_CORTES_RES_DIR / CATEGORIA_RES_IMAGEN["archivo"],
        "Res",
        CATEGORIA_RES_IMAGEN["origen"],
        0,
    )
    for item in CORTES_RES_CATALOGO:
        dest = STATIC_CORTES_RES_DIR / item["archivo"]
        _asegurar_archivo_imagen(dest, item["nombre"], item["origen"], 0)
    db = SessionLocal()
    try:
        ensure_cortes_res(db, public_api_base(), actualizar_imagenes=True)
        n = migrar_cortes_res_existentes_a_local(db, public_api_base())
        print(f"URLs en BD actualizadas (legacy): {n}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
