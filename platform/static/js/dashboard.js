/**
 * Dashboard Page Logic
 */
(function() {
    'use strict';

    var statsContainer = null;
    var projectsContainer = null;

    function init() {
        statsContainer = document.getElementById('stats-grid');
        projectsContainer = document.getElementById('projects-grid');
        Utils.initMobileMenu();
        loadDashboard();
    }

    function showLoading(container) {
        container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
    }

    async function loadDashboard() {
        showLoading(statsContainer);
        showLoading(projectsContainer);

        try {
            var results = await Promise.allSettled([
                API.get('/dashboard'),
                API.get('/projects')
            ]);

            var dashData = results[0].status === 'fulfilled' ? results[0].value : null;
            var projData = results[1].status === 'fulfilled' ? results[1].value : null;

            renderStats(dashData);
            renderProjects(projData);
        } catch (err) {
            Toast.error('Failed to load dashboard: ' + err.message);
            renderStats(null);
            renderProjects(null);
        }
    }

    function renderStats(data) {
        var totalClients = 0;
        var activeProjects = 0;
        var completedProjects = 0;
        var revenue = 0;

        if (data) {
            totalClients = data.total_clients || 0;
            activeProjects = data.active_projects || 0;
            completedProjects = data.completed_projects || 0;
            revenue = data.total_revenue || data.revenue || 0;
        }

        statsContainer.innerHTML =
            '<div class="stat-card">' +
                '<div class="stat-header">' +
                    '<span class="stat-label">Total Clients</span>' +
                    '<div class="stat-icon clients">&#9823;</div>' +
                '</div>' +
                '<div class="stat-value">' + totalClients + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-header">' +
                    '<span class="stat-label">Active Projects</span>' +
                    '<div class="stat-icon active">&#9650;</div>' +
                '</div>' +
                '<div class="stat-value">' + activeProjects + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-header">' +
                    '<span class="stat-label">Completed</span>' +
                    '<div class="stat-icon completed">&#10003;</div>' +
                '</div>' +
                '<div class="stat-value">' + completedProjects + '</div>' +
            '</div>' +
            '<div class="stat-card">' +
                '<div class="stat-header">' +
                    '<span class="stat-label">Revenue</span>' +
                    '<div class="stat-icon revenue">$</div>' +
                '</div>' +
                '<div class="stat-value">' + Utils.formatCurrency(revenue) + '</div>' +
            '</div>';
    }

    function renderProjects(data) {
        var projects = [];
        if (data && data.projects) {
            projects = data.projects;
        } else if (Array.isArray(data)) {
            projects = data;
        }

        if (projects.length === 0) {
            projectsContainer.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-icon">&#9744;</div>' +
                    '<h3>No projects yet</h3>' +
                    '<p>Create your first project to get started!</p>' +
                    '<a href="new-project.html" class="btn btn-primary">+ New Project</a>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < projects.length; i++) {
            var p = projects[i];
            var progress = p.progress_percent || 0;
            var progressColor = Utils.getProgressColor(progress);
            var badgeClass = Utils.getServiceBadgeClass(p.service_type);
            var statusBadge = Utils.getStatusBadgeClass(p.status);

            html +=
                '<div class="project-card" onclick="window.location.href=\'project.html?id=' + p.id + '\'">' +
                    '<div class="card-top">' +
                        '<div>' +
                            '<div class="project-name">' + Utils.escapeHtml(p.name) + '</div>' +
                            '<div class="client-name">' + Utils.escapeHtml(p.client_name || 'No client') + '</div>' +
                        '</div>' +
                        '<span class="badge badge-status ' + statusBadge + '">' + Utils.escapeHtml(p.status || 'Active') + '</span>' +
                    '</div>' +
                    '<div class="card-meta">' +
                        '<span class="badge ' + badgeClass + '">' + Utils.escapeHtml(p.service_type || 'General') + '</span>' +
                        (p.budget ? '<span class="phase-label">' + Utils.formatCurrencyFull(p.budget) + '</span>' : '') +
                    '</div>' +
                    '<div class="phase-label mb-1">Phase ' + (p.current_phase || '?') + ': ' + Utils.escapeHtml(p.current_phase_name || 'Unknown') + '</div>' +
                    '<div class="progress-bar">' +
                        '<div class="progress-fill ' + progressColor + '" style="width: ' + progress + '%"></div>' +
                    '</div>' +
                    '<div class="progress-text">' +
                        '<span>' + progress + '% complete</span>' +
                        '<span>Phase ' + (p.current_phase || 0) + '/11</span>' +
                    '</div>' +
                '</div>';
        }

        projectsContainer.innerHTML = html;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
