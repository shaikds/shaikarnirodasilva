---
paths:
  - "src/components/**/*.tsx"
  - "src/components/**/*.css"
---

# React Component Rules

- Functional components only
- Props interface must be exported and named: `export interface ButtonProps {}`
- One component per file
- CSS Modules for styling, not inline styles
- Use React.memo() for list item components
- Every component needs a test in `__tests__/`
- Prefer composition over prop drilling
