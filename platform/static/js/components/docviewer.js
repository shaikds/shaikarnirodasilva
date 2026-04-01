/* Document Form Renderer - parses markdown into editable form fields */
const DocViewer = {
    _actionId: null,
    _raw: '',
    _lines: [],

    async show(actionId) {
        this._actionId = actionId;
        Modal.open({
            title: 'Document',
            body: '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>',
            footer: `
                <span class="save-indicator" id="save-status"></span>
                <button class="btn btn-success" onclick="DocViewer.save()">Save</button>
                <button class="btn btn-secondary" onclick="DocViewer.copy()">Copy MD</button>
                <button class="btn btn-secondary" onclick="Modal.close()">Close</button>`,
            size: 'lg'
        });
        try {
            const data = await API.get(`/api/actions/${actionId}/document`);
            this._raw = data.content;
            this._lines = this._raw.split('\n');
            Modal.setBody(`<div class="doc-form">${this._renderForm()}</div>`);
        } catch (err) {
            Modal.setBody(`<div class="error-state"><p>${Utils.esc(err.message)}</p></div>`);
        }
    },

    _renderForm() {
        let html = '';
        let inTable = false;
        let tableHtml = '';
        let tableHeaders = [];

        for (let i = 0; i < this._lines.length; i++) {
            const line = this._lines[i];
            const trimmed = line.trim();

            // Close table if we're leaving one
            if (inTable && !trimmed.startsWith('|')) {
                html += this._renderTable(tableHtml, tableHeaders);
                inTable = false;
                tableHtml = '';
                tableHeaders = [];
            }

            // Table rows
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                if (!inTable) { inTable = true; tableHeaders = []; tableHtml = ''; }
                if (trimmed.replace(/[|\-\s]/g, '') === '') continue; // separator row
                if (!tableHeaders.length) {
                    tableHeaders = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
                } else {
                    tableHtml += trimmed + '\n';
                }
                continue;
            }

            // Empty line
            if (!trimmed) { html += '<div class="form-spacer"></div>'; continue; }

            // Horizontal rule
            if (trimmed === '---') { html += '<hr class="form-hr">'; continue; }

            // Headers
            if (trimmed.startsWith('### ')) { html += `<h3 class="form-h3">${Utils.esc(trimmed.slice(4))}</h3>`; continue; }
            if (trimmed.startsWith('## ')) { html += `<h2 class="form-h2">${Utils.esc(trimmed.slice(3))}</h2>`; continue; }
            if (trimmed.startsWith('# ')) { html += `<h1 class="form-h1">${Utils.esc(trimmed.slice(2))}</h1>`; continue; }

            // Blockquote with hint placeholder: > _[hint text]_
            if (trimmed.startsWith('> _[') && trimmed.endsWith(']_')) {
                const hint = trimmed.slice(4, -2);
                html += `<textarea class="form-textarea" data-line="${i}" placeholder="${Utils.esc(hint)}" rows="3"></textarea>`;
                continue;
            }

            // Checkbox: - [ ] or - [x]
            if (/^- \[([ x])\] /.test(trimmed)) {
                const checked = trimmed[3] === 'x';
                const rest = trimmed.slice(6);
                // Check if rest contains ___
                const labelHtml = this._inlineFields(rest, i);
                html += `<label class="form-checkbox" data-line="${i}"><input type="checkbox" ${checked ? 'checked' : ''}><span>${labelHtml}</span></label>`;
                continue;
            }

            // Bold label with value: **Key:** value
            if (trimmed.startsWith('**') && trimmed.includes(':**')) {
                const parts = trimmed.split(':**');
                const label = parts[0].slice(2);
                const value = parts.slice(1).join(':**').trim();
                const valueHtml = this._inlineFields(value, i);
                html += `<div class="form-field-row"><strong>${Utils.esc(label)}:</strong> ${valueHtml}</div>`;
                continue;
            }

            // List item: - **Key:** value
            if (trimmed.startsWith('- **') && trimmed.includes(':**')) {
                const inner = trimmed.slice(2);
                const parts = inner.split(':**');
                const label = parts[0].slice(2);
                const value = parts.slice(1).join(':**').trim();
                const valueHtml = this._inlineFields(value, i);
                html += `<div class="form-field-row form-list-item"><strong>${Utils.esc(label)}:</strong> ${valueHtml}</div>`;
                continue;
            }

            // Regular list item
            if (trimmed.startsWith('- ')) {
                html += `<div class="form-list-item">${this._inlineFields(trimmed.slice(2), i)}</div>`;
                continue;
            }

            // Numbered list
            if (/^\d+\. /.test(trimmed)) {
                const match = trimmed.match(/^(\d+)\. (.+)$/);
                if (match) {
                    html += `<div class="form-list-item form-numbered"><span class="form-num">${match[1]}.</span> ${this._inlineFields(match[2], i)}</div>`;
                    continue;
                }
            }

            // Regular paragraph with possible inline fields
            html += `<p class="form-p">${this._inlineFields(trimmed, i)}</p>`;
        }

        // Close any remaining table
        if (inTable) { html += this._renderTable(tableHtml, tableHeaders); }

        return html;
    },

    _inlineFields(text, lineNum) {
        // Replace _[hint text]_ with input placeholder
        let result = text.replace(/_\[([^\]]+)\]_/g, (match, hint) => {
            return `<input type="text" class="field-inline field-hint" data-line="${lineNum}" data-pattern="${Utils.esc(match)}" placeholder="${Utils.esc(hint)}">`;
        });
        // Replace $___  with currency input
        result = result.replace(/\$___/g, (match) => {
            return `$<input type="number" class="field-inline field-currency" data-line="${lineNum}" data-pattern="$___" placeholder="0" min="0">`;
        });
        // Replace ___ with text input (but not inside already-created inputs)
        result = result.replace(/(?<!data-pattern=")___(?!")/g, (match) => {
            return `<input type="text" class="field-inline" data-line="${lineNum}" data-pattern="___">`;
        });
        // Bold
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic (but not our _[...]_ pattern)
        result = result.replace(/(?<!\[)\*(.+?)\*(?!\])/g, '<em>$1</em>');
        return result;
    },

    _renderTable(rowsStr, headers) {
        if (!headers.length) return '';
        const rows = rowsStr.trim().split('\n').filter(r => r.trim());
        let html = '<table class="form-table"><thead><tr>';
        headers.forEach(h => { html += `<th>${Utils.esc(h)}</th>`; });
        html += '</tr></thead><tbody>';
        rows.forEach((row, ri) => {
            const cells = row.split('|').filter(c => c !== '').map(c => c.trim());
            html += '<tr>';
            cells.forEach((cell, ci) => {
                if (cell === '___' || cell.includes('___')) {
                    html += `<td><input type="text" class="field-inline field-cell" data-row="${ri}" data-col="${ci}" value="${cell === '___' ? '' : Utils.esc(cell.replace(/___/g, ''))}"></td>`;
                } else {
                    html += `<td>${Utils.esc(cell)}</td>`;
                }
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    },

    async save() {
        this._setSaveStatus('saving');
        // Reconstruct markdown from form state
        const form = document.querySelector('.doc-form');
        if (!form) return;

        // Rebuild lines from original, replacing field values
        const newLines = [...this._lines];

        // Process checkboxes
        form.querySelectorAll('.form-checkbox').forEach(label => {
            const lineIdx = parseInt(label.dataset.line);
            const cb = label.querySelector('input[type="checkbox"]');
            if (cb && !isNaN(lineIdx) && newLines[lineIdx]) {
                newLines[lineIdx] = newLines[lineIdx].replace(/- \[[ x]\]/, cb.checked ? '- [x]' : '- [ ]');
            }
        });

        // Process textareas (blockquote hints)
        form.querySelectorAll('.form-textarea').forEach(ta => {
            const lineIdx = parseInt(ta.dataset.line);
            if (!isNaN(lineIdx) && ta.value.trim()) {
                newLines[lineIdx] = '> ' + ta.value.trim();
            }
        });

        // Process inline fields - collect by line
        const lineFields = {};
        form.querySelectorAll('.field-inline').forEach(input => {
            const lineIdx = parseInt(input.dataset.line);
            if (isNaN(lineIdx)) return;
            if (!lineFields[lineIdx]) lineFields[lineIdx] = [];
            lineFields[lineIdx].push({
                pattern: input.dataset.pattern || '___',
                value: input.value || '___'
            });
        });

        // Replace fields in lines (one at a time, in order)
        for (const [lineIdx, fields] of Object.entries(lineFields)) {
            let line = newLines[lineIdx];
            if (!line) continue;
            for (const field of fields) {
                if (field.pattern && field.value !== '___') {
                    line = line.replace(field.pattern, field.value || field.pattern);
                }
            }
            newLines[lineIdx] = line;
        }

        this._raw = newLines.join('\n');
        this._lines = newLines;

        try {
            await API.put(`/api/actions/${this._actionId}/document`, { content: this._raw });
            this._setSaveStatus('saved');
            Toast.success('Document saved!');
        } catch (err) {
            this._setSaveStatus('error');
            Toast.error('Save failed: ' + err.message);
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
