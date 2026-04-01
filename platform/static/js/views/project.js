/* Project detail view */
const ProjectView = {
    _project: null,

    async render(container, projectId) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            this._project = await API.get(`/api/projects/${projectId}`);
            container.innerHTML = this._html();
            this._bindEvents(container);
        } catch (err) {
            container.innerHTML = `<div class="error-state"><h2>Error</h2><p>${Utils.esc(err.message)}</p><a href="#dashboard" class="btn btn-secondary">Back to Dashboard</a></div>`;
        }
    },

    _html() {
        const p = this._project;
        const client = p.client || {};
        const currentPhase = p.phases.find(ph => ph.phase_number === p.current_phase);
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

            ${Timeline.render(p.phases, p.current_phase)}

            <div class="overall-progress">
                <div class="progress-bar"><div class="progress-fill" style="width:${totalActions ? (doneActions/totalActions*100) : 0}%"></div></div>
                <span>${doneActions}/${totalActions} tasks done</span>
            </div>

            ${currentPhase ? this._phaseCard(currentPhase, true) : '<p>All phases complete!</p>'}

            <div class="phases-accordion">
                <h2>All Phases</h2>
                ${p.phases.map(ph => this._phaseAccordion(ph, ph.phase_number === p.current_phase)).join('')}
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
                    <span class="badge badge-${phase.status === 'completed' ? 'green' : phase.status === 'in_progress' ? 'blue' : 'gray'}">${phase.status}</span>
                </div>

                ${!isStarted && isCurrent ? `<button class="btn btn-primary btn-start-phase" data-phase-id="${phase.id}">Start Phase</button>` : ''}

                ${isStarted ? `
                <div class="actions-section">
                    <h3 class="actions-title auto-title">Automated (done for you)</h3>
                    ${autoActions.map(a => `
                        <div class="action-item action-auto ${a.status === 'done' ? 'done' : a.status === 'failed' ? 'failed' : ''}">
                            <span class="action-check">${a.status === 'done' ? '&#10003;' : a.status === 'failed' ? '&#10007;' : '&#8987;'}</span>
                            <span class="action-desc">${Utils.esc(a.description)}</span>
                            ${a.status === 'done' && a.auto_result ? `<button class="btn btn-sm btn-outline" onclick="DocViewer.show(${a.id})">View Document</button>` : ''}
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
                <div class="accordion-header" onclick="ProjectView._toggleAccordion(this)">
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

    _toggleAccordion(header) {
        const body = header.nextElementSibling;
        const arrow = header.querySelector('.accordion-arrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.innerHTML = '&#9660;';
        } else {
            body.style.display = 'none';
            arrow.innerHTML = '&#9654;';
        }
    },

    _bindEvents(container) {
        // Checkbox toggles
        container.querySelectorAll('.action-checkbox').forEach(label => {
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', async () => {
                const actionId = label.dataset.actionId;
                try {
                    await API.put(`/api/actions/${actionId}/toggle`);
                    const item = label.closest('.action-item');
                    item.classList.toggle('done');
                    // Update progress
                    this._project = await API.get(`/api/projects/${this._project.id}`);
                    const currentPhase = this._project.phases.find(ph => ph.phase_number === this._project.current_phase);
                    if (currentPhase) {
                        const manualActions = currentPhase.actions.filter(a => a.action_type === 'manual');
                        const manualDone = manualActions.filter(a => a.status === 'done').length;
                        const allDone = manualDone === manualActions.length;
                        const progressText = container.querySelector('.phase-current .progress-text');
                        if (progressText) progressText.textContent = `${manualDone} of ${manualActions.length} done`;
                        const advBtn = container.querySelector('#btn-advance');
                        if (advBtn) {
                            advBtn.disabled = !allDone;
                            advBtn.className = `btn ${allDone ? 'btn-success' : 'btn-disabled'}`;
                        }
                        // Update overall progress
                        const totalActions = this._project.phases.reduce((s, ph) => s + ph.actions.length, 0);
                        const doneActions = this._project.phases.reduce((s, ph) => s + ph.actions.filter(a => a.status === 'done').length, 0);
                        const overallFill = container.querySelector('.overall-progress .progress-fill');
                        const overallText = container.querySelector('.overall-progress span');
                        if (overallFill) overallFill.style.width = `${totalActions ? (doneActions/totalActions*100) : 0}%`;
                        if (overallText) overallText.textContent = `${doneActions}/${totalActions} tasks done`;
                    }
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
                    this.render(container, this._project.id);
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
                    this.render(container, this._project.id);
                } catch (err) { Toast.error(err.message); advBtn.disabled = false; }
            });
        }
    }
};
