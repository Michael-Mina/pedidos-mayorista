# Guía de configuración (referencia)

La documentación principal y actualizada está en **[README.md](./README.md)**.

Para **rearmar o migrar la base de datos en otro equipo o servidor**, usa la sección **[Rearmar la base en otro equipo o servidor](./README.md#rearmar-la-base-en-otro-equipo-o-servidor)** del README principal.

Este archivo conserva solo el detalle de **recreación manual de la base de datos con SQL**, por si prefieres pgAdmin o `psql` en lugar de los scripts de Python.

---

## Recreación manual (SQL)

### 1. Eliminar y crear la base

```sql
DROP DATABASE IF EXISTS supertiendas_db;
CREATE DATABASE supertiendas_db;
```

### 2. Ejecutar el esquema

```bash
psql -U tu_usuario -d supertiendas_db -f init_db.sql
```

### 3. Datos de prueba con Python

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python setup_initial_data.py
```

---

Para instalación, variables de entorno, roles, seguridad y ejecución diaria, usa **[README.md](./README.md)**.
