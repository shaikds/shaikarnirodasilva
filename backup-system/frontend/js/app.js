/**
 * app.js - Main App Logic
 * Single Responsibility: routing, state management, user interactions
 * Delegates rendering to Components, HTTP to API
 */

const App = (() => {
    'use strict';

    // ── State ──

    let state = {
        projects: [],
        currentProject: null,
        currentLogs: '',
        currentSnapshots: [],
        alertMessage: null,
        alertType: null,
        pollInterval: null,
    };

    const $root = () => document.getElementById('app-root');
    const $modal = () => document.getElementById('modal-root');

    // ── Router (hash-based) ──

    const navigate = (path) => {
        window.location.hash = path;
    };

    const handleRoute = async () => {
        const hash = window.location.hash.slice(1) || '/';
        clearPolling();

        if (hash === '/') {
            await renderDashboardPage();
        } else if (hash.startsWith('/project/')) {
            const name = decodeURIComponent(hash.replace('/project/', '').split('/')[0]);
            await renderProjectPage(name);
        } else {
            navigate('/');
        }
    };

    // ── Pages ──

    const renderDashboardPage = async () => {
        try {
            state.projects = await API.getProjects();
        } catch {
            state.projects = [];
            showAlert('error', 'Cannot connect to server. Is the backend running?');
        }

        const alertHtml = state.alertMessage
            ? Components.renderAlert(state.alertType, state.alertMessage)
            : '';

        $root().innerHTML = alertHtml + Components.renderDashboard(state.projects);
        clearAlert();
    };

    const renderProjectPage = async (name) => {
        try {
            state.currentProject = await API.getProject(name);
            const logsData = await API.getLogs(name, 200);
            state.currentLogs = logsData.logs || '';
            state.currentSnapshots = [];

            try {
                state.currentSnapshots = await API.getSnapshots(name);
            } catch {
                // Snapshots may not be available
            }

            $root().innerHTML = Components.renderProjectDetail(
                state.currentProject,
                state.currentLogs,
                state.currentSnapshots
            );

            // Auto-scroll log viewer to bottom
            const logViewer = document.getElementById('log-viewer');
            if (logViewer) logViewer.scrollTop = logViewer.scrollHeight;

            // Start polling if backup is running
            if (state.currentProject.status === 'running') {
                startPolling(name);
            }
        } catch (err) {
            $root().innerHTML = Components.renderAlert('error', `Project not found: ${name}`);
        }
    };

    // ── Actions ──

    const showCreateModal = async () => {
        let exampleConfig = '';
        try {
            const data = await API.getExampleConfig();
            exampleConfig = data.config || '';
        } catch {
            // Use empty config if example not available
        }

        const body = Components.renderProjectForm(exampleConfig);
        const footer = `
            <button class="btn" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="App.submitCreate()">Create Project</button>
        `;

        $modal().innerHTML = Components.renderModal('New Project', body, footer);
    };

    const submitCreate = async () => {
        const nameInput = document.getElementById('project-name');
        const configInput = document.getElementById('project-config');
        const errorEl = document.getElementById('name-error');

        const name = nameInput.value.trim();
        const config = configInput.value;

        // Validate
        if (!name) {
            errorEl.textContent = 'Name is required';
            return;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
            errorEl.textContent = 'Only alphanumeric, hyphens, underscores';
            return;
        }

        try {
            await API.createProject(name, config);
            closeModal();
            showAlert('success', `Project "${name}" created successfully`);
            navigate('/');
        } catch (err) {
            errorEl.textContent = err.data?.error || err.message;
        }
    };

    const runBackup = async (name, dryRun = false) => {
        try {
            const result = await API.runBackup(name, dryRun);
            if (result.status === 'already_running') {
                showAlert('info', `Backup already running for "${name}"`);
            } else {
                showAlert('success', `Backup ${dryRun ? '(dry-run) ' : ''}started for "${name}"`);
                // Start polling for status updates
                if (window.location.hash.includes(`/project/${name}`)) {
                    startPolling(name);
                }
            }
            await handleRoute();
        } catch (err) {
            showAlert('error', `Backup failed: ${err.message}`);
        }
    };

    const confirmDelete = (name) => {
        const body = `<p>Are you sure you want to delete project <strong>${Components.escapeHtml(name)}</strong>?</p>
                      <p style="color: var(--danger); font-size: 0.85rem; margin-top: 0.5rem;">
                        This will delete all project config, logs, and local data. Backup snapshots in remote destinations will NOT be deleted.
                      </p>`;
        const footer = `
            <button class="btn" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-danger" onclick="App.executeDelete('${Components.escapeHtml(name)}')">Delete</button>
        `;
        $modal().innerHTML = Components.renderModal('Delete Project', body, footer);
    };

    const executeDelete = async (name) => {
        try {
            await API.deleteProject(name);
            closeModal();
            showAlert('success', `Project "${name}" deleted`);
            navigate('/');
        } catch (err) {
            showAlert('error', `Delete failed: ${err.message}`);
            closeModal();
        }
    };

    const saveConfig = async (name) => {
        const editor = document.getElementById('config-editor');
        if (!editor) return;

        try {
            await API.updateProject(name, editor.value);
            showAlert('success', 'Configuration saved');
        } catch (err) {
            showAlert('error', `Save failed: ${err.message}`);
        }
    };

    const refreshLogs = async () => {
        const hash = window.location.hash.slice(1);
        const match = hash.match(/^\/project\/(.+)/);
        if (!match) return;

        const name = decodeURIComponent(match[1]);
        try {
            const data = await API.getLogs(name, 200);
            const logViewer = document.getElementById('log-viewer');
            if (logViewer) {
                logViewer.innerHTML = Components.renderLogSection(data.logs || '')
                    .replace(/<[^>]*>/g, ''); // Strip wrapper tags for inner update
                logViewer.scrollTop = logViewer.scrollHeight;
            }
        } catch {
            // Silently fail on log refresh
        }
    };

    const detectServices = async (name) => {
        try {
            showAlert('info', 'Detecting services...');
            const result = await API.runDetection(name);
            const body = Components.renderServiceDetection(result.services || []);
            $modal().innerHTML = Components.renderModal('Detected Services', body,
                '<button class="btn" onclick="App.closeModal()">Close</button>');
            clearAlert();
        } catch (err) {
            showAlert('error', `Detection failed: ${err.message}`);
        }
    };

    // ── Polling (for running backups) ──

    const startPolling = (name) => {
        clearPolling();
        let delay = 1000;
        const maxDelay = 10000;

        const poll = async () => {
            try {
                const status = await API.getBackupStatus(name);
                if (status.status !== 'running') {
                    clearPolling();
                    await handleRoute();
                    return;
                }
                // Refresh logs
                await refreshLogs();
            } catch {
                // Continue polling
            }
            delay = Math.min(delay * 1.5, maxDelay);
            state.pollInterval = setTimeout(poll, delay);
        };

        state.pollInterval = setTimeout(poll, delay);
    };

    const clearPolling = () => {
        if (state.pollInterval) {
            clearTimeout(state.pollInterval);
            state.pollInterval = null;
        }
    };

    // ── Modal ──

    const closeModal = (event) => {
        if (event && event.target !== event.currentTarget) return;
        $modal().innerHTML = '';
    };

    // ── Alerts ──

    const showAlert = (type, message) => {
        state.alertType = type;
        state.alertMessage = message;
    };

    const clearAlert = () => {
        state.alertMessage = null;
        state.alertType = null;
    };

    // ── Theme Toggle ──

    const toggleTheme = () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);

        const btn = document.getElementById('theme-btn');
        if (btn) btn.textContent = next === 'light' ? '\u263E' : '\u2600';
    };

    // ── Init ──

    const init = () => {
        // Apply saved theme
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Listen for route changes
        window.addEventListener('hashchange', handleRoute);

        // Initial render
        handleRoute();
    };

    // ── Public interface ──

    return {
        init,
        navigate,
        showCreateModal,
        submitCreate,
        runBackup,
        confirmDelete,
        executeDelete,
        saveConfig,
        refreshLogs,
        detectServices,
        closeModal,
        toggleTheme,
    };
})();

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
