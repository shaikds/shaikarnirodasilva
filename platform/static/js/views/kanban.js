/* Kanban Board view (Version B) - projects as cards in phase columns */
const KanbanView = {
    _data: null,

    async render(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            this._data = await API.get('/api/dashboard?status=active');
            container.innerHTML = this._html();
            this._bindEvents(container);
        } catch (err) {
            container.innerHTML = `<div class="error-state"><h2>Error</h2><p>${Utils.esc(err.message)}</p></div>`;
        }
    },

    _html() {
        const d = this._data;
        const phaseNames = [
            'Discovery', 'Assessment', 'Estimation', 'Proposal', 'Contract',
            'Setup', 'Development', 'Updates', 'QA', 'Closeout', 'Retainer'
        ];

        // Group projects by current phase
        const columns = {};
        phaseNames.forEach((name, i) => { columns[i + 1] = { name, projects: [] }; });
        d.projects.forEach(p => {
            if (columns[p.current_phase]) {
                columns[p.current_phase].projects.push(p);
            }
        });

        // Only show columns that have projects OR are adjacent to ones that do
        const activePhases = new Set();
        d.projects.forEach(p => {
            activePhases.add(p.current_phase);
            if (p.current_phase > 1) activePhases.add(p.current_phase - 1);
            if (p.current_phase < 11) activePhases.add(p.current_phase + 1);
        });
        // If no projects, show first 5 phases
        if (d.projects.length === 0) {
            [1, 2, 3, 4, 5].forEach(n => activePhases.add(n));
        }

        const columnsHtml = Object.entries(columns)
            .filter(([num]) => activePhases.has(parseInt(num)))
            .map(([num, col]) => `
                <div class="kanban-column" data-phase="${num}">
                    <div class="kanban-column-header">
                        <span class="kanban-phase-num">${num}</span>
                        <span class="kanban-phase-name">${Utils.esc(col.name)}</span>
                        <span class="kanban-count">${col.projects.length}</span>
                    </div>
                    <div class="kanban-cards">
                        ${col.projects.length ? col.projects.map(p => this._cardHtml(p)).join('') :
                            '<div class="kanban-empty">No projects</div>'}
                    </div>
                </div>
            `).join('');

        return `
            <div class="page-header">
                <h1>Kanban Board</h1>
                <div class="page-header-actions">
                    <span class="kanban-legend">
                        <span class="legend-item"><span class="legend-dot legend-active"></span> Active: ${d.active_projects}</span>
                        <span class="legend-item"><span class="legend-dot legend-done"></span> Done: ${d.completed_projects}</span>
                    </span>
                    <a href="#new" class="btn btn-primary">+ New Project</a>
                </div>
            </div>
            ${d.alerts.length ? `<div class="kanban-alerts">${d.alerts.map(a =>
                `<div class="alert alert-${a.severity}"><span class="alert-dot"></span>${Utils.esc(a.project_name)}: ${Utils.esc(a.message)}<a href="#project/${a.project_id}" class="alert-link">View</a></div>`
            ).join('')}</div>` : ''}
            <div class="kanban-board">${columnsHtml}</div>`;
    },

    _cardHtml(p) {
        const donePercent = p.actions_total ? Math.round(p.actions_done / p.actions_total * 100) : 0;
        return `
            <a href="#project/${p.id}" class="kanban-card">
                <div class="kanban-card-top">
                    <span class="kanban-card-name">${Utils.esc(p.name)}</span>
                    ${Utils.badge(p.service_type)}
                </div>
                <div class="kanban-card-client">${Utils.esc(p.client_name)}</div>
                <div class="kanban-card-progress">
                    <div class="progress-bar progress-bar-sm"><div class="progress-fill" style="width:${donePercent}%"></div></div>
                    <span class="kanban-card-stats">${p.actions_done}/${p.actions_total} &middot; ${donePercent}%</span>
                </div>
                ${p.budget ? `<div class="kanban-card-budget">${Utils.money(p.budget)}</div>` : ''}
            </a>`;
    },

    _bindEvents(container) {
        // Cards are already links via href="#project/{id}"
    }
};
