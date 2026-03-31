"""Workflow engine with strategy pattern for 11 project phases."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


class PhaseDefinition:
    """Base class for phase definitions."""

    phase_name: str = ""

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return []

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return []


class DiscoveryPhase(PhaseDefinition):
    phase_name = "Discovery"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate discovery questionnaire", "template": "discovery"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Schedule discovery call", "hint": "Book 30-60 min video call. Use generated questionnaire as agenda."},
            {"description": "Conduct call and fill answers", "hint": "Go through each section. Focus on: problem, users, budget, timeline."},
            {"description": "Determine service type", "hint": "AI Agents / No-Code to Prod / Web Dev / Retainer"},
            {"description": "Assess project fit", "hint": "Check: realistic budget? Clear requirements? Good communication?"},
        ]


class TechnicalAssessmentPhase(PhaseDefinition):
    phase_name = "Technical Assessment"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate assessment checklist", "template": "assessment"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Request access to existing system", "hint": "Ask for URL, code access, or Base44/Lovable export."},
            {"description": "Complete the assessment", "hint": "Score each category 1-5 using the checklist."},
            {"description": "Document findings", "hint": "Summarize: Go/No-Go, estimated hours, key risks."},
        ]


class EstimationPhase(PhaseDefinition):
    phase_name = "Estimation"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate estimation worksheet", "template": "estimation"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Review and adjust estimates", "hint": "Check hours against experience. Apply complexity multipliers."},
            {"description": "Set final price and timeline", "hint": "Add 20% buffer. Compare with service packages."},
        ]


class ProposalPhase(PhaseDefinition):
    phase_name = "Proposal"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate client proposal", "template": "proposal"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Review and customize", "hint": "Check pricing, timeline, features, tone."},
            {"description": "Send to client", "hint": "Email proposal. Follow up in 3 days if no response."},
        ]


class ContractPhase(PhaseDefinition):
    phase_name = "Contract"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate SLA", "template": "sla"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Review with client", "hint": "Walk through scope, milestones, payments, warranty."},
            {"description": "Get signed agreement", "hint": "Both parties sign. Keep copy."},
            {"description": "Receive upfront payment", "hint": "50% before starting. Confirm received."},
        ]


class ProjectSetupPhase(PhaseDefinition):
    phase_name = "Project Setup"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate setup instructions", "template": "sprint_planning"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Create GitHub repository", "hint": "Name: client-{name}-{project}. Copy template."},
            {"description": "Configure CI/CD", "hint": "GitHub Actions, .env, branch protection."},
            {"description": "Create Kanban board", "hint": "Columns: Backlog, Sprint, In Progress, Review, Done."},
            {"description": "Schedule kickoff meeting", "hint": "Review timeline, communication, staging URL, first sprint."},
        ]


class DevelopmentPhase(PhaseDefinition):
    phase_name = "Development"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate sprint template", "template": "sprint_planning"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Work through sprint tasks", "hint": "Follow Kanban. WIP limit: 2 tasks."},
            {"description": "Create PRs", "hint": "Branch: feature/XX-desc. Always PR, never push to main."},
            {"description": "Self-review code", "hint": "No debug code, no secrets, tests pass, lint clean."},
            {"description": "Demo to client", "hint": "Share staging URL. Walk through features. Get feedback."},
        ]


class WeeklyUpdatesPhase(PhaseDefinition):
    phase_name = "Weekly Updates"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate weekly report", "template": "weekly_report"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Fill in tasks and blockers", "hint": "Completed, planned, blockers."},
            {"description": "Send report to client", "hint": "Email or Slack. Include staging URL."},
        ]


class QAPhase(PhaseDefinition):
    phase_name = "QA"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate QA checklist", "template": "qa_checklist"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Run test suite", "hint": "make test - all must pass."},
            {"description": "Manual smoke test", "hint": "Test core flows: login, main features, errors."},
            {"description": "Mobile and browser test", "hint": "Chrome, Firefox, Safari. iOS, Android."},
            {"description": "Get client UAT approval", "hint": "Client tests staging and confirms."},
        ]


class DeploymentCloseoutPhase(PhaseDefinition):
    phase_name = "Deployment & Closeout"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate handoff document", "template": "handoff"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Deploy to production", "hint": "HTTPS, domain, database, monitoring."},
            {"description": "Transfer credentials", "hint": "GitHub, hosting, DB, domain, API keys."},
            {"description": "Knowledge transfer", "hint": "1-hour demo: features, admin, updates."},
            {"description": "Collect final payment", "hint": "Send invoice. Confirm received."},
            {"description": "Request testimonial", "hint": "Ask for review for portfolio."},
        ]


class RetainerPhase(PhaseDefinition):
    phase_name = "Retainer"

    def get_auto_actions(self) -> List[Dict[str, Optional[str]]]:
        return [
            {"description": "Generate retainer proposal", "template": "retainer_proposal"},
        ]

    def get_manual_actions(self) -> List[Dict[str, str]]:
        return [
            {"description": "Present options", "hint": "Basic $400, Standard $750, Premium $1400. Recommend by complexity."},
            {"description": "Sign retainer (if accepted)", "hint": "Monthly billing, define response times and hours."},
        ]


# Ordered list of all 11 phases
ALL_PHASES: List[PhaseDefinition] = [
    DiscoveryPhase(),
    TechnicalAssessmentPhase(),
    EstimationPhase(),
    ProposalPhase(),
    ContractPhase(),
    ProjectSetupPhase(),
    DevelopmentPhase(),
    WeeklyUpdatesPhase(),
    QAPhase(),
    DeploymentCloseoutPhase(),
    RetainerPhase(),
]


def get_phase_definitions() -> List[PhaseDefinition]:
    """Return all 11 phase definitions in order."""
    return ALL_PHASES
