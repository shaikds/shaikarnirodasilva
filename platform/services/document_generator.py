"""Document generator that reads REAL template files and fills placeholders."""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Dict, Optional


class DocumentGenerator:
    """Generates documents from markdown template files with placeholder substitution."""

    def __init__(self, templates_dir: str) -> None:
        self.templates_dir = templates_dir

    def generate(self, template_name: str, context: Dict[str, Any]) -> str:
        """Read a template file and replace {{placeholders}} with context values."""
        path = os.path.join(self.templates_dir, f"{template_name}.md")
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        for key, value in context.items():
            content = content.replace("{{" + key + "}}", str(value))
        return content

    def build_context(self, project: Any, client: Any) -> Dict[str, str]:
        """Build a template context dictionary from project and client models."""
        service_labels: Dict[str, str] = {
            "ai_agents": "AI Agents & Automation",
            "nocode_to_prod": "No-Code to Production",
            "web_dev": "Web Development",
            "retainer": "Ongoing Maintenance",
        }
        return {
            "client_name": client.name,
            "client_company": client.company,
            "client_email": client.email,
            "client_phone": client.phone or "N/A",
            "project_name": project.name,
            "service_type": service_labels.get(project.service_type, project.service_type),
            "budget": f"${project.budget:,.0f}" if project.budget else "TBD",
            "timeline": f"{project.timeline_weeks} weeks" if project.timeline_weeks else "TBD",
            "date": datetime.now().strftime("%Y-%m-%d"),
        }
