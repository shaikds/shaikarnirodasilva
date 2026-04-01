/* Document editor - editable markdown with auto-save */
const DocViewer = {
    _actionId: null,
    _raw: '',
    _saveTimer: null,
    _mode: 'edit',

    async show(actionId) {
        this._actionId = actionId;
        this._mode = 'edit';
        Modal.open({
            title: 'Edit Document',
            body: '<div class="loading"><div class="spinner"></div><p>Loading document...</p></div>',
            footer: `
                <span class="save-indicator" id="save-status"></span>
                <button class="btn btn-secondary" onclick="Modal.close()">Close</button>
                <button class="btn btn-primary" onclick="DocViewer.copy()">Copy to Clipboard</button>`,
            size: 'lg'
        });
        try {
            const data = await API.get(`/api/actions/${actionId}/document`);
            this._raw = data.content;
            this._renderEditor();
        } catch (err) {
            Modal.setBody(`<div class="error-state"><p>Could not load document: ${Utils.esc(err.message)}</p></div>`);
        }
    },

    _renderEditor() {
        const isEdit = this._mode === 'edit';
        Modal.setBody(`
            <div class="doc-editor">
                <div class="doc-editor-tabs">
                    <button class="doc-tab ${isEdit ? 'active' : ''}" onclick="DocViewer.setMode('edit')">Edit</button>
                    <button class="doc-tab ${!isEdit ? 'active' : ''}" onclick="DocViewer.setMode('preview')">Preview</button>
                </div>
                <div class="doc-editor-content">
                    ${isEdit
                        ? `<textarea id="doc-textarea" class="doc-textarea">${Utils.esc(this._raw)}</textarea>`
                        : `<div class="doc-preview doc-viewer">${Utils.renderMd(this._raw)}</div>`
                    }
                </div>
            </div>
        `);
        if (isEdit) {
            const ta = document.getElementById('doc-textarea');
            if (ta) {
                ta.addEventListener('input', () => {
                    this._raw = ta.value;
                    this._scheduleAutoSave();
                });
                ta.focus();
            }
        }
    },

    setMode(mode) {
        if (this._mode === 'edit') {
            const ta = document.getElementById('doc-textarea');
            if (ta) this._raw = ta.value;
        }
        this._mode = mode;
        this._renderEditor();
    },

    _scheduleAutoSave() {
        clearTimeout(this._saveTimer);
        this._setSaveStatus('saving');
        this._saveTimer = setTimeout(() => this._save(), 2000);
    },

    async _save() {
        try {
            await API.put(`/api/actions/${this._actionId}/document`, { content: this._raw });
            this._setSaveStatus('saved');
        } catch (err) {
            this._setSaveStatus('error');
            Toast.error('Failed to save: ' + err.message);
        }
    },

    _setSaveStatus(status) {
        const el = document.getElementById('save-status');
        if (!el) return;
        if (status === 'saving') { el.textContent = 'Saving...'; el.className = 'save-indicator saving'; }
        else if (status === 'saved') { el.textContent = 'Saved'; el.className = 'save-indicator saved'; }
        else if (status === 'error') { el.textContent = 'Save failed'; el.className = 'save-indicator error'; }
    },

    async copy() {
        if (this._raw) {
            try {
                await navigator.clipboard.writeText(this._raw);
                Toast.success('Copied to clipboard!');
            } catch {
                const ta = document.createElement('textarea');
                ta.value = this._raw;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                Toast.success('Copied to clipboard!');
            }
        }
    }
};
