/**
 * Project Detail Page Logic
 */
(function() {
    'use strict';

    var project = null;
    var projectId = null;

    function init() {
        Utils.initMobileMenu();
        projectId = Utils.getProjectIdFromURL();
        if (!projectId) {
            Toast.error('No project ID specified.');
            document.getElementById('project-content').innerHTML =
                '<div class="empty-state"><h3>Project not found</h3><p>No project ID was provided.</p>' +
                '<a href="index.html" class="btn btn-secondary">Back to Dashboard</a></div>';
            return;
        }
        loadProject();
    }

    async function loadProject() {
        var content = document.getElementById('project-content');
        content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';

        try {
            project = await API.get('/projects/' + projectId);
            renderProject();
        } catch (err) {
            Toast.error('Failed to load project: ' + err.message);
            content.innerHTML =
                '<div class="empty-state"><h3>Error loading project</h3><p>' + Utils.escapeHtml(err.message) + '</p>' +
                '<a href="index.html" class="btn btn-secondary">Back to Dashboard</a></div>';
        }
    }

    function renderProject() {
        var content = document.getElementById('project-content');
        var p = project;
        var phases = p.phases || [];

        // Find current phase
        var currentPhase = null;
        for (var i = 0; i < phases.length; i++) {
            if (phases[i].status === 'in_progress' || phases[i].status === 'in progress') {
                currentPhase = phases[i];
                break;
            }
        }

        var html = '';

        // Project Header
        html += '<div class="project-header">';
        html += '<a href="index.html" class="back-link">&#8592; Back to Dashboard</a>';
        html += '<h1>' + Utils.escapeHtml(p.name) + '</h1>';
        html += '<div class="project-meta">';
        html += '<span>Client: <strong>' + Utils.escapeHtml(p.client_name || 'N/A') + '</strong></span>';
        html += '<span class="meta-sep">|</span>';
        html += '<span class="badge ' + Utils.getServiceBadgeClass(p.service_type) + '">' + Utils.escapeHtml(p.service_type || 'General') + '</span>';
        html += '<span class="meta-sep">|</span>';
        html += '<span>Budget: <strong>' + Utils.formatCurrencyFull(p.budget) + '</strong></span>';
        if (p.timeline_weeks) {
            html += '<span class="meta-sep">|</span>';
            html += '<span>Timeline: <strong>' + p.timeline_weeks + ' weeks</strong></span>';
        }
        html += '</div></div>';

        // Phase Timeline
        html += renderTimeline(phases, currentPhase);

        // Current Phase Card
        if (currentPhase) {
            html += renderCurrentPhase(currentPhase);
        }

        // All Phases Accordion
        html += '<div class="phases-list">';
        html += '<div class="section-header"><h2>All Phases</h2></div>';
        for (var j = 0; j < phases.length; j++) {
            html += renderPhaseAccordion(phases[j], currentPhase);
        }
        html += '</div>';

        content.innerHTML = html;
        bindActions();
    }

    function renderTimeline(phases, currentPhase) {
        var html = '<div class="card mb-3"><div class="card-body"><div class="phase-timeline">';
        for (var i = 0; i < phases.length; i++) {
            var ph = phases[i];
            var cls = 'future';
            var icon = ph.phase_number;
            if (ph.status === 'completed' || ph.status === 'done') {
                cls = 'completed';
                icon = '&#10003;';
            } else if (ph.status === 'in_progress' || ph.status === 'in progress') {
                cls = 'current';
            }

            html += '<div class="phase-step ' + cls + '">';
            html += '<div class="step-circle">' + icon + '</div>';
            html += '<div class="step-tooltip">' + Utils.escapeHtml(ph.phase_name) + '</div>';
            if (i < phases.length - 1) {
                html += '<div class="step-connector"></div>';
            }
            html += '</div>';
        }
        html += '</div></div></div>';
        return html;
    }

    function renderCurrentPhase(phase) {
        var actions = phase.actions || [];
        var autoActions = [];
        var manualActions = [];

        for (var i = 0; i < actions.length; i++) {
            if (actions[i].action_type === 'automated' || actions[i].action_type === 'auto') {
                autoActions.push(actions[i]);
            } else {
                manualActions.push(actions[i]);
            }
        }

        // Check if all manual actions are done
        var allManualDone = true;
        for (var k = 0; k < manualActions.length; k++) {
            if (manualActions[k].status !== 'completed' && manualActions[k].status !== 'done') {
                allManualDone = false;
                break;
            }
        }
        // Also check auto actions
        var allDone = allManualDone;
        for (var m = 0; m < autoActions.length; m++) {
            if (autoActions[m].status !== 'completed' && autoActions[m].status !== 'done') {
                allDone = false;
                break;
            }
        }

        var html = '<div class="current-phase-card">';
        html += '<div class="current-phase-header">';
        html += '<h3>Phase ' + phase.phase_number + ': ' + Utils.escapeHtml(phase.phase_name) + '</h3>';
        html += '<span class="badge badge-in-progress">In Progress</span>';
        html += '</div>';
        html += '<div class="current-phase-body">';

        // Automated Actions
        if (autoActions.length > 0) {
            html += '<div class="actions-section">';
            html += '<div class="actions-section-title"><span class="icon">&#9881;</span> Automated Actions</div>';
            for (var a = 0; a < autoActions.length; a++) {
                var act = autoActions[a];
                var done = act.status === 'completed' || act.status === 'done';
                html += '<div class="action-item ' + (done ? 'done' : '') + '">';
                html += '<div class="action-checkbox" data-action-id="' + act.id + '" data-done="' + done + '">';
                if (done) html += '&#10003;';
                html += '</div>';
                html += '<span class="action-text">' + Utils.escapeHtml(act.description) + '</span>';
                html += '<span class="action-type-badge action-type-auto">Auto</span>';
                html += '</div>';
            }
            html += '</div>';
        }

        // Manual Actions
        if (manualActions.length > 0) {
            html += '<div class="actions-section">';
            html += '<div class="actions-section-title"><span class="icon">&#9998;</span> Manual Actions (Your Tasks)</div>';
            for (var b = 0; b < manualActions.length; b++) {
                var mact = manualActions[b];
                var mdone = mact.status === 'completed' || mact.status === 'done';
                html += '<div class="action-item ' + (mdone ? 'done' : '') + '">';
                html += '<div class="action-checkbox" data-action-id="' + mact.id + '" data-done="' + mdone + '">';
                if (mdone) html += '&#10003;';
                html += '</div>';
                html += '<span class="action-text">' + Utils.escapeHtml(mact.description) + '</span>';
                html += '<span class="action-type-badge action-type-manual">Manual</span>';
                html += '</div>';
            }
            html += '</div>';
        }

        if (actions.length === 0) {
            html += '<div class="empty-state" style="padding:1.5rem"><p>No actions defined for this phase.</p></div>';
        }

        html += '</div>'; // end body

        html += '<div class="current-phase-footer">';
        html += '<button class="btn btn-success btn-lg" id="btn-advance"' + (allManualDone ? '' : ' disabled') + '>';
        html += 'Complete Phase & Advance &#8594;</button>';
        html += '</div>';
        html += '</div>';

        return html;
    }

    function renderPhaseAccordion(phase, currentPhase) {
        var status = 'pending';
        if (phase.status === 'completed' || phase.status === 'done') {
            status = 'completed';
        } else if (phase.status === 'in_progress' || phase.status === 'in progress') {
            status = 'in-progress';
        }

        var isCurrent = currentPhase && phase.id === currentPhase.id;
        var actions = phase.actions || [];
        var doneCount = 0;
        for (var i = 0; i < actions.length; i++) {
            if (actions[i].status === 'completed' || actions[i].status === 'done') doneCount++;
        }

        var html = '<div class="phase-accordion ' + status + (isCurrent ? ' active' : '') + '">';
        html += '<div class="phase-accordion-header" onclick="this.parentElement.classList.toggle(\'open\')">';
        html += '<div class="phase-num">';
        if (status === 'completed') {
            html += '&#10003;';
        } else {
            html += phase.phase_number;
        }
        html += '</div>';
        html += '<div class="phase-info">';
        html += '<div class="phase-title">' + Utils.escapeHtml(phase.phase_name) + '</div>';
        html += '<div class="phase-meta">';
        if (status === 'completed') {
            html += doneCount + '/' + actions.length + ' actions completed';
        } else if (status === 'in-progress') {
            html += doneCount + '/' + actions.length + ' actions done';
        } else {
            html += actions.length + ' actions';
        }
        html += '</div></div>';
        html += '<span class="badge badge-status badge-' + (status === 'in-progress' ? 'active' : status) + '">' +
            (status === 'completed' ? 'Completed' : status === 'in-progress' ? 'In Progress' : 'Pending') + '</span>';
        html += '<span class="chevron">&#9660;</span>';
        html += '</div>';

        // Accordion body
        html += '<div class="phase-accordion-body"><div class="phase-accordion-content">';
        if (actions.length === 0) {
            html += '<p style="color: var(--gray); font-size: 0.85rem;">No actions defined.</p>';
        } else {
            for (var j = 0; j < actions.length; j++) {
                var act = actions[j];
                var adone = act.status === 'completed' || act.status === 'done';
                html += '<div class="action-item ' + (adone ? 'done' : '') + '">';
                html += '<div class="action-checkbox" style="cursor: default;">';
                if (adone) html += '&#10003;';
                html += '</div>';
                html += '<span class="action-text">' + Utils.escapeHtml(act.description) + '</span>';
                var typeClass = (act.action_type === 'automated' || act.action_type === 'auto') ? 'action-type-auto' : 'action-type-manual';
                var typeLabel = (act.action_type === 'automated' || act.action_type === 'auto') ? 'Auto' : 'Manual';
                html += '<span class="action-type-badge ' + typeClass + '">' + typeLabel + '</span>';
                html += '</div>';
            }
        }
        html += '</div></div></div>';

        return html;
    }

    function bindActions() {
        // Bind checkbox clicks in current phase card
        var checkboxes = document.querySelectorAll('.current-phase-card .action-checkbox');
        for (var i = 0; i < checkboxes.length; i++) {
            checkboxes[i].addEventListener('click', handleActionToggle);
        }

        // Bind advance button
        var advanceBtn = document.getElementById('btn-advance');
        if (advanceBtn) {
            advanceBtn.addEventListener('click', handleAdvance);
        }
    }

    async function handleActionToggle(e) {
        var el = e.currentTarget;
        var actionId = el.getAttribute('data-action-id');
        var isDone = el.getAttribute('data-done') === 'true';

        try {
            if (isDone) {
                await API.put('/actions/' + actionId + '/undo');
                Toast.success('Action marked as not done.');
            } else {
                await API.put('/actions/' + actionId + '/complete');
                Toast.success('Action completed!');
            }
            // Reload project to refresh state
            await loadProject();
        } catch (err) {
            Toast.error('Failed to update action: ' + err.message);
        }
    }

    async function handleAdvance() {
        var btn = document.getElementById('btn-advance');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Advancing...';
        }

        try {
            await API.post('/projects/' + projectId + '/advance');
            Toast.success('Phase completed! Moving to next phase.');
            await loadProject();
        } catch (err) {
            Toast.error('Failed to advance phase: ' + err.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Complete Phase & Advance &#8594;';
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
