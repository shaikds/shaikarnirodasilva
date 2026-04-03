# GitHub Projects V2

## Rule
Use GitHub Projects V2 for project management with custom fields and automated workflows.

## Recommended Custom Fields
```
Priority:   P0 (Critical) / P1 (High) / P2 (Medium) / P3 (Low)
Size:       XS / S / M / L / XL
Sprint:     Sprint 1 / Sprint 2 / Sprint 3 / ...
Team:       Frontend / Backend / DevOps / Design
Type:       Bug / Feature / Tech Debt / Spike
```

## Automated Workflows
```
Built-in automations (Settings -> Workflows):

- Item added to project  -> Status: "Triage"
- Issue opened           -> Status: "Backlog"
- PR opened              -> Status: "In Review"
- PR merged              -> Status: "Done"
- Issue closed           -> Status: "Done"
- Item reopened          -> Status: "In Progress"
```

## Views
```
Board View:    Kanban-style (Backlog | In Progress | In Review | Done)
Table View:    Spreadsheet with all fields (good for prioritization)
Roadmap View:  Timeline/Gantt chart (needs date fields)
```

## API/CLI Integration
```bash
# Add issue to project via gh CLI
gh project item-add PROJECT_NUMBER --owner ORG --url ISSUE_URL
```

## Why
Projects V2 is NOT the old GitHub Projects. It has custom fields, multiple views (Board, Table, Roadmap), and built-in automations. Many teams use Jira when Projects V2 would suffice.
