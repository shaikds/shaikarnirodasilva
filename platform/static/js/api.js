/**
 * API Client - Fetch wrapper for SilvA.i Platform
 */
const API = {
    baseURL: '/api',

    async request(method, url, data) {
        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(this.baseURL + url, options);
            if (!response.ok) {
                const errorBody = await response.text();
                let message;
                try {
                    const parsed = JSON.parse(errorBody);
                    message = parsed.detail || parsed.message || errorBody;
                } catch (e) {
                    message = errorBody || response.statusText;
                }
                throw new Error(message);
            }
            return await response.json();
        } catch (error) {
            if (error instanceof TypeError && error.message === 'Failed to fetch') {
                throw new Error('Unable to connect to the server. Please check your connection.');
            }
            throw error;
        }
    },

    get(url) {
        return this.request('GET', url);
    },

    post(url, data) {
        return this.request('POST', url, data);
    },

    put(url, data) {
        return this.request('PUT', url, data);
    },

    delete(url) {
        return this.request('DELETE', url);
    }
};

/**
 * Toast notification system
 */
const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type) {
        type = type || 'info';
        this.init();
        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        this.container.appendChild(toast);
        setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(30px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(function() { toast.remove(); }, 300);
        }, 3500);
    },

    success(message) { this.show(message, 'success'); },
    error(message) { this.show(message, 'error'); },
    warning(message) { this.show(message, 'warning'); }
};

/**
 * Utility helpers
 */
const Utils = {
    formatCurrency(amount) {
        if (amount == null) return '$0';
        var num = Number(amount);
        if (num >= 1000) {
            return '$' + (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'K';
        }
        return '$' + num.toLocaleString();
    },

    formatCurrencyFull(amount) {
        if (amount == null) return '$0';
        return '$' + Number(amount).toLocaleString();
    },

    getServiceBadgeClass(serviceType) {
        if (!serviceType) return 'badge-blue';
        var s = serviceType.toLowerCase();
        if (s.indexOf('ai') !== -1 || s.indexOf('agent') !== -1) return 'badge-purple';
        if (s.indexOf('nocode') !== -1 || s.indexOf('no-code') !== -1 || s.indexOf('no code') !== -1) return 'badge-orange';
        if (s.indexOf('web') !== -1) return 'badge-blue';
        if (s.indexOf('retainer') !== -1 || s.indexOf('maint') !== -1) return 'badge-green';
        return 'badge-blue';
    },

    getStatusBadgeClass(status) {
        if (!status) return 'badge-pending';
        var s = status.toLowerCase();
        if (s === 'completed' || s === 'done') return 'badge-completed';
        if (s === 'in_progress' || s === 'in progress' || s === 'active') return 'badge-active';
        return 'badge-pending';
    },

    getProgressColor(percent) {
        if (percent >= 80) return 'green';
        if (percent >= 40) return '';
        return '';
    },

    escapeHtml(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    getProjectIdFromURL() {
        var params = new URLSearchParams(window.location.search);
        return params.get('id');
    },

    initMobileMenu() {
        var menuBtn = document.querySelector('.mobile-menu-btn');
        var sidebar = document.querySelector('.sidebar');
        var overlay = document.querySelector('.overlay');
        if (menuBtn && sidebar) {
            menuBtn.addEventListener('click', function() {
                sidebar.classList.toggle('open');
                if (overlay) overlay.classList.toggle('active');
            });
            if (overlay) {
                overlay.addEventListener('click', function() {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                });
            }
        }
    }
};
