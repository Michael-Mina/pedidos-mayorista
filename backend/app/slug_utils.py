"""Generación de slugs URL-friendly para sedes."""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy.orm import Session

from . import models


def slugify(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(text or ""))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", ascii_text.lower()).strip("-")
    return slug or "sede"


def make_unique_slug(db: Session, base: str, exclude_sede_id: int | None = None) -> str:
    candidate = slugify(base)
    if not candidate:
        candidate = "sede"

    suffix = 0
    while True:
        slug = candidate if suffix == 0 else f"{candidate}-{suffix}"
        query = db.query(models.Sede).filter(models.Sede.slug == slug)
        if exclude_sede_id is not None:
            query = query.filter(models.Sede.id != exclude_sede_id)
        if not query.first():
            return slug
        suffix += 1
