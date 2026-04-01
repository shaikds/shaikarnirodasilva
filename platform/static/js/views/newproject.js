/* New project wizard - 3 steps */
const NewProjectView = {
    _step: 1,
    _data: { client_id: null, isNewClient: true, name: '', company: '', email: '', phone: '', projectName: '', serviceType: '', budget: '', timeline: '' },
    _clients: [],

    async render(container) {
        try { this._clients = await API.get('/api/clients'); } catch { this._clients = []; }
        this._step = 1;
        this._data = { client_id: null, isNewClient: true, name: '', company: '', email: '', phone: '', projectName: '', serviceType: '', budget: '', timeline: '' };
        this._renderStep(container);
    },

    _renderStep(container) {
        const steps = ['Client Info', 'Project Details', 'Review & Create'];
        const stepsHtml = steps.map((s, i) => `<div class="wizard-step ${i + 1 === this._step ? 'active' : i + 1 < this._step ? 'done' : ''}">${i + 1}. ${s}</div>`).join('');

        container.innerHTML = `
            <div class="page-header"><a href="#dashboard" class="back-link">&larr; Dashboard</a><h1>New Project</h1></div>
            <div class="wizard-steps">${stepsHtml}</div>
            <div class="wizard-body">${this._stepHtml()}</div>`;
        this._bindStepEvents(container);
    },

    _stepHtml() {
        const d = this._data;
        if (this._step === 1) {
            const clientOptions = this._clients.map(c => `<option value="${c.id}" ${d.client_id == c.id ? 'selected' : ''}>${Utils.esc(c.name)} - ${Utils.esc(c.company)}</option>`).join('');
            return `
                <div class="form-group">
                    <label>Select existing client or create new</label>
                    <select id="client-select" class="form-input">
                        <option value="new" ${d.isNewClient ? 'selected' : ''}>+ New Client</option>
                        ${clientOptions}
                    </select>
                </div>
                <div id="new-client-fields" style="display:${d.isNewClient ? 'block' : 'none'}">
                    <div class="form-group"><label>Name *</label><input id="f-name" class="form-input" value="${Utils.esc(d.name)}" placeholder="John Smith"></div>
                    <div class="form-group"><label>Company *</label><input id="f-company" class="form-input" value="${Utils.esc(d.company)}" placeholder="Acme Corp"></div>
                    <div class="form-group"><label>Email *</label><input id="f-email" class="form-input" type="email" value="${Utils.esc(d.email)}" placeholder="john@acme.com"></div>
                    <div class="form-group"><label>Phone</label><input id="f-phone" class="form-input" value="${Utils.esc(d.phone)}" placeholder="+972-..."></div>
                </div>
                <div class="wizard-nav"><div></div><button class="btn btn-primary" id="btn-next">Next &rarr;</button></div>`;
        }
        if (this._step === 2) {
            const types = [
                { id: 'ai_agents', label: 'AI Agents', desc: 'Custom AI agents & automation', icon: '&#9881;' },
                { id: 'nocode_to_prod', label: 'NoCode \u2192 Prod', desc: 'Base44/Lovable to production', icon: '&#8635;' },
                { id: 'web_dev', label: 'Web Dev', desc: 'Custom web application', icon: '&#9783;' },
                { id: 'retainer', label: 'Retainer', desc: 'Ongoing maintenance', icon: '&#9874;' },
            ];
            return `
                <div class="form-group"><label>Project Name *</label><input id="f-project" class="form-input" value="${Utils.esc(d.projectName)}" placeholder="Client Dashboard"></div>
                <div class="form-group"><label>Service Type *</label>
                    <div class="service-cards">${types.map(t => `
                        <div class="service-card ${d.serviceType === t.id ? 'selected' : ''}" data-type="${t.id}">
                            <div class="service-icon">${t.icon}</div>
                            <div class="service-label">${t.label}</div>
                            <div class="service-desc">${t.desc}</div>
                        </div>`).join('')}
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Budget (USD)</label><input id="f-budget" class="form-input" type="number" min="0" value="${d.budget}" placeholder="5000"></div>
                    <div class="form-group"><label>Timeline (weeks)</label><input id="f-timeline" class="form-input" type="number" min="1" value="${d.timeline}" placeholder="4"></div>
                </div>
                <div class="wizard-nav"><button class="btn btn-secondary" id="btn-back">&larr; Back</button><button class="btn btn-primary" id="btn-next">Next &rarr;</button></div>`;
        }
        if (this._step === 3) {
            const serviceLabels = { ai_agents: 'AI Agents & Automation', nocode_to_prod: 'NoCode to Production', web_dev: 'Web Development', retainer: 'Ongoing Maintenance' };
            const clientLabel = d.isNewClient ? `${d.name} (${d.company})` : (this._clients.find(c => c.id == d.client_id)?.name || 'Unknown');
            return `
                <div class="review-section">
                    <div class="review-item"><span class="review-label">Client</span><span>${Utils.esc(clientLabel)}</span></div>
                    <div class="review-item"><span class="review-label">Project</span><span>${Utils.esc(d.projectName)}</span></div>
                    <div class="review-item"><span class="review-label">Service</span><span>${serviceLabels[d.serviceType] || d.serviceType}</span></div>
                    ${d.budget ? `<div class="review-item"><span class="review-label">Budget</span><span>${Utils.money(d.budget)}</span></div>` : ''}
                    ${d.timeline ? `<div class="review-item"><span class="review-label">Timeline</span><span>${d.timeline} weeks</span></div>` : ''}
                </div>
                <div class="review-note">This will create a client record, a project with <strong>11 phases</strong> and <strong>45+ tasks</strong> (automated + manual).</div>
                <div class="wizard-nav"><button class="btn btn-secondary" id="btn-back">&larr; Back</button><button class="btn btn-success" id="btn-create">Create Project</button></div>`;
        }
    },

    _bindStepEvents(container) {
        const d = this._data;
        if (this._step === 1) {
            const select = container.querySelector('#client-select');
            const fields = container.querySelector('#new-client-fields');
            select?.addEventListener('change', () => {
                d.isNewClient = select.value === 'new';
                d.client_id = d.isNewClient ? null : parseInt(select.value);
                fields.style.display = d.isNewClient ? 'block' : 'none';
            });
            container.querySelector('#btn-next')?.addEventListener('click', () => {
                if (d.isNewClient) {
                    d.name = container.querySelector('#f-name')?.value.trim() || '';
                    d.company = container.querySelector('#f-company')?.value.trim() || '';
                    d.email = container.querySelector('#f-email')?.value.trim() || '';
                    d.phone = container.querySelector('#f-phone')?.value.trim() || '';
                    if (!d.name || !d.company || !d.email) { Toast.error('Name, company, and email are required'); return; }
                    if (!d.email.includes('@')) { Toast.error('Invalid email address'); return; }
                }
                this._step = 2; this._renderStep(container);
            });
        }
        if (this._step === 2) {
            container.querySelectorAll('.service-card').forEach(card => {
                card.addEventListener('click', () => {
                    container.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    d.serviceType = card.dataset.type;
                });
            });
            container.querySelector('#btn-back')?.addEventListener('click', () => { this._step = 1; this._renderStep(container); });
            container.querySelector('#btn-next')?.addEventListener('click', () => {
                d.projectName = container.querySelector('#f-project')?.value.trim() || '';
                d.budget = container.querySelector('#f-budget')?.value || '';
                d.timeline = container.querySelector('#f-timeline')?.value || '';
                if (!d.projectName) { Toast.error('Project name is required'); return; }
                if (!d.serviceType) { Toast.error('Select a service type'); return; }
                this._step = 3; this._renderStep(container);
            });
        }
        if (this._step === 3) {
            container.querySelector('#btn-back')?.addEventListener('click', () => { this._step = 2; this._renderStep(container); });
            container.querySelector('#btn-create')?.addEventListener('click', async () => {
                const btn = container.querySelector('#btn-create');
                btn.disabled = true; btn.textContent = 'Creating...';
                try {
                    let clientId = d.client_id;
                    if (d.isNewClient) {
                        const client = await API.post('/api/clients', { name: d.name, company: d.company, email: d.email, phone: d.phone || null });
                        clientId = client.id;
                    }
                    const project = await API.post('/api/projects', {
                        client_id: clientId, name: d.projectName, service_type: d.serviceType,
                        budget: d.budget ? parseFloat(d.budget) : null,
                        timeline_weeks: d.timeline ? parseInt(d.timeline) : null,
                    });
                    Toast.success('Project created!');
                    App.navigate('project/' + project.id);
                } catch (err) { Toast.error(err.message); btn.disabled = false; btn.textContent = 'Create Project'; }
            });
        }
    }
};
