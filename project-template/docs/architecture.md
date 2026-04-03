# Architecture

## Tech Stack
- **Frontend:** React + TypeScript
- **Backend:** Node.js + Express/Fastify
- **Database:** PostgreSQL + Prisma/Drizzle
- **Auth:** [JWT/OAuth/Clerk]
- **Hosting:** [Vercel/AWS/Railway]

## Directory Structure
```
src/
├── api/          # API route handlers
├── components/   # React components
├── db/           # Database models & queries
├── lib/          # Shared utilities
├── hooks/        # React hooks
├── types/        # TypeScript type definitions
└── index.ts      # Entry point
```

## Data Flow
```
Client → API Route → Validation (Zod) → Business Logic → Database
                                                              ↓
Client ← Response ← Transform ← ─────────────────────── Result
```

## Key Decisions
<!-- Document WHY, not just WHAT -->
- [Decision 1]: [Why]
- [Decision 2]: [Why]
