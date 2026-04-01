/* API client + utilities */
const API = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || res.statusText); }
        return res.json();
    },
    async post(url, data) {
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || res.statusText); }
        return res.json();
    },
    async put(url, data) {
        const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || res.statusText); }
        return res.json();
    },
    async del(url) {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || res.statusText); }
        return res.json();
    }
};

const Utils = {
    esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; },
    money(n) { return n != null ? '$' + Number(n).toLocaleString() : 'TBD'; },
    badge(type) {
        const map = { ai_agents: ['AI Agents', 'purple'], nocode_to_prod: ['NoCode\u2192Prod', 'orange'], web_dev: ['Web Dev', 'blue'], retainer: ['Retainer', 'green'] };
        const [label, color] = map[type] || [type, 'gray'];
        return `<span class="badge badge-${color}">${Utils.esc(label)}</span>`;
    },
    renderMd(md) {
        if (!md) return '';
        let h = Utils.esc(md);
        h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
        h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
        h = h.replace(/^- \[x\] (.+)$/gm, '<div class="md-check done">&#10003; $1</div>');
        h = h.replace(/^- \[ \] (.+)$/gm, '<div class="md-check">&#9744; $1</div>');
        h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
        h = h.replace(/^(\d+)\. (.+)$/gm, '<li>$1. $2</li>');
        h = h.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        h = h.replace(/^---$/gm, '<hr>');
        h = h.replace(/\n\n/g, '</p><p>');
        return '<div class="md-content"><p>' + h + '</p></div>';
    }
};
