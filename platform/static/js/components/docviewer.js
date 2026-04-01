/* Document Form Renderer - parses markdown into editable form fields.
   Field markers are preserved on save so fields remain editable:
   - Empty field:  ___
   - Filled field:  ___value___
   - Hint empty:   _[hint text]_
   - Hint filled:  _[hint text:value]_
   - Textarea empty:  > _[hint]_
   - Textarea filled: > _[hint:value]_
*/
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

            // Close table if leaving
            if (inTable && !trimmed.startsWith('|')) {
                html += this._renderTable(tableHtml, tableHeaders);
                inTable = false; tableHtml = ''; tableHeaders = [];
            }

            // Table rows
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                if (!inTable) { inTable = true; }
                if (trimmed.replace(/[|\-\s:]/g, '') === '') continue;
                if (!tableHeaders.length) {
                    tableHeaders = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
                } else {
                    tableHtml += trimmed + '\n';
                }
                continue;
            }

            if (!trimmed) { html += '<div class="form-spacer"></div>'; continue; }
            if (trimmed === '---') { html += '<hr class="form-hr">'; continue; }
            if (trimmed.startsWith('### ')) { html += `<h3 class="form-h3">${Utils.esc(trimmed.slice(4))}</h3>`; continue; }
            if (trimmed.startsWith('## ')) { html += `<h2 class="form-h2">${Utils.esc(trimmed.slice(3))}</h2>`; continue; }
            if (trimmed.startsWith('# ')) { html += `<h1 class="form-h1">${Utils.esc(trimmed.slice(2))}</h1>`; continue; }

            // Blockquote textarea: > _[hint]_  or  > _[hint:filled value]_
            const taMatch = trimmed.match(/^> _\[([^\]]*)\]_$/);
            if (taMatch) {
                const inner = taMatch[1];
                const colonIdx = inner.indexOf(':');
                let hint = inner, val = '';
                if (colonIdx > 0) { hint = inner.slice(0, colonIdx); val = inner.slice(colonIdx + 1); }
                html += `<textarea class="form-textarea" data-line="${i}" data-hint="${Utils.esc(hint)}" placeholder="${Utils.esc(hint)}" rows="3">${Utils.esc(val)}</textarea>`;
                continue;
            }

            // Checkbox: - [ ] or - [x]
            if (/^- \[([ x])\] /.test(trimmed)) {
                const checked = trimmed[3] === 'x';
                const rest = trimmed.slice(6);
                html += `<label class="form-checkbox" data-line="${i}"><input type="checkbox" ${checked ? 'checked' : ''}><span>${this._inlineFields(rest, i)}</span></label>`;
                continue;
            }

            // Bold label: **Key:** value
            if (trimmed.startsWith('**') && trimmed.includes(':**')) {
                const parts = trimmed.split(':**');
                const label = parts[0].slice(2);
                const value = parts.slice(1).join(':**').trim();
                html += `<div class="form-field-row"><strong>${Utils.esc(label)}:</strong> ${this._inlineFields(value, i)}</div>`;
                continue;
            }

            // List bold: - **Key:** value
            if (trimmed.startsWith('- **') && trimmed.includes(':**')) {
                const inner = trimmed.slice(2);
                const parts = inner.split(':**');
                const label = parts[0].slice(2);
                const value = parts.slice(1).join(':**').trim();
                html += `<div class="form-field-row form-list-item"><strong>${Utils.esc(label)}:</strong> ${this._inlineFields(value, i)}</div>`;
                continue;
            }

            // Regular list
            if (trimmed.startsWith('- ')) {
                html += `<div class="form-list-item">${this._inlineFields(trimmed.slice(2), i)}</div>`;
                continue;
            }

            // Numbered list
            const numMatch = trimmed.match(/^(\d+)\. (.+)$/);
            if (numMatch) {
                html += `<div class="form-list-item form-numbered"><span class="form-num">${numMatch[1]}.</span> ${this._inlineFields(numMatch[2], i)}</div>`;
                continue;
            }

            // Paragraph
            html += `<p class="form-p">${this._inlineFields(trimmed, i)}</p>`;
        }

        if (inTable) { html += this._renderTable(tableHtml, tableHeaders); }
        return html;
    },

    _inlineFields(text, lineNum) {
        let result = text;

        // Filled hint fields: _[hint:value]_ → input with value and placeholder
        result = result.replace(/_\[([^\]]*):([^\]]*)\]_/g, (match, hint, val) => {
            return `<input type="text" class="field-inline field-hint" data-line="${lineNum}" data-hint="${Utils.esc(hint)}" data-pattern="_hint_" placeholder="${Utils.esc(hint)}" value="${Utils.esc(val)}">`;
        });

        // Empty hint fields: _[hint]_ → input with placeholder
        result = result.replace(/_\[([^\]]+)\]_/g, (match, hint) => {
            return `<input type="text" class="field-inline field-hint" data-line="${lineNum}" data-hint="${Utils.esc(hint)}" data-pattern="_hint_" placeholder="${Utils.esc(hint)}">`;
        });

        // Currency: $___  or $___value___
        result = result.replace(/\$___([^_]*)___/g, (match, val) => {
            return `$<input type="number" class="field-inline field-currency" data-line="${lineNum}" data-pattern="$___" placeholder="0" min="0" value="${Utils.esc(val.trim())}">`;
        });
        result = result.replace(/\$___/g, () => {
            return `$<input type="number" class="field-inline field-currency" data-line="${lineNum}" data-pattern="$___" placeholder="0" min="0">`;
        });

        // Filled inline fields: ___value___ → input with value
        result = result.replace(/___([^_]+)___/g, (match, val) => {
            return `<input type="text" class="field-inline" data-line="${lineNum}" data-pattern="___" value="${Utils.esc(val)}">`;
        });

        // Empty inline fields: ___ → empty input
        result = result.replace(/(?<!data-pattern=")___(?!")/g, () => {
            return `<input type="text" class="field-inline" data-line="${lineNum}" data-pattern="___">`;
        });

        // Bold
        result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // Italic
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
                if (cell.includes('___')) {
                    // Check for filled: ___value___
                    const filledMatch = cell.match(/___([^_]+)___/);
                    const val = filledMatch ? filledMatch[1] : '';
                    html += `<td><input type="text" class="field-inline field-cell" data-row="${ri}" data-col="${ci}" value="${Utils.esc(val)}"></td>`;
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
        const form = document.querySelector('.doc-form');
        if (!form) return;

        const newLines = [...this._lines];

        // Checkboxes
        form.querySelectorAll('.form-checkbox').forEach(label => {
            const li = parseInt(label.dataset.line);
            const cb = label.querySelector('input[type="checkbox"]');
            if (cb && !isNaN(li) && newLines[li]) {
                newLines[li] = newLines[li].replace(/- \[[ x]\]/, cb.checked ? '- [x]' : '- [ ]');
            }
        });

        // Textareas → save as > _[hint:value]_ to preserve editability
        form.querySelectorAll('.form-textarea').forEach(ta => {
            const li = parseInt(ta.dataset.line);
            const hint = ta.dataset.hint || '';
            if (!isNaN(li)) {
                if (ta.value.trim()) {
                    newLines[li] = `> _[${hint}:${ta.value.trim()}]_`;
                } else {
                    newLines[li] = `> _[${hint}]_`;
                }
            }
        });

        // Inline fields → save as ___value___ to preserve editability
        const lineFields = {};
        form.querySelectorAll('.field-inline').forEach(input => {
            const li = parseInt(input.dataset.line);
            if (isNaN(li)) return;
            if (!lineFields[li]) lineFields[li] = [];
            lineFields[li].push({
                pattern: input.dataset.pattern || '___',
                hint: input.dataset.hint || '',
                value: input.value.trim()
            });
        });

        for (const [lineIdx, fields] of Object.entries(lineFields)) {
            let line = newLines[lineIdx];
            if (!line) continue;

            for (const field of fields) {
                if (field.pattern === '_hint_') {
                    // Hint field: replace _[hint]_ or _[hint:oldval]_ with _[hint:newval]_
                    const hintEsc = field.hint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const re = new RegExp(`_\\[${hintEsc}(:[^\\]]*)?\\]_`);
                    if (field.value) {
                        line = line.replace(re, `_[${field.hint}:${field.value}]_`);
                    } else {
                        line = line.replace(re, `_[${field.hint}]_`);
                    }
                } else if (field.pattern === '$___') {
                    // Currency: $___  or $___oldval___
                    if (field.value) {
                        line = line.replace(/\$___([^_]*)___|\$___/, `$___${field.value}___`);
                    }
                } else {
                    // Regular ___  or ___oldval___
                    if (field.value) {
                        line = line.replace(/___[^_]*___|___/, `___${field.value}___`);
                    }
                }
            }
            newLines[lineIdx] = line;
        }

        this._raw = newLines.join('\n');
        this._lines = [...newLines];

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
        // Copy a clean version (without markers) for sharing
        let clean = this._raw;
        clean = clean.replace(/___([^_]+)___/g, '$1'); // ___value___ → value
        clean = clean.replace(/_\[([^\]]*):([^\]]*)\]_/g, '$2'); // _[hint:value]_ → value
        clean = clean.replace(/_\[([^\]]+)\]_/g, '___'); // unfilled hints stay as ___
        if (clean) {
            try {
                await navigator.clipboard.writeText(clean);
                Toast.success('Copied clean document to clipboard!');
            } catch {
                const ta = document.createElement('textarea');
                ta.value = clean;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
                Toast.success('Copied clean document to clipboard!');
            }
        }
    }
};
