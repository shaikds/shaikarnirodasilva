# GitHub Search Operators

## Rule
Use search operators for precise GitHub searches instead of plain text.

## Code Search
```
# Find specific code patterns
language:java "implements Serializable" org:my-company
language:python "def __init__" filename:models
filename:docker-compose extension:yml path:deploy/
"API_KEY" NOT test NOT mock  # Exclude test files

# Find files
filename:.env
filename:Dockerfile path:services/
extension:yml path:.github/workflows
```

## Issue & PR Search
```
# Issues
is:issue is:open label:bug sort:reactions-+1-desc
is:issue assignee:@me milestone:"v2.0"
is:issue no:assignee label:bug  # Unassigned bugs
is:issue comments:>10          # Hot discussions

# Pull Requests
is:pr review:required draft:false
is:pr is:open author:username
is:pr merged:>2024-01-01
is:pr review:approved -is:merged  # Approved but not merged
```

## Commit Search
```
author:username committer-date:>2024-01-01
author:username "fix" path:src/
```

## Repository Search
```
stars:>1000 language:python topic:machine-learning
pushed:>2024-06-01 language:typescript stars:>100
org:my-company archived:false
```

## Why
GitHub search is incredibly powerful but most people just type a word in the search box. With operators you can find anything across the entire platform.
