# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim

# Dependencias nativas del sistema para compilar better-sqlite3 y sqlite-vec si fuera necesario
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia de manifiestos de dependencias
COPY package.json package-lock.json ./

# Instalación limpia y reproducible de dependencias
RUN npm ci

# Copia del código fuente y componentes
COPY . .

# Directorio de persistencia para SQLite
VOLUME ["/app/db"]

# Variables de entorno
ENV NODE_ENV=production \
    LEARN_CODE_DB_PATH=/app/db/learn_code.db

# Ejecución por defecto
CMD ["npm", "test"]
