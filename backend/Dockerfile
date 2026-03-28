FROM node:20-alpine AS base
WORKDIR /app

# Install OpenSSL for Prisma on Alpine
RUN apk add --no-cache openssl

# Copy root workspace files
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Install ALL workspace dependencies
RUN npm ci

# Copy source code
COPY shared/ ./shared/
COPY backend/ ./backend/

# Build the shared package so dist/index.js exists
RUN cd shared && npx tsc

# Generate Prisma client
RUN cd backend && npx prisma generate

# Verify migrations exist
RUN ls -la /app/backend/prisma/migrations/ && ls -la /app/backend/prisma/migrations/0001_init/

# Create entrypoint script that runs from the correct directory
RUN cat > /app/entrypoint.sh << 'SCRIPT'
#!/bin/sh
set -e
echo "Running Prisma migrations..."
cd /app/backend
ls -la prisma/migrations/
npx prisma migrate deploy
echo "Starting backend server..."
cd /app
exec npx ts-node --transpile-only -P backend/tsconfig.json backend/src/index.ts
SCRIPT
RUN chmod +x /app/entrypoint.sh

EXPOSE 3001
CMD ["/app/entrypoint.sh"]
