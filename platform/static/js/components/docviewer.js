/* Document viewer - fetches and displays generated markdown */
const DocViewer = {
    async show(actionId) {
        Modal.open({
            title: 'Generated Document',
            body: '<div class="loading"><div class="spinner"></div><p>Loading document...</p></div>',
            footer: '<button class="btn btn-secondary" onclick="Modal.close()">Close</button><button class="btn btn-primary" onclick="DocViewer.copy()">Copy to Clipboard</button>',
            size: 'lg'
        });
        try {
            const data = await API.get(`/api/actions/${actionId}/document`);
            this._raw = data.content;
            Modal.setBody(`<div class="doc-viewer">${Utils.renderMd(data.content)}</div>`);
        } catch (err) {
            Modal.setBody(`<div class="error-state"><p>Could not load document: ${Utils.esc(err.message)}</p></div>`);
        }
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
