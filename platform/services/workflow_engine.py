"""
Workflow engine using Strategy pattern for phase automation.

Each phase is represented by a concrete PhaseStrategy subclass that defines
the auto and manual actions for that phase.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from sqlalchemy.orm import Session
    from models import Project, ProjectPhase


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Strategy base class
# ---------------------------------------------------------------------------

class PhaseStrategy(ABC):
    """Base class for phase strategies."""

    @property
    @abstractmethod
    def phase_number(self) -> int: ...

    @property
    @abstractmethod
    def phase_name(self) -> str: ...

    @abstractmethod
    def get_auto_actions(self) -> list[str]: ...

    @abstractmethod
    def get_manual_actions(self) -> list[str]: ...

    def execute_auto_actions(self, project: Project) -> list[dict]:
        """Simulate execution of auto actions and return results."""
        results = []
        for action_desc in self.get_auto_actions():
            results.append({
                "description": action_desc,
                "result": f"[Auto] {action_desc} - completed successfully",
            })
        return results


# ---------------------------------------------------------------------------
# Concrete strategies (one per phase)
# ---------------------------------------------------------------------------

class DiscoveryPhase(PhaseStrategy):
    phase_number = 1
    phase_name = "Discovery"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate discovery questionnaire from template",
            "Create client folder structure",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Schedule discovery call with client",
            "Fill in CLIENT_DISCOVERY.md during call",
            "Determine service type (AI/NoCode/WebDev/Retainer)",
            "Assess if project is a good fit",
        ]


class AssessmentPhase(PhaseStrategy):
    phase_number = 2
    phase_name = "Technical Assessment"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate technical assessment checklist",
            "Run automated code audit (if code provided)",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Request access to existing system",
            "Complete TECHNICAL_ASSESSMENT.md",
            "Identify critical issues and risks",
            "Document findings in audit report",
        ]


class EstimationPhase(PhaseStrategy):
    phase_number = 3
    phase_name = "Estimation"

    def get_auto_actions(self) -> list[str]:
        return [
            "Calculate estimate based on service type and complexity",
            "Generate estimation worksheet",
            "Apply complexity multipliers",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Review and adjust auto-generated estimate",
            "Break down into specific tasks",
            "Set final price and timeline",
        ]


class ProposalPhase(PhaseStrategy):
    phase_number = 4
    phase_name = "Proposal"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate proposal document from template",
            "Include estimated timeline and pricing",
            "Format for client presentation",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Review and customize proposal",
            "Send proposal to client",
            "Follow up if no response in 3 days",
        ]


class ContractPhase(PhaseStrategy):
    phase_number = 5
    phase_name = "Contract & SLA"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate SLA from template with project details",
            "Pre-fill scope, timeline, and payment terms",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Review SLA with client",
            "Negotiate terms if needed",
            "Get signed agreement",
            "Receive upfront payment (50%)",
        ]


class ProjectSetupPhase(PhaseStrategy):
    phase_number = 6
    phase_name = "Project Setup"

    def get_auto_actions(self) -> list[str]:
        return [
            "Create GitHub repository (client-{name}-{project})",
            "Copy client project template files",
            "Set up CI/CD pipeline",
            "Create project Kanban board",
            "Generate V1.0 milestone with issues",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Configure environment variables",
            "Set up branch protection rules",
            "Create communication channel with client",
            "Schedule kickoff meeting",
        ]


class DevelopmentPhase(PhaseStrategy):
    phase_number = 7
    phase_name = "Development"

    def get_auto_actions(self) -> list[str]:
        return [
            "Track sprint progress automatically",
            "Run CI/CD on each push",
            "Monitor test coverage",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Work through sprint tasks on Kanban board",
            "Create feature branches and PRs",
            "Self-review all code before merge",
            "Demo progress to client at milestones",
        ]


class WeeklyUpdatesPhase(PhaseStrategy):
    phase_number = 8
    phase_name = "Weekly Updates"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate weekly status report template",
            "Auto-fill completed tasks from GitHub",
            "Calculate milestone progress percentage",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Review and customize weekly report",
            "Add blockers and decisions needed",
            "Send report to client",
            "Schedule next check-in call",
        ]


class QATestingPhase(PhaseStrategy):
    phase_number = 9
    phase_name = "QA & Testing"

    def get_auto_actions(self) -> list[str]:
        return [
            "Run full test suite",
            "Generate test coverage report",
            "Run security audit (npm audit / pip audit)",
            "Run performance benchmark",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Manual smoke test on staging",
            "Test mobile responsiveness",
            "Cross-browser testing",
            "Client UAT (User Acceptance Testing)",
        ]


class DeploymentCloseoutPhase(PhaseStrategy):
    phase_number = 10
    phase_name = "Deployment & Closeout"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate handoff document from template",
            "Create credentials transfer checklist",
            "Generate final invoice",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Deploy to production",
            "Transfer all credentials to client",
            "Conduct knowledge transfer session",
            "Get client sign-off",
            "Collect final payment",
            "Request testimonial",
        ]


class RetainerOfferPhase(PhaseStrategy):
    phase_number = 11
    phase_name = "Retainer Offer"

    def get_auto_actions(self) -> list[str]:
        return [
            "Generate retainer proposal based on project scope",
            "Calculate recommended maintenance hours",
        ]

    def get_manual_actions(self) -> list[str]:
        return [
            "Present retainer options to client",
            "Discuss ongoing support needs",
            "Sign retainer agreement (if accepted)",
        ]


# ---------------------------------------------------------------------------
# Workflow engine
# ---------------------------------------------------------------------------

class WorkflowEngine:
    """Manages project workflow progression using the Strategy pattern."""

    def __init__(self) -> None:
        self.strategies: dict[int, PhaseStrategy] = {}
        self._register_all()

    def _register_all(self) -> None:
        """Register all phase strategy instances."""
        strategy_classes: list[type[PhaseStrategy]] = [
            DiscoveryPhase,
            AssessmentPhase,
            EstimationPhase,
            ProposalPhase,
            ContractPhase,
            ProjectSetupPhase,
            DevelopmentPhase,
            WeeklyUpdatesPhase,
            QATestingPhase,
            DeploymentCloseoutPhase,
            RetainerOfferPhase,
        ]
        for cls in strategy_classes:
            instance = cls()
            self.strategies[instance.phase_number] = instance

    def get_strategy(self, phase_number: int) -> PhaseStrategy:
        strategy = self.strategies.get(phase_number)
        if strategy is None:
            raise ValueError(f"No strategy registered for phase {phase_number}")
        return strategy

    def initialize_project_phases(self, db: Session, project: Project) -> list[ProjectPhase]:
        """Create all 11 phases with their actions for a new project."""
        from models import ProjectPhase as PhaseModel, PhaseAction

        created_phases = []
        for phase_num in range(1, 12):
            strategy = self.get_strategy(phase_num)

            # First phase starts as in_progress
            phase_status = "in_progress" if phase_num == 1 else "pending"
            started_at = _utcnow() if phase_num == 1 else None

            phase = PhaseModel(
                project_id=project.id,
                phase_number=phase_num,
                phase_name=strategy.phase_name,
                status=phase_status,
                started_at=started_at,
            )
            db.add(phase)
            db.flush()  # get the phase id

            sort_order = 0
            # Auto actions first
            auto_results = strategy.execute_auto_actions(project) if phase_num == 1 else []
            for i, desc in enumerate(strategy.get_auto_actions()):
                result = auto_results[i]["result"] if i < len(auto_results) else None
                status = "done" if phase_num == 1 else "pending"
                action = PhaseAction(
                    phase_id=phase.id,
                    description=desc,
                    action_type="auto",
                    status=status,
                    auto_result=result,
                    completed_at=_utcnow() if status == "done" else None,
                    sort_order=sort_order,
                )
                db.add(action)
                sort_order += 1

            # Manual actions
            for desc in strategy.get_manual_actions():
                action = PhaseAction(
                    phase_id=phase.id,
                    description=desc,
                    action_type="manual",
                    status="pending",
                    sort_order=sort_order,
                )
                db.add(action)
                sort_order += 1

            created_phases.append(phase)

        db.commit()
        return created_phases

    def start_phase(self, db: Session, phase: ProjectPhase) -> ProjectPhase:
        """Mark a phase as in_progress and execute auto actions."""
        if phase.status != "pending":
            raise ValueError(f"Phase is already {phase.status}")

        phase.status = "in_progress"
        phase.started_at = _utcnow()

        strategy = self.get_strategy(phase.phase_number)
        auto_results = strategy.execute_auto_actions(phase.project)

        # Mark auto actions as done
        for action in phase.actions:
            if action.action_type == "auto":
                matching = [r for r in auto_results if r["description"] == action.description]
                if matching:
                    action.status = "done"
                    action.auto_result = matching[0]["result"]
                    action.completed_at = _utcnow()

        db.commit()
        db.refresh(phase)
        return phase

    def complete_phase(self, db: Session, phase: ProjectPhase) -> ProjectPhase:
        """Mark a phase as completed."""
        if phase.status != "in_progress":
            raise ValueError(f"Phase must be in_progress to complete, currently {phase.status}")

        phase.status = "completed"
        phase.completed_at = _utcnow()
        db.commit()
        db.refresh(phase)
        return phase

    def advance_project(self, db: Session, project: Project) -> ProjectPhase | None:
        """Complete current phase and start the next one. Returns the new phase or None."""
        current = project.current_phase
        if current > 11:
            return None

        # Complete the current phase
        current_phase_obj = next(
            (p for p in project.phases if p.phase_number == current), None
        )
        if current_phase_obj and current_phase_obj.status == "in_progress":
            self.complete_phase(db, current_phase_obj)

        # Move to next phase
        next_num = current + 1
        if next_num > 11:
            project.status = "completed"
            project.updated_at = _utcnow()
            db.commit()
            return None

        project.current_phase = next_num
        project.updated_at = _utcnow()
        db.commit()

        next_phase_obj = next(
            (p for p in project.phases if p.phase_number == next_num), None
        )
        if next_phase_obj:
            return self.start_phase(db, next_phase_obj)
        return None


# Module-level singleton
workflow_engine = WorkflowEngine()
