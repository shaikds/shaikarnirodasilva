/**
 * api.js - API Client (Facade Pattern)
 * Single Responsibility: all HTTP communication with the backend
 * No DOM manipulation, no state management - just fetch calls
 */

const API = (() => {
    'use strict';

    const BASE_URL = '/api';

    // ── HTTP helpers ──

    const request = async (method, path, body = null) => {
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };

        if (body !== null) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${BASE_URL}${path}`, options);
        const data = await response.json();

        if (!response.ok) {
            const error = new Error(data.error || `HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    };

    // ── Project endpoints ──

    const getProjects = () => request('GET', '/projects');

    const getProject = (name) => request('GET', `/projects/${encodeURIComponent(name)}`);

    const createProject = (name, config) =>
        request('POST', '/projects', { name, config });

    const updateProject = (name, config) =>
        request('PUT', `/projects/${encodeURIComponent(name)}`, { config });

    const deleteProject = (name) =>
        request('DELETE', `/projects/${encodeURIComponent(name)}`);

    // ── Backup operations ──

    const runBackup = (name, dryRun = false) =>
        request('POST', `/projects/${encodeURIComponent(name)}/backup`, { dry_run: dryRun });

    const getBackupStatus = (name) =>
        request('GET', `/projects/${encodeURIComponent(name)}/status`);

    const getSnapshots = (name) =>
        request('GET', `/projects/${encodeURIComponent(name)}/snapshots`);

    const getLogs = (name, lines = 100) =>
        request('GET', `/projects/${encodeURIComponent(name)}/logs?lines=${lines}`);

    // ── Detection ──

    const runDetection = (name) =>
        request('POST', `/projects/${encodeURIComponent(name)}/detect`);

    // ── Restore ──

    const restoreSnapshot = (name, snapshotId, target = './restored') =>
        request('POST', `/projects/${encodeURIComponent(name)}/restore`, {
            snapshot_id: snapshotId,
            target,
        });

    // ── Config ──

    const getExampleConfig = () => request('GET', '/config/example');

    // ── Health check ──

    const isServerUp = async () => {
        try {
            await getProjects();
            return true;
        } catch {
            return false;
        }
    };

    // ── Public API (Facade) ──

    return {
        getProjects,
        getProject,
        createProject,
        updateProject,
        deleteProject,
        runBackup,
        getBackupStatus,
        getSnapshots,
        getLogs,
        runDetection,
        restoreSnapshot,
        getExampleConfig,
        isServerUp,
    };
})();
