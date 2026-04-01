/* CRM / Client-First view (Version C) - organized by client with project history */
const CrmView = {
    _clients: [],
    _projects: [],
    _expandedClient: null,

    async render(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const [clients, dashboard] = await Promise.all([
                API.get('/api/clients'),
                API.get('/api/dashboard?status='),
            ]);
            this._clients = clients;
            this._projects = dashboard.projects;
            container.innerHTML = this._html(dashboard);
            this._bindEvents(container);
        } catch (err) {
            container.innerHTML = `<div class="error-state"><h2>Error</h2><p>${Utils.esc(err.message)}</p></div>`;
        }
    },

    _html(dashboard) {
        // Map projects to clients
        const clientMap = {};
        this._clients.forEach(c => { clientMap[c.id] = { ...c, projects: [] }; });
        this._projects.forEach(p => {
            // Find client by name match (dashboard returns client_name not client_id)
            const client = this._clients.find(c => c.name === p.client_name);
            if (client && clientMap[client.id]) {
                clientMap[client.id].projects.push(p);
            }
        });

        const clientList = Object.values(clientMap);

        // Sort: clients with active projects first, then by name
        clientList.sort((a, b) => {
            const aActive = a.projects.filter(p => p.status === 'active').length;
            const bActive = b.projects.filter(p => p.status === 'active').length;
            if (bActive !== aActive) return bActive - aActive;
            return a.name.localeCompare(b.name);
        });

        const clientsHtml = clientList.length ? clientList.map(c => this._clientCard(c)).join('') :
            '<div class="empty-state"><h3>No clients yet</h3><p>Add your first client to get started.</p><a href="#new" class="btn btn-primary">+ New Project</a></div>';

        return `
            <div class="page-header">
                <h1>Client Overview</h1>
                <div class="page-header-actions">
                    <a href="#new" class="btn btn-primary">+ New Project</a>
                </div>
            </div>
            <div class="crm-stats">
                <div class="stat-card"><div class="stat-value">${this._clients.length}</div><div class="stat-label">Total Clients</div></div>
                <div class="stat-card stat-active"><div class="stat-value">${dashboard.active_projects}</div><div class="stat-label">Active Projects</div></div>
                <div class="stat-card stat-done"><div class="stat-value">${dashboard.completed_projects}</div><div class="stat-label">Completed</div></div>
                <div class="stat-card stat-revenue"><div class="stat-value">${Utils.money(dashboard.total_revenue)}</div><div class="stat-label">Revenue</div></div>
            </div>
            <div class="crm-search">
                <input id="crm-search" type="text" class="filter-input" placeholder="Search clients...">
            </div>
            <div class="crm-client-list" id="crm-list">${clientsHtml}</div>`;
    },

    _clientCard(c) {
        const activeCount = c.projects.filter(p => p.status === 'active').length;
        const totalRevenue = c.projects.reduce((sum, p) => sum + (p.budget || 0), 0);
        const isExpanded = this._expandedClient === c.id;

        // Health score: based on how projects are doing
        let healthClass = 'health-neutral';
        let healthLabel = 'No projects';
        if (c.projects.length > 0) {
            const avgProgress = c.projects.reduce((s, p) => s + p.progress_percent, 0) / c.projects.length;
            const hasStuck = c.projects.some(p => p.days_in_phase > 7);
            if (hasStuck) { healthClass = 'health-warning'; healthLabel = 'Needs attention'; }
            else if (avgProgress > 50) { healthClass = 'health-good'; healthLabel = 'On track'; }
            else { healthClass = 'health-neutral'; healthLabel = 'In progress'; }
        }

        const projectRows = c.projects.length ? c.projects.map(p => `
            <a href="#project/${p.id}" class="crm-project-row">
                <span class="crm-project-name">${Utils.esc(p.name)}</span>
                ${Utils.badge(p.service_type)}
                <span class="crm-project-phase">Phase ${p.current_phase}: ${Utils.esc(p.current_phase_name)}</span>
                <div class="crm-project-progress">
                    <div class="progress-bar progress-bar-sm"><div class="progress-fill" style="width:${p.progress_percent}%"></div></div>
                    <span>${Math.round(p.progress_percent)}%</span>
                </div>
                <span class="crm-project-budget">${Utils.money(p.budget)}</span>
            </a>`).join('') : '<div class="crm-no-projects">No projects yet</div>';

        return `
            <div class="crm-client-card" data-client-id="${c.id}">
                <div class="crm-client-header" onclick="CrmView.toggleClient(${c.id})">
                    <div class="crm-client-avatar">${Utils.esc(c.name.charAt(0).toUpperCase())}</div>
                    <div class="crm-client-info">
                        <div class="crm-client-name">${Utils.esc(c.name)}</div>
                        <div class="crm-client-company">${Utils.esc(c.company)} &middot; ${Utils.esc(c.email)}</div>
                    </div>
                    <div class="crm-client-metrics">
                        <span class="crm-health ${healthClass}">${healthLabel}</span>
                        <span class="crm-metric">${activeCount} active</span>
                        <span class="crm-metric">${c.projects.length} total</span>
                        ${totalRevenue > 0 ? `<span class="crm-metric">${Utils.money(totalRevenue)}</span>` : ''}
                    </div>
                    <span class="accordion-arrow">${isExpanded ? '&#9660;' : '&#9654;'}</span>
                </div>
                <div class="crm-client-body" style="display:${isExpanded ? 'block' : 'none'}">
                    <div class="crm-client-details">
                        <span>Phone: ${Utils.esc(c.phone || 'N/A')}</span>
                        <span>Since: ${new Date(c.created_at).toLocaleDateString()}</span>
                        <a href="#clients" class="btn btn-sm btn-outline">Edit Client</a>
                    </div>
                    <div class="crm-projects-header">Projects</div>
                    ${projectRows}
                </div>
            </div>`;
    },

    toggleClient(clientId) {
        this._expandedClient = this._expandedClient === clientId ? null : clientId;
        const card = document.querySelector(`.crm-client-card[data-client-id="${clientId}"]`);
        if (!card) return;
        const body = card.querySelector('.crm-client-body');
        const arrow = card.querySelector('.accordion-arrow');
        if (body.style.display === 'none') {
            body.style.display = 'block';
            arrow.innerHTML = '&#9660;';
        } else {
            body.style.display = 'none';
            arrow.innerHTML = '&#9654;';
        }
    },

    _bindEvents(container) {
        const searchEl = container.querySelector('#crm-search');
        if (searchEl) {
            let timer;
            searchEl.oninput = () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    const q = searchEl.value.toLowerCase();
                    container.querySelectorAll('.crm-client-card').forEach(card => {
                        const name = card.querySelector('.crm-client-name')?.textContent.toLowerCase() || '';
                        const company = card.querySelector('.crm-client-company')?.textContent.toLowerCase() || '';
                        card.style.display = (!q || name.includes(q) || company.includes(q)) ? '' : 'none';
                    });
                }, 200);
            };
        }
    }
};
