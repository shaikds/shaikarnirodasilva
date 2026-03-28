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

# Create entrypoint script
RUN printf '#!/bin/sh\nset -e\necho "Running Prisma migrations..."\ncd /app/backend\nls -la prisma/migrations/\nnpx prisma migrate deploy\necho "Starting backend server..."\ncd /app\nexec npx ts-node --transpile-only -P backend/tsconfig.json backend/src/index.ts\n' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 3001
CMD ["/app/entrypoint.sh"]
