/* Client management view */
const ClientsView = {
    async render(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const clients = await API.get('/api/clients');
            container.innerHTML = this._html(clients);
            this._bindEvents(container);
        } catch (err) {
            container.innerHTML = `<div class="error-state"><p>${Utils.esc(err.message)}</p></div>`;
        }
    },

    _html(clients) {
        const rows = clients.length ? clients.map(c => `
            <tr data-id="${c.id}">
                <td>${Utils.esc(c.name)}</td>
                <td>${Utils.esc(c.company)}</td>
                <td>${Utils.esc(c.email)}</td>
                <td>${Utils.esc(c.phone || '-')}</td>
                <td>
                    <button class="btn btn-sm btn-outline btn-edit" data-id="${c.id}">Edit</button>
                    <button class="btn btn-sm btn-danger-outline btn-delete" data-id="${c.id}">Delete</button>
                </td>
            </tr>`).join('') : '<tr><td colspan="5" class="empty-cell">No clients yet</td></tr>';

        return `
            <div class="page-header">
                <h1>Clients</h1>
                <button class="btn btn-primary" id="btn-add-client">+ Add Client</button>
            </div>
            <table class="data-table">
                <thead><tr><th>Name</th><th>Company</th><th>Email</th><th>Phone</th><th>Actions</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    },

    _bindEvents(container) {
        container.querySelector('#btn-add-client')?.addEventListener('click', () => this._showForm());
        container.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', async () => {
                const client = await API.get(`/api/clients/${btn.dataset.id}`);
                this._showForm(client);
            });
        });
        container.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this client?')) return;
                try {
                    await API.del(`/api/clients/${btn.dataset.id}`);
                    Toast.success('Client deleted');
                    this.render(container);
                } catch (err) { Toast.error(err.message); }
            });
        });
    },

    _showForm(client = null) {
        const isEdit = !!client;
        Modal.open({
            title: isEdit ? 'Edit Client' : 'Add Client',
            body: `
                <div class="form-group"><label>Name *</label><input id="m-name" class="form-input" value="${Utils.esc(client?.name || '')}"></div>
                <div class="form-group"><label>Company *</label><input id="m-company" class="form-input" value="${Utils.esc(client?.company || '')}"></div>
                <div class="form-group"><label>Email *</label><input id="m-email" class="form-input" type="email" value="${Utils.esc(client?.email || '')}"></div>
                <div class="form-group"><label>Phone</label><input id="m-phone" class="form-input" value="${Utils.esc(client?.phone || '')}"></div>
                <div class="form-group"><label>Notes</label><textarea id="m-notes" class="form-input" rows="3">${Utils.esc(client?.notes || '')}</textarea></div>`,
            footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancel</button>
                     <button class="btn btn-primary" id="btn-save-client">${isEdit ? 'Update' : 'Create'}</button>`
        });
        document.getElementById('btn-save-client')?.addEventListener('click', async () => {
            const data = {
                name: document.getElementById('m-name').value.trim(),
                company: document.getElementById('m-company').value.trim(),
                email: document.getElementById('m-email').value.trim(),
                phone: document.getElementById('m-phone').value.trim() || null,
                notes: document.getElementById('m-notes').value.trim() || null,
            };
            if (!data.name || !data.company || !data.email) { Toast.error('Name, company, email required'); return; }
            try {
                if (isEdit) { await API.put(`/api/clients/${client.id}`, data); }
                else { await API.post('/api/clients', data); }
                Modal.close();
                Toast.success(isEdit ? 'Client updated' : 'Client created');
                this.render(document.getElementById('app'));
            } catch (err) { Toast.error(err.message); }
        });
    }
};
