-- Supertiendas Cañaveral - Script de Inicialización de Base de Datos

-- 1. Crear la base de datos (Ejecutar manualmente en psql o pgAdmin)
-- CREATE DATABASE supertiendas_db;

-- 2. Sedes
CREATE TABLE IF NOT EXISTS sedes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    ciudad VARCHAR(100) NOT NULL
);

-- 3. Usuarios
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL, -- admin, mayorista, carnicero
    sede_id INTEGER REFERENCES sedes(id)
);

-- 4. Categorías
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) UNIQUE NOT NULL,
    imagen_url TEXT,
    popularidad_score FLOAT DEFAULT 0.0
);

-- 5. Cortes
CREATE TABLE IF NOT EXISTS cortes (
    id SERIAL PRIMARY KEY,
    categoria_id INTEGER REFERENCES categorias(id),
    nombre VARCHAR(100) NOT NULL,
    imagen_url TEXT
);

-- 6. Tipos de Corte
CREATE TABLE IF NOT EXISTS tipos_corte (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL
);

-- 7. Pedidos
CREATE TABLE IF NOT EXISTS pedidos (
    id SERIAL PRIMARY KEY,
    mayorista_id INTEGER REFERENCES users(id),
    carnicero_id INTEGER REFERENCES users(id),
    cliente_nombre VARCHAR(255) NOT NULL,
    estado VARCHAR(20) DEFAULT 'pendiente', -- pendiente, en_proceso, finalizado
    sede_id INTEGER REFERENCES sedes(id),
    observaciones TEXT,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. Detalle del Pedido
CREATE TABLE IF NOT EXISTS detalle_pedidos (
    id SERIAL PRIMARY KEY,
    pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
    corte_id INTEGER REFERENCES cortes(id),
    tipo_corte_id INTEGER REFERENCES tipos_corte(id),
    cantidad_kg FLOAT NOT NULL
);

-- Datos Iniciales de Prueba
INSERT INTO sedes (nombre, ciudad) VALUES ('Sede Principal Nordeste', 'Medellín') ON CONFLICT DO NOTHING;
INSERT INTO categorias (nombre) VALUES ('Res'), ('Cerdo'), ('Pollo'), ('Pescado') ON CONFLICT DO NOTHING;
INSERT INTO tipos_corte (nombre) VALUES ('Mariposa'), ('Delgado'), ('Grueso'), ('Molida') ON CONFLICT DO NOTHING;
