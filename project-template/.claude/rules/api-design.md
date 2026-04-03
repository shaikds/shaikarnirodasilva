---
paths:
  - "src/api/**/*.ts"
  - "src/routes/**/*.ts"
---

# API Design Rules

- All endpoints return: `{ data, error, meta }`
- Input validation with Zod schemas
- Use proper HTTP status codes (201 for create, 204 for delete)
- Rate limiting on public endpoints
- Log all 5xx errors with context
- Never expose internal IDs - use UUIDs externally
- Pagination: cursor-based for lists, not offset
