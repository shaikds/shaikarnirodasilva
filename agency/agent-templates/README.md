# AI Agent Templates - SilvA.i

Pre-built agent configurations ready to deploy using the AI Agent Hub API.

## How to Use

Each JSON file contains a complete agent configuration matching the Agent model schema. Deploy via the API:

```bash
curl -X POST http://localhost:8000/api/v1/agents \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @customer_support_agent.json
```

Or load programmatically:
```python
import json
with open("agency/agent-templates/customer_support_agent.json") as f:
    config = json.load(f)
# POST to /api/v1/agents with config
```

## Available Templates

| Template | Use Case | Model | Tools |
|----------|----------|-------|-------|
| [customer_support_agent](customer_support_agent.json) | Customer support chatbot | gpt-4 | search_kb, create_ticket, escalate |
| [data_extraction_agent](data_extraction_agent.json) | Extract data from documents/web | gpt-4 | read_document, extract_table, export_csv |
| [content_writer_agent](content_writer_agent.json) | Blog posts, social media content | gpt-4 | search_web, generate_text, format_output |
| [code_reviewer_agent](code_reviewer_agent.json) | Automated code review | gpt-4 | read_file, analyze_code, suggest_fix |

## Customization

Each template is a starting point. Customize for each client:

1. **system_prompt** - Adjust to match client's business, tone, and domain
2. **tools** - Add/remove based on what integrations the client needs
3. **model** - Choose based on budget vs quality needs
4. **max_iterations** - Increase for complex tasks, decrease for simple ones
