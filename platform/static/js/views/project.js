/* Project detail view with phase navigation */
const ProjectView = {
    _project: null,
    _viewingPhase: null, // null = show current phase

    async render(container, projectId) {
        this._viewingPhase = null;
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            this._project = await API.get(`/api/projects/${projectId}`);
            container.innerHTML = this._html();
            this._bindEvents(container);
        } catch (err) {
            container.innerHTML = `<div class="error-state"><h2>Error</h2><p>${Utils.esc(err.message)}</p><a href="#dashboard" class="btn btn-secondary">Back to Dashboard</a></div>`;
        }
    },

    _viewPhase(phaseNumber) {
        this._viewingPhase = phaseNumber === this._project.current_phase ? null : phaseNumber;
        const container = document.getElementById('app');
        container.innerHTML = this._html();
        this._bindEvents(container);
    },

    _html() {
        const p = this._project;
        const client = p.client || {};
        const currentPhase = p.phases.find(ph => ph.phase_number === p.current_phase);
        const viewingNum = this._viewingPhase || p.current_phase;
        const displayPhase = p.phases.find(ph => ph.phase_number === viewingNum);
        const isViewingOther = this._viewingPhase && this._viewingPhase !== p.current_phase;
        const totalActions = p.phases.reduce((s, ph) => s + ph.actions.length, 0);
        const doneActions = p.phases.reduce((s, ph) => s + ph.actions.filter(a => a.status === 'done').length, 0);

        return `
            <div class="page-header">
                <a href="#dashboard" class="back-link">&larr; Dashboard</a>
                <h1>${Utils.esc(p.name)}</h1>
                <div class="project-meta">
                    <span>${Utils.esc(client.company || client.name || '')}</span>
                    <span>${Utils.badge(p.service_type)}</span>
                    ${p.budget ? `<span>${Utils.money(p.budget)}</span>` : ''}
                    ${p.timeline_weeks ? `<span>${p.timeline_weeks} weeks</span>` : ''}
                    <span class="badge badge-${p.status === 'active' ? 'blue' : p.status === 'completed' ? 'green' : 'gray'}">${p.status}</span>
                </div>
            </div>

            ${Timeline.render(p.phases, p.current_phase, this._viewingPhase)}

            <div class="overall-progress">
                <div class="progress-bar"><div class="progress-fill" style="width:${totalActions ? (doneActions/totalActions*100) : 0}%"></div></div>
                <span>${doneActions}/${totalActions} tasks done</span>
            </div>

            ${isViewingOther ? `
                <div class="phase-nav-bar">
                    <span>Viewing Phase ${displayPhase.phase_number}: ${Utils.esc(displayPhase.phase_name)}</span>
                    <button class="btn btn-primary btn-sm" onclick="ProjectView._viewPhase(${p.current_phase})">Return to Phase ${p.current_phase} &rarr;</button>
                </div>
            ` : ''}

            ${displayPhase ? this._phaseCard(displayPhase, !isViewingOther) : '<p>All phases complete!</p>'}

            <div class="phases-accordion">
                <h2>All Phases</h2>
                ${p.phases.map(ph => this._phaseAccordion(ph, ph.phase_number === viewingNum)).join('')}
            </div>`;
    },

    _phaseCard(phase, isCurrent) {
        const autoActions = phase.actions.filter(a => a.action_type === 'auto');
        const manualActions = phase.actions.filter(a => a.action_type === 'manual');
        const manualDone = manualActions.filter(a => a.status === 'done').length;
        const allManualDone = manualDone === manualActions.length;
        const isStarted = phase.status === 'in_progress' || phase.status === 'completed';

        return `
            <div class="phase-card ${isCurrent ? 'phase-current' : ''}">
                <div class="phase-card-header">
                    <h2>Phase ${phase.phase_number}: ${Utils.esc(phase.phase_name)}</h2>
                    <div class="phase-card-actions">
                        ${phase.status === 'completed' ? `<button class="btn btn-sm btn-outline btn-reopen" data-phase-id="${phase.id}">Reopen Phase</button>` : ''}
                        <span class="badge badge-${phase.status === 'completed' ? 'green' : phase.status === 'in_progress' ? 'blue' : 'gray'}">${phase.status}</span>
                    </div>
                </div>

                ${!isStarted && isCurrent ? `<button class="btn btn-primary btn-start-phase" data-phase-id="${phase.id}">Start Phase</button>` : ''}

                ${isStarted ? `
                <div class="actions-section">
                    <h3 class="actions-title auto-title">Automated (done for you)</h3>
                    ${autoActions.map(a => `
                        <div class="action-item action-auto ${a.status === 'done' ? 'done' : a.status === 'failed' ? 'failed' : ''}">
                            <span class="action-check">${a.status === 'done' ? '&#10003;' : a.status === 'failed' ? '&#10007;' : '&#8987;'}</span>
                            <span class="action-desc">${Utils.esc(a.description)}</span>
                            ${a.status === 'done' && a.auto_result ? `<button class="btn btn-sm btn-outline" onclick="DocViewer.show(${a.id})">Edit Document</button>` : ''}
                        </div>`).join('')}
                </div>

                <div class="actions-section">
                    <h3 class="actions-title manual-title">Your Tasks</h3>
                    ${manualActions.map(a => `
                        <div class="action-item action-manual ${a.status === 'done' ? 'done' : ''}">
                            <label class="action-checkbox" data-action-id="${a.id}">
                                <input type="checkbox" ${a.status === 'done' ? 'checked' : ''}>
                                <span class="checkmark"></span>
                            </label>
                            <div class="action-content">
                                <span class="action-desc">${Utils.esc(a.description)}</span>
                                ${a.hint ? `<span class="action-hint">&rarr; ${Utils.esc(a.hint)}</span>` : ''}
                            </div>
                        </div>`).join('')}
                </div>

                <div class="phase-footer">
                    <span class="progress-text">${manualDone} of ${manualActions.length} done</span>
                    ${isCurrent ? `<button class="btn ${allManualDone ? 'btn-success' : 'btn-disabled'}" ${allManualDone ? '' : 'disabled'} id="btn-advance">
                        Complete &amp; Advance &rarr;
                    </button>` : ''}
                </div>
                ` : ''}
            </div>`;
    },

    _phaseAccordion(phase, isExpanded) {
        const doneCount = phase.actions.filter(a => a.status === 'done').length;
        const statusIcon = phase.status === 'completed' ? '&#10003;' : phase.status === 'skipped' ? '&#8211;' : phase.status === 'in_progress' ? '&#9679;' : '&#9675;';
        const statusClass = phase.status === 'completed' ? 'completed' : phase.status === 'in_progress' ? 'current' : phase.status === 'skipped' ? 'skipped' : 'pending';

        return `
            <div class="accordion-item accordion-${statusClass}">
                <div class="accordion-header" onclick="ProjectView._viewPhase(${phase.phase_number})">
                    <span class="accordion-icon">${statusIcon}</span>
                    <span class="accordion-title">Phase ${phase.phase_number}: ${Utils.esc(phase.phase_name)}</span>
                    <span class="accordion-meta">${doneCount}/${phase.actions.length} tasks</span>
                    <span class="accordion-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                </div>
                <div class="accordion-body" style="display:${isExpanded ? 'block' : 'none'}">
                    ${this._phaseCard(phase, false)}
                </div>
            </div>`;
    },

    _bindEvents(container) {
        // Checkbox toggles - update in place, no reload
        container.querySelectorAll('.action-checkbox').forEach(label => {
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', async () => {
                const actionId = label.dataset.actionId;
                try {
                    await API.put(`/api/actions/${actionId}/toggle`);
                    const item = label.closest('.action-item');
                    item.classList.toggle('done');
                    // Refresh data to update progress
                    this._project = await API.get(`/api/projects/${this._project.id}`);
                    const viewingNum = this._viewingPhase || this._project.current_phase;
                    const viewedPhase = this._project.phases.find(ph => ph.phase_number === viewingNum);
                    if (viewedPhase) {
                        const manualActions = viewedPhase.actions.filter(a => a.action_type === 'manual');
                        const manualDone = manualActions.filter(a => a.status === 'done').length;
                        const allDone = manualDone === manualActions.length;
                        const progressText = container.querySelector('.phase-current .progress-text') || container.querySelector('.phase-card .progress-text');
                        if (progressText) progressText.textContent = `${manualDone} of ${manualActions.length} done`;
                        const advBtn = container.querySelector('#btn-advance');
                        if (advBtn) {
                            advBtn.disabled = !allDone;
                            advBtn.className = `btn ${allDone ? 'btn-success' : 'btn-disabled'}`;
                        }
                    }
                    // Update overall progress
                    const totalActions = this._project.phases.reduce((s, ph) => s + ph.actions.length, 0);
                    const doneActions = this._project.phases.reduce((s, ph) => s + ph.actions.filter(a => a.status === 'done').length, 0);
                    const overallFill = container.querySelector('.overall-progress .progress-fill');
                    const overallText = container.querySelector('.overall-progress span');
                    if (overallFill) overallFill.style.width = `${totalActions ? (doneActions/totalActions*100) : 0}%`;
                    if (overallText) overallText.textContent = `${doneActions}/${totalActions} tasks done`;
                } catch (err) {
                    checkbox.checked = !checkbox.checked;
                    Toast.error(err.message);
                }
            });
        });

        // Start phase
        const startBtn = container.querySelector('.btn-start-phase');
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                try {
                    startBtn.disabled = true;
                    startBtn.textContent = 'Starting...';
                    await API.post(`/api/projects/${this._project.id}/phases/${startBtn.dataset.phaseId}/start`);
                    Toast.success('Phase started! Documents generated.');
                    this._project = await API.get(`/api/projects/${this._project.id}`);
                    container.innerHTML = this._html();
                    this._bindEvents(container);
                } catch (err) { Toast.error(err.message); startBtn.disabled = false; startBtn.textContent = 'Start Phase'; }
            });
        }

        // Advance
        const advBtn = container.querySelector('#btn-advance');
        if (advBtn) {
            advBtn.addEventListener('click', async () => {
                try {
                    advBtn.disabled = true;
                    advBtn.textContent = 'Advancing...';
                    await API.post(`/api/projects/${this._project.id}/advance`);
                    Toast.success('Advanced to next phase!');
                    this._viewingPhase = null;
                    this._project = await API.get(`/api/projects/${this._project.id}`);
                    container.innerHTML = this._html();
                    this._bindEvents(container);
                } catch (err) { Toast.error(err.message); advBtn.disabled = false; }
            });
        }

        // Reopen phase buttons
        container.querySelectorAll('.btn-reopen').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    btn.disabled = true;
                    btn.textContent = 'Reopening...';
                    await API.post(`/api/projects/${this._project.id}/phases/${btn.dataset.phaseId}/reopen`);
                    Toast.success('Phase reopened for editing');
                    this._project = await API.get(`/api/projects/${this._project.id}`);
                    container.innerHTML = this._html();
                    this._bindEvents(container);
                } catch (err) { Toast.error(err.message); btn.disabled = false; btn.textContent = 'Reopen Phase'; }
            });
        });
    }
};
