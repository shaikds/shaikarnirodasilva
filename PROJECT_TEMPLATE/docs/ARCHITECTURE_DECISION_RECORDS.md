# Architecture Decision Records (ADRs)

## What Are ADRs?

ADRs are short documents that capture important technical decisions. They help you:
- Remember WHY you chose a specific technology or approach
- Explain decisions to future collaborators (or future you)
- Avoid revisiting the same decisions repeatedly

## Template

Copy this template for each new decision:

```markdown
# ADR-[NUMBER]: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded by ADR-XXX]

## Date
[YYYY-MM-DD]

## Context
[What is the situation? What problem are we solving? What constraints do we have?]

## Options Considered

### Option 1: [Name]
- **Pros:** [list]
- **Cons:** [list]

### Option 2: [Name]
- **Pros:** [list]
- **Cons:** [list]

### Option 3: [Name]
- **Pros:** [list]
- **Cons:** [list]

## Decision
[Which option did you choose and WHY?]

## Consequences
### Positive
- [benefit]

### Negative
- [tradeoff you're accepting]

### Risks
- [what could go wrong]
```

---

## Examples

### ADR-001: Choose Project Language

**Status:** Accepted  
**Date:** 2024-01-10

**Context:**  
Starting a new web application. Need to choose the primary backend language.

**Options:**
1. **Java/Spring Boot** - Know it well, enterprise standard, verbose
2. **Node.js/Express** - JavaScript everywhere, fast development, large ecosystem
3. **Python/FastAPI** - Clean syntax, great for prototyping, good ML integration

**Decision:**  
Node.js/Express because:
- Can share code between frontend and backend
- Fastest for prototyping
- Huge npm ecosystem
- Good enough performance for our scale

**Consequences:**
- (+) Faster development cycle
- (+) One language for full stack
- (-) Not ideal for CPU-intensive tasks
- (-) Callback complexity (mitigated by async/await)

---

### ADR-002: Database Selection

**Status:** Accepted  
**Date:** 2024-01-10

**Context:**  
Need a database for user data, products, and orders. Data is highly relational.

**Options:**
1. **PostgreSQL** - Relational, ACID, powerful
2. **MongoDB** - Document store, flexible schema
3. **SQLite** - Zero configuration, file-based

**Decision:**  
PostgreSQL because:
- Data is clearly relational (users → orders → products)
- Need ACID transactions for payment processing
- Free tier available on Railway/Supabase
- Industry standard for production applications

**Consequences:**
- (+) Data integrity guaranteed
- (+) Powerful query capabilities
- (-) Need to manage migrations
- (-) More initial setup than SQLite

---

### ADR-003: Authentication Strategy

**Status:** Accepted  
**Date:** 2024-01-12

**Context:**  
Users need to log in. Need to decide authentication mechanism.

**Options:**
1. **JWT (JSON Web Tokens)** - Stateless, client stores token
2. **Session-based** - Server stores session, client has cookie
3. **OAuth only** - Delegate to Google/GitHub

**Decision:**  
JWT with refresh tokens because:
- Stateless = simpler backend
- Works well with SPAs and mobile apps
- Can add OAuth later as additional login method

**Consequences:**
- (+) No session storage needed
- (+) Works across services
- (-) Can't easily revoke tokens (mitigated by short expiry + refresh tokens)
- (-) Slightly larger payload than session cookie
