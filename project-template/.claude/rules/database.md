---
paths:
  - "prisma/**"
  - "src/db/**/*.ts"
  - "drizzle/**"
---

# Database Rules

- All migrations must be reversible
- Never DROP TABLE without explicit approval
- Index all foreign keys
- Use transactions for multi-table writes
- Soft delete (deletedAt) preferred over hard delete
- Column names: snake_case
- Table names: plural (users, orders, products)
