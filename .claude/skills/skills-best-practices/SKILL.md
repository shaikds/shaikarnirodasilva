---
name: writing-effective-skills
description: "Applies Claude Code skill authoring best practices when creating or editing Skills. Use when writing SKILL.md files, organizing skill directory structures, writing skill descriptions, or improving existing skills."
---

# Skill Authoring Best Practices

Apply these rules when creating or editing Claude Code Skills.

## Quick reference

```yaml
# SKILL.md frontmatter (required)
---
name: doing-something        # max 64 chars, lowercase + hyphens only, gerund form
description: "Third person description of what it does and when to use it. Max 1024 chars."
---
```

## Core rules

1. **Concise is key** - Only add context Claude doesn't already have. Challenge each paragraph: "Does Claude really need this?"
2. **SKILL.md body under 500 lines** - Split into reference files if longer
3. **References one level deep** - SKILL.md → reference files. Never reference → reference → reference
4. **Third person descriptions** - "Processes Excel files" not "I can help you" or "You can use this"

## Naming

Use **gerund form** (verb + -ing):
- `processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`
- Acceptable alternatives: `pdf-processing`, `process-pdfs`
- Avoid: `helper`, `utils`, `tools`, `documents`
- Forbidden: `anthropic-*`, `claude-*`

## Description

Must include **what** it does AND **when** to use it:

```yaml
# Good:
description: "Extracts text and tables from PDF files, fills forms, merges documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction."

# Bad:
description: "Helps with documents"
```

## Progressive disclosure

SKILL.md = overview + links. Reference files = details loaded on-demand.

```text
my-skill/
├── SKILL.md              # Overview + navigation (loaded when triggered)
├── reference/
│   ├── domain-a.md       # Loaded only when needed
│   └── domain-b.md       # Loaded only when needed
└── scripts/
    └── validate.py       # Executed, not loaded into context
```

```markdown
# In SKILL.md - explicit links:
**Domain A**: See [domain-a.md](reference/domain-a.md) for details
**Domain B**: See [domain-b.md](reference/domain-b.md) for details
```

## Degrees of freedom

Match specificity to fragility:
- **High freedom** (text instructions) → multiple valid approaches, context-dependent
- **Medium freedom** (templates with params) → preferred pattern exists, some variation ok
- **Low freedom** (exact scripts) → fragile operations, consistency critical

## Workflows

For complex tasks, provide a **checklist**:

````markdown
```
Task Progress:
- [ ] Step 1: Analyze input
- [ ] Step 2: Create plan
- [ ] Step 3: Validate plan
- [ ] Step 4: Execute
- [ ] Step 5: Verify output
```
````

## Feedback loops

Run validator → fix errors → repeat:

```markdown
1. Make changes
2. Validate: `python scripts/validate.py`
3. If validation fails → fix → validate again
4. Only proceed when validation passes
```

## Common patterns

**Template pattern** - provide output format:
```markdown
ALWAYS use this structure:
# [Title]
## Summary
## Findings
## Recommendations
```

**Examples pattern** - input/output pairs:
```markdown
Input: Added user auth
Output: `feat(auth): implement JWT-based authentication`
```

**Conditional workflow** - guide through decision points:
```markdown
**Creating new?** → Follow creation workflow
**Editing existing?** → Follow editing workflow
```

## Anti-patterns to avoid

- Windows paths (`scripts\helper.py`) → use forward slashes
- Too many options ("use A, or B, or C, or D") → provide one default
- Time-sensitive info ("before August 2025") → use "old patterns" section
- Inconsistent terminology (mixing "field", "box", "element")
- Deep nesting (reference → reference → reference)
- Vague descriptions ("helps with documents")
- Verbose explanations of things Claude already knows

## Checklist

```
Skill Quality Check:
- [ ] Name uses gerund form (lowercase + hyphens)
- [ ] Description is third person + includes triggers
- [ ] SKILL.md body under 500 lines
- [ ] References are one level deep from SKILL.md
- [ ] No time-sensitive information
- [ ] Consistent terminology throughout
- [ ] Concrete examples, not abstract
- [ ] Forward slashes in all paths
- [ ] Tested with real usage scenarios
```
