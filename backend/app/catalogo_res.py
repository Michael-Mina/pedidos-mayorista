"""
Catálogo de cortes de res: definición en código y persistencia en PostgreSQL.
Las imágenes se guardan en backend/static/cortes/res/ y se sirven vía /static/...
"""
from __future__ import annotations

import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from sqlalchemy.orm import Session

from . import crud, models, schemas

STATIC_CORTES_RES_DIR = Path(__file__).resolve().parent.parent / "static" / "cortes" / "res"

# Cortes adicionales (no JSON externo): nombre, archivo local y URL de origen para descargar una sola vez.
def _wiki_thumb(path: str, width: int = 330) -> str:
    """URL de miniatura Wikimedia (tamaños permitidos: 220, 330, etc.)."""
    name = path.rsplit("/", 1)[-1]
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{path}/{width}px-{name}"


def _generar_imagen_local(destino: Path, nombre: str) -> bool:
    """Imagen JPEG almacenada en el servidor (sin depender de JSON ni CDN externo)."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return False

    size = 480
    img = Image.new("RGB", (size, size), (10, 15, 26))
    draw = ImageDraw.Draw(img)
    margin = 32
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(125, 58, 48),
        outline=(12, 178, 0),
        width=7,
    )
    draw.ellipse(
        [margin + 48, margin + 48, size - margin - 48, size - margin - 110],
        fill=(158, 82, 68),
    )
    draw.ellipse(
        [margin + 90, margin + 70, size - margin - 120, size - margin - 160],
        fill=(175, 95, 78),
    )
    try:
        font = ImageFont.truetype("arial.ttf", 26)
    except OSError:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), nombre, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((size - tw) // 2, size - 64), nombre, fill=(255, 255, 255), font=font)
    destino.parent.mkdir(parents=True, exist_ok=True)
    img.save(destino, "JPEG", quality=88)
    return destino.exists()


CORTES_RES_CATALOGO = [
    {
        "nombre": "Pecho de res",
        "archivo": "pecho-de-res.jpg",
        "origen": _wiki_thumb("6/62/Raw_beef_brisket.jpg"),
    },
    {
        "nombre": "Costilla de res",
        "archivo": "costilla-de-res.jpg",
        "origen": _wiki_thumb("4/4f/Beef_Ribs.jpg"),
    },
    {
        "nombre": "Punta de anca",
        "archivo": "punta-de-anca.jpg",
        "origen": _wiki_thumb("4/42/Sirloin_steak_raw.jpg"),
    },
    {
        "nombre": "Falda de res",
        "archivo": "falda-de-res.jpg",
        "origen": _wiki_thumb("5/54/Flank_steak_raw.jpg"),
    },
    {
        "nombre": "Molida de res",
        "archivo": "molida-de-res.jpg",
        "origen": _wiki_thumb("0/0d/Ground_beef_USDA.jpg"),
    },
    {
        "nombre": "Sobrebarriga",
        "archivo": "sobrebarriga.jpg",
        "origen": _wiki_thumb("6/6e/Chuck_steak_raw.jpg"),
    },
    {
        "nombre": "Cola de res",
        "archivo": "cola-de-res.jpg",
        "origen": _wiki_thumb("1/1f/Oxtail_2.jpg"),
    },
    {
        "nombre": "Chuleta de res",
        "archivo": "chuleta-de-res.jpg",
        "origen": _wiki_thumb("8/8e/Round_steak_raw.jpg"),
    },
    {
        "nombre": "Hígado de res",
        "archivo": "higado-de-res.jpg",
        "origen": _wiki_thumb("3/3a/Calf_liver.jpg"),
    },
    {
        "nombre": "Hueso de res",
        "archivo": "hueso-de-res.jpg",
        "origen": _wiki_thumb("2/2b/Marrowbones.jpg"),
    },
    {
        "nombre": "Posta negra",
        "archivo": "posta-negra.jpg",
        "origen": _wiki_thumb("d/d3/Beef_Tenderloin.jpg"),
    },
    {
        "nombre": "Muchacho redondo",
        "archivo": "muchacho-redondo.jpg",
        "origen": _wiki_thumb("9/9a/Beef_round_steak.jpg"),
    },
]

CATEGORIA_RES_IMAGEN = {
    "archivo": "categoria-res.jpg",
    "origen": _wiki_thumb("4/42/Sirloin_steak_raw.jpg"),
}


def public_api_base() -> str:
    return os.getenv("PUBLIC_API_URL", "http://localhost:8000").rstrip("/")


def _descargar_imagen(destino: Path, origen: str, pausa_seg: float = 1.25) -> bool:
    if destino.exists() and destino.stat().st_size > 0:
        return True
    destino.parent.mkdir(parents=True, exist_ok=True)
    if pausa_seg > 0:
        time.sleep(pausa_seg)
    req = urllib.request.Request(
        origen,
        headers={"User-Agent": "SupertiendasCanaveral/1.0 (catalog seed)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            destino.write_bytes(resp.read())
        return destino.stat().st_size > 0
    except (urllib.error.URLError, TimeoutError, OSError) as err:
        print(f"[catalogo_res] No se pudo descargar {origen}: {err}")
        return False


def _asegurar_archivo_imagen(destino: Path, nombre: str, origen: str | None, pausa_seg: float = 0) -> bool:
    if destino.exists() and destino.stat().st_size > 0:
        return True
    if origen and _descargar_imagen(destino, origen, pausa_seg):
        return True
    return _generar_imagen_local(destino, nombre)


def _url_imagen_local(base_url: str, archivo: str) -> str:
    return f"{base_url}/static/cortes/res/{archivo}"


def _tipos_corte_ids(db: Session) -> list[int]:
    return [t.id for t in db.query(models.TipoCorte).order_by(models.TipoCorte.id).all()]


def ensure_categoria_res(db: Session, base_url: str | None = None) -> models.Categoria:
    base = base_url or public_api_base()
    cat = db.query(models.Categoria).filter(models.Categoria.nombre == "Res").first()
    archivo = CATEGORIA_RES_IMAGEN["archivo"]
    destino = STATIC_CORTES_RES_DIR / archivo
    _asegurar_archivo_imagen(destino, "Res", CATEGORIA_RES_IMAGEN["origen"], 0)
    imagen = _url_imagen_local(base, archivo) if destino.exists() else None

    if not cat:
        cat = crud.create_category(
            db,
            schemas.CategoriaBase(nombre="Res", imagen_url=imagen),
        )
        print(f"[catalogo_res] Categoría Res creada (id={cat.id})")
    elif imagen and cat.imagen_url != imagen:
        cat.imagen_url = imagen
        db.commit()
        db.refresh(cat)
    return cat


def ensure_cortes_res(db: Session, base_url: str | None = None, actualizar_imagenes: bool = False) -> list[models.Corte]:
    """
    Inserta cortes de res faltantes y guarda imágenes en el servidor.
    Idempotente: no duplica por nombre dentro de la categoría Res.
    """
    base = base_url or public_api_base()
    cat = ensure_categoria_res(db, base)
    tipos_ids = _tipos_corte_ids(db)
    creados: list[models.Corte] = []

    for item in CORTES_RES_CATALOGO:
        destino = STATIC_CORTES_RES_DIR / item["archivo"]
        tiene_imagen = _asegurar_archivo_imagen(destino, item["nombre"], item["origen"], 0.5)
        imagen_url = _url_imagen_local(base, item["archivo"]) if tiene_imagen else None

        existente = (
            db.query(models.Corte)
            .filter(
                models.Corte.categoria_id == cat.id,
                models.Corte.nombre == item["nombre"],
            )
            .first()
        )

        if existente:
            if imagen_url and (actualizar_imagenes or not existente.imagen_url):
                existente.imagen_url = imagen_url
                db.commit()
                db.refresh(existente)
                print(f"[catalogo_res] Imagen actualizada: {existente.nombre}")
            continue

        nuevo = crud.create_corte(
            db,
            schemas.CorteBase(
                nombre=item["nombre"],
                categoria_id=cat.id,
                imagen_url=imagen_url,
                tipos_corte_ids=tipos_ids,
            ),
        )
        creados.append(nuevo)
        print(f"[catalogo_res] Corte creado: {nuevo.nombre} (id={nuevo.id})")

    return creados


def migrar_cortes_res_existentes_a_local(db: Session, base_url: str | None = None) -> int:
    """
    Reasigna imágenes locales a cortes ya existentes (Lomo, Picaña, etc.) usando el catálogo
    cuando el nombre coincide o hay entrada explícita.
    """
    base = base_url or public_api_base()
    cat = db.query(models.Categoria).filter(models.Categoria.nombre == "Res").first()
    if not cat:
        return 0

    alias_archivo = {
        "lomo de res": "lomo-de-res.jpg",
        "picana": "picana.jpg",
        "picaña": "picana.jpg",
    }
    origenes_legacy = {
        "picana.jpg": _wiki_thumb("c/c5/Picanha_steak.jpg"),
        "lomo-de-res.jpg": _wiki_thumb("d/d3/Beef_Tenderloin.jpg"),
    }
    por_nombre = {c["nombre"].lower(): c["archivo"] for c in CORTES_RES_CATALOGO}
    actualizados = 0

    for corte in db.query(models.Corte).filter(models.Corte.categoria_id == cat.id).all():
        key = corte.nombre.lower().strip()
        archivo = alias_archivo.get(key) or por_nombre.get(key)
        if not archivo:
            continue
        destino = STATIC_CORTES_RES_DIR / archivo
        if not destino.exists():
            item = next((x for x in CORTES_RES_CATALOGO if x["archivo"] == archivo), None)
            origen = item["origen"] if item else origenes_legacy.get(archivo)
            nombre = corte.nombre
            _asegurar_archivo_imagen(destino, nombre, origen, 0.5)
        if destino.exists():
            nueva_url = _url_imagen_local(base, archivo)
            if corte.imagen_url != nueva_url:
                corte.imagen_url = nueva_url
                actualizados += 1

    if actualizados:
        db.commit()
    return actualizados
