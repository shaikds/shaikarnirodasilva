FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
RUN npm ci --workspace=shared --workspace=backend

# Build shared
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/shared/node_modules ./shared/node_modules
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY tsconfig.base.json ./
COPY shared/ ./shared/
COPY backend/ ./backend/

# Generate Prisma client
RUN cd backend && npx prisma generate

# Production
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend
COPY tsconfig.base.json ./

EXPOSE 3001
CMD ["npx", "ts-node", "--transpile-only", "-P", "backend/tsconfig.json", "backend/src/index.ts"]
