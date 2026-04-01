from __future__ import annotations

import os
from typing import Dict, List


def _get_phase(project_data: Dict, phase_number: int) -> Dict:
    """Helper to get a specific phase."""
    for phase in project_data["phases"]:
        if phase["phase_number"] == phase_number:
            return phase
    raise ValueError(f"Phase {phase_number} not found")


def test_each_phase_generates_document(client, sample_project):
    """Starting each of the 11 phases should produce auto_result for auto actions."""
    pid = sample_project["id"]
    for phase_num in range(1, 12):
        phase = _get_phase(sample_project, phase_num)
        res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
        assert res.status_code == 200, f"Phase {phase_num} failed to start: {res.text}"
        phase_data = res.json()
        auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
        for action in auto_actions:
            assert action["auto_result"] is not None, (
                f"Phase {phase_num} ({phase_data['phase_name']}): "
                f"auto action '{action['description']}' has no auto_result"
            )
            assert len(action["auto_result"]) > 0


def test_document_contains_client_data(client, sample_project):
    """Generated documents should contain client company name."""
    pid = sample_project["id"]
    phase = _get_phase(sample_project, 1)
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    phase_data = res.json()
    auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    assert "Acme Corp" in auto_actions[0]["auto_result"]


def test_document_contains_project_data(client, sample_project):
    """Generated documents should contain project name."""
    pid = sample_project["id"]
    phase = _get_phase(sample_project, 1)
    res = client.post(f"/api/projects/{pid}/phases/{phase['id']}/start")
    phase_data = res.json()
    auto_actions = [a for a in phase_data["actions"] if a["action_type"] == "auto"]
    assert len(auto_actions) > 0
    assert "Test Dashboard" in auto_actions[0]["auto_result"]


def test_all_templates_exist():
    """All 10 expected template files should exist."""
    templates_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates"
    )
    expected_templates = [
        "discovery.md",
        "assessment.md",
        "estimation.md",
        "proposal.md",
        "sla.md",
        "sprint_planning.md",
        "weekly_report.md",
        "qa_checklist.md",
        "handoff.md",
        "retainer_proposal.md",
    ]
    for template in expected_templates:
        path = os.path.join(templates_dir, template)
        assert os.path.exists(path), f"Template file missing: {template}"
        # Ensure templates have content
        with open(path, "r") as f:
            content = f.read()
        assert len(content) > 50, f"Template {template} is too short ({len(content)} chars)"
