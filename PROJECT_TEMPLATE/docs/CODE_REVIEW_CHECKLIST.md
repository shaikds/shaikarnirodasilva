# Code Review Checklist

Use this checklist when reviewing PRs (including your own).

## Quick Review (Every PR)

### Correctness
- [ ] Does the code do what the PR description says?
- [ ] Are there edge cases not handled? (null, empty, negative, overflow)
- [ ] Does error handling make sense? (not swallowing errors, logging useful info)
- [ ] Are API responses validated before use?

### Security
- [ ] No hardcoded secrets (passwords, API keys, tokens)
- [ ] User input is validated/sanitized
- [ ] No SQL injection vulnerabilities (use parameterized queries)
- [ ] No XSS vulnerabilities (HTML output is escaped)
- [ ] Authentication/authorization checks are in place
- [ ] Sensitive data is not logged

### Code Quality
- [ ] No leftover debug code (`console.log`, `print`, `TODO`, `FIXME`)
- [ ] No commented-out code blocks
- [ ] Variable and function names are descriptive
- [ ] No magic numbers (use named constants)
- [ ] DRY - no unnecessary code duplication
- [ ] Functions are focused (do one thing well)
- [ ] No overly complex logic (cyclomatic complexity)

### Testing
- [ ] Tests exist for new/changed code
- [ ] Tests cover happy path AND error cases
- [ ] Tests are readable and well-named
- [ ] No flaky tests (random failures)

### Performance
- [ ] No N+1 query problems (queries in loops)
- [ ] No unnecessary network calls
- [ ] Appropriate data structures used (Map vs Array for lookups)
- [ ] No memory leaks (event listeners removed, subscriptions cleaned up)

### Documentation
- [ ] PR description explains the "why", not just the "what"
- [ ] Complex logic has explanatory comments
- [ ] README updated if behavior changed
- [ ] API documentation updated if endpoints changed

## Deep Review (Important PRs)

### Architecture
- [ ] Changes fit the overall project architecture
- [ ] No circular dependencies introduced
- [ ] Appropriate separation of concerns
- [ ] Changes are backward compatible (or breaking changes are documented)

### Maintainability
- [ ] Would a new team member understand this code?
- [ ] Are there any "clever" tricks that should be simplified?
- [ ] Is the code easy to modify in the future?
- [ ] Are configuration values externalized (not hardcoded)?

### Scalability
- [ ] Will this work with 10x the current data?
- [ ] Are there potential bottlenecks?
- [ ] Is caching considered where appropriate?
- [ ] Are database queries optimized (indexes, joins)?

---

## Review Comment Templates

### Requesting a Change
```
issue: This query inside the loop will cause N+1 queries.
Consider fetching all users in one query before the loop:

​```js
const users = await User.findAll({ where: { id: userIds } });
const userMap = new Map(users.map(u => [u.id, u]));
for (const order of orders) {
    order.user = userMap.get(order.userId);
}
​```
```

### Making a Suggestion
```
suggestion: Consider using early returns to reduce nesting:

​```js
// Instead of:
if (user) {
    if (user.isActive) {
        // ... lots of code
    }
}

// Consider:
if (!user) return null;
if (!user.isActive) return null;
// ... lots of code (no nesting)
​```
```

### Giving Praise
```
praise: Really clean approach to handling the pagination! 
The cursor-based approach is much better than offset for large datasets.
```

### Asking for Clarification
```
question: What happens if the API returns a 429 (rate limited)?
I don't see retry logic here - is that handled elsewhere?
```
