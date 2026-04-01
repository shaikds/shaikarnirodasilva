/* Dashboard view */
const DashboardView = {
    _filters: { status: '', type: '', q: '' },

    async render(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const params = new URLSearchParams();
            if (this._filters.status) params.set('status', this._filters.status);
            if (this._filters.type) params.set('type', this._filters.type);
            if (this._filters.q) params.set('q', this._filters.q);
            const data = await API.get('/api/dashboard?' + params.toString());
            container.innerHTML = this._html(data);
            this._bindEvents(container);
        } catch (err) {
            container.innerHTML = `<div class="error-state"><h2>Error loading dashboard</h2><p>${Utils.esc(err.message)}</p></div>`;
        }
    },

    _html(data) {
        const alertsHtml = data.alerts.length ? `
            <div class="alerts-section">
                <h3>Alerts (${data.alerts.length})</h3>
                ${data.alerts.map(a => `<div class="alert alert-${a.severity}">
                    <span class="alert-dot"></span>
                    <span><strong>${Utils.esc(a.project_name)}</strong> - ${Utils.esc(a.message)}</span>
                    <a href="#project/${a.project_id}" class="alert-link">View</a>
                </div>`).join('')}
            </div>` : '';

        const projectsHtml = data.projects.length ? data.projects.map(p => `
            <a href="#project/${p.id}" class="project-card">
                <div class="project-card-header">
                    <div>
                        <h3 class="project-card-title">${Utils.esc(p.name)}</h3>
                        <p class="project-card-client">${Utils.esc(p.client_name)}</p>
                    </div>
                    <div class="project-card-meta">
                        ${Utils.badge(p.service_type)}
                        <span class="phase-label">Phase ${p.current_phase}/11</span>
                    </div>
                </div>
                <div class="project-card-body">
                    <div class="progress-bar"><div class="progress-fill" style="width:${p.progress_percent}%"></div></div>
                    <div class="progress-text">${p.progress_percent}% &middot; ${p.actions_done}/${p.actions_total} tasks ${p.budget ? ' &middot; ' + Utils.money(p.budget) : ''}</div>
                </div>
            </a>`).join('') : '<div class="empty-state"><h3>No projects yet</h3><p>Create your first project to get started!</p><a href="#new" class="btn btn-primary">+ New Project</a></div>';

        return `
            <div class="page-header"><h1>Dashboard</h1></div>
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-value">${data.total_clients}</div><div class="stat-label">Clients</div></div>
                <div class="stat-card stat-active"><div class="stat-value">${data.active_projects}</div><div class="stat-label">Active</div></div>
                <div class="stat-card stat-done"><div class="stat-value">${data.completed_projects}</div><div class="stat-label">Completed</div></div>
                <div class="stat-card stat-revenue"><div class="stat-value">${Utils.money(data.total_revenue)}</div><div class="stat-label">Revenue</div></div>
            </div>
            ${alertsHtml}
            <div class="filter-bar">
                <select id="filter-status" class="filter-select">
                    <option value="">All Status</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                </select>
                <select id="filter-type" class="filter-select">
                    <option value="">All Types</option>
                    <option value="ai_agents">AI Agents</option>
                    <option value="nocode_to_prod">NoCode to Prod</option>
                    <option value="web_dev">Web Dev</option>
                    <option value="retainer">Retainer</option>
                </select>
                <input id="filter-search" type="text" class="filter-input" placeholder="Search projects..." value="${Utils.esc(this._filters.q)}">
            </div>
            <div class="projects-grid">${projectsHtml}</div>`;
    },

    _bindEvents(container) {
        const self = this;
        const statusEl = container.querySelector('#filter-status');
        const typeEl = container.querySelector('#filter-type');
        const searchEl = container.querySelector('#filter-search');
        if (statusEl) { statusEl.value = this._filters.status; statusEl.onchange = () => { self._filters.status = statusEl.value; self.render(container); }; }
        if (typeEl) { typeEl.value = this._filters.type; typeEl.onchange = () => { self._filters.type = typeEl.value; self.render(container); }; }
        let searchTimer;
        if (searchEl) { searchEl.oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { self._filters.q = searchEl.value; self.render(container); }, 300); }; }
    }
};
