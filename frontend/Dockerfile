FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY frontend/package.json ./
# Use root lockfile if frontend doesn't have its own
COPY frontend/package-lock.json* ./
RUN npm install

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY frontend/ .
ENV NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
RUN npm run build

# Production - use standalone output
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
