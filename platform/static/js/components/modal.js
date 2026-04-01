/* Reusable modal dialog */
const Modal = {
    open({ title = '', body = '', footer = '', size = 'md', onClose = null }) {
        const root = document.getElementById('modal-root');
        root.innerHTML = `
            <div class="modal-overlay" onclick="Modal.close()">
                <div class="modal modal-${size}" onclick="event.stopPropagation()">
                    <div class="modal-header">
                        <h3>${title}</h3>
                        <button class="modal-close" onclick="Modal.close()">&times;</button>
                    </div>
                    <div class="modal-body">${body}</div>
                    ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
                </div>
            </div>`;
        root.querySelector('.modal-overlay').classList.add('show');
        this._onClose = onClose;
        document.addEventListener('keydown', this._escHandler);
    },
    close() {
        const root = document.getElementById('modal-root');
        root.innerHTML = '';
        document.removeEventListener('keydown', this._escHandler);
        if (this._onClose) this._onClose();
    },
    setBody(html) {
        const body = document.querySelector('.modal-body');
        if (body) body.innerHTML = html;
    },
    _escHandler(e) { if (e.key === 'Escape') Modal.close(); }
};
