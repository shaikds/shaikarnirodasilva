/**
 * components.js - UI Components
 * Single Responsibility: all DOM rendering and UI element creation
 * No HTTP calls, no routing - just building HTML elements
 */

const Components = (() => {
    'use strict';

    // ── Safe text escaping (XSS prevention) ──

    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    // ── Status Badge ──

    const renderStatusBadge = (status) => {
        const labels = {
            success: 'Success',
            failed: 'Failed',
            running: 'Running',
            never_run: 'Never Run',
            partial_failure: 'Partial',
            already_running: 'Running',
            started: 'Starting',
        };
        const label = labels[status] || status;
        const cssClass = `status-badge status-${status.replace('_', '_')}`;
        return `<span class="${escapeHtml(cssClass)}">${escapeHtml(label)}</span>`;
    };

    // ── Project Card ──

    const renderProjectCard = (project) => {
        const name = escapeHtml(project.name);
        const lastRun = project.last_run ? escapeHtml(project.last_run) : 'Never';

        return `
            <div class="project-card" data-project="${name}" onclick="App.navigate('/project/${name}')">
                <div class="project-card-header">
                    <span class="project-name">${name}</span>
                    ${renderStatusBadge(project.status)}
                </div>
                <div class="project-card-body">
                    <div class="project-meta">
                        <span>Last backup: ${lastRun}</span>
                        <span>Backups: ${project.successes || 0} | Errors: ${project.errors || 0}</span>
                    </div>
                </div>
                <div class="project-card-actions" onclick="event.stopPropagation()">
                    <button class="btn btn-sm btn-primary" onclick="App.runBackup('${name}')">Backup</button>
                    <button class="btn btn-sm" onclick="App.navigate('/project/${name}')">Details</button>
                    <button class="btn btn-sm btn-danger" onclick="App.confirmDelete('${name}')">Delete</button>
                </div>
            </div>
        `;
    };

    // ── Project List (Dashboard) ──

    const renderDashboard = (projects) => {
        if (projects.length === 0) {
            return `
                <div class="empty-state">
                    <h3>No Projects Yet</h3>
                    <p>Create your first backup project to get started.</p>
                    <button class="btn btn-primary" onclick="App.showCreateModal()">
                        + New Project
                    </button>
                </div>
            `;
        }

        return `
            <div class="projects-grid">
                ${projects.map(renderProjectCard).join('')}
            </div>
        `;
    };

    // ── Create Project Form ──

    const renderProjectForm = (exampleConfig = '') => {
        return `
            <div class="form-group">
                <label class="form-label" for="project-name">Project Name</label>
                <input type="text" id="project-name" class="form-input"
                    placeholder="my-project" pattern="[a-zA-Z0-9_-]+"
                    maxlength="64" required>
                <span class="form-hint">Alphanumeric, hyphens, underscores only</span>
                <span class="form-error" id="name-error"></span>
            </div>
            <div class="form-group">
                <label class="form-label" for="project-config">Backup Configuration (YAML)</label>
                <textarea id="project-config" class="form-textarea"
                    placeholder="Paste your backup.yaml config here..."
                >${escapeHtml(exampleConfig)}</textarea>
                <span class="form-hint">Edit the YAML config to match your project</span>
            </div>
        `;
    };

    // ── Project Detail View ──

    const renderProjectDetail = (project, logs, snapshots) => {
        const name = escapeHtml(project.name);

        return `
            <a href="#/" class="back-link">&larr; Back to Dashboard</a>
            <div class="detail-header">
                <div>
                    <h2>${name}</h2>
                    ${renderStatusBadge(project.status)}
                </div>
                <div class="header-actions">
                    <button class="btn btn-primary" onclick="App.runBackup('${name}')">Run Backup</button>
                    <button class="btn" onclick="App.runBackup('${name}', true)">Dry Run</button>
                    <button class="btn" onclick="App.detectServices('${name}')">Detect Services</button>
                </div>
            </div>
            <div class="detail-sections">
                ${renderDetailStatus(project)}
                ${renderLogSection(logs)}
                ${renderSnapshotsSection(snapshots)}
                ${renderConfigEditor(project)}
            </div>
        `;
    };

    const renderDetailStatus = (project) => {
        return `
            <div class="detail-section">
                <h3>Status</h3>
                <div class="project-meta">
                    <span>Status: ${renderStatusBadge(project.status)}</span>
                    <span>Last Run: ${escapeHtml(project.last_run || 'Never')}</span>
                    <span>Successful Backups: ${project.successes || 0}</span>
                    <span>Errors: ${project.errors || 0}</span>
                </div>
            </div>
        `;
    };

    // ── Log Viewer ──

    const renderLogSection = (logs) => {
        const colorizedLogs = colorizeLogs(logs || 'No logs available.');
        return `
            <div class="detail-section">
                <h3>Logs</h3>
                <div class="log-viewer" id="log-viewer">${colorizedLogs}</div>
                <button class="btn btn-sm" style="margin-top: 0.5rem" onclick="App.refreshLogs()">
                    Refresh Logs
                </button>
            </div>
        `;
    };

    const colorizeLogs = (text) => {
        return escapeHtml(text)
            .replace(/\[INFO\]/g, '<span class="log-info">[INFO]</span>')
            .replace(/\[SUCCESS\]/g, '<span class="log-success">[SUCCESS]</span>')
            .replace(/\[WARN\]/g, '<span class="log-warn">[WARN]</span>')
            .replace(/\[ERROR\]/g, '<span class="log-error">[ERROR]</span>');
    };

    // ── Snapshots Table ──

    const renderSnapshotsSection = (snapshots) => {
        if (!snapshots || snapshots.length === 0) {
            return `
                <div class="detail-section">
                    <h3>Snapshots</h3>
                    <p style="color: var(--text-muted); font-size: 0.85rem;">No snapshots found.</p>
                </div>
            `;
        }

        const rows = snapshots.map(s => `
            <tr>
                <td>${escapeHtml(s.short_id || s.id?.substring(0, 8) || '?')}</td>
                <td>${escapeHtml(s.time?.substring(0, 19) || '?')}</td>
                <td>${escapeHtml((s.tags || []).join(', '))}</td>
                <td>${escapeHtml((s.paths || []).join(', '))}</td>
            </tr>
        `).join('');

        return `
            <div class="detail-section">
                <h3>Snapshots</h3>
                <table class="snapshots-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Date</th>
                            <th>Tags</th>
                            <th>Paths</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;
    };

    // ── Config Editor ──

    const renderConfigEditor = (project) => {
        const config = escapeHtml(project.config || '');
        const name = escapeHtml(project.name);

        return `
            <div class="detail-section">
                <h3>Configuration</h3>
                <textarea id="config-editor" class="form-textarea">${config}</textarea>
                <button class="btn btn-primary btn-sm" style="margin-top: 0.5rem"
                    onclick="App.saveConfig('${name}')">
                    Save Config
                </button>
            </div>
        `;
    };

    // ── Modal ──

    const renderModal = (title, bodyHtml, footerHtml = '') => {
        return `
            <div class="modal-overlay" onclick="App.closeModal(event)">
                <div class="modal" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h2>${escapeHtml(title)}</h2>
                        <button class="btn-icon" onclick="App.closeModal()">&times;</button>
                    </div>
                    <div class="modal-body">${bodyHtml}</div>
                    ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
                </div>
            </div>
        `;
    };

    // ── Alert ──

    const renderAlert = (type, message) => {
        return `<div class="alert alert-${escapeHtml(type)}">${escapeHtml(message)}</div>`;
    };

    // ── Detected Services List ──

    const renderServiceDetection = (services) => {
        if (!services || services.length === 0) {
            return renderAlert('info', 'No services detected on this system.');
        }

        const items = services.map(s => `
            <span class="status-badge status-success">${escapeHtml(s)}</span>
        `).join(' ');

        return `
            <div>
                <strong>Detected Services:</strong><br>
                <div style="margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem;">${items}</div>
            </div>
        `;
    };

    // ── Public ──

    return {
        renderDashboard,
        renderProjectCard,
        renderProjectForm,
        renderProjectDetail,
        renderStatusBadge,
        renderLogSection,
        renderSnapshotsSection,
        renderConfigEditor,
        renderModal,
        renderAlert,
        renderServiceDetection,
        escapeHtml,
    };
})();
