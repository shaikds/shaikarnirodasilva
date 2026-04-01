/* SPA Router + App initialization with view mode switching */
const App = {
    viewMode: localStorage.getItem('silvai_view') || 'dashboard',

    init() {
        Sidebar.render();
        window.addEventListener('hashchange', () => App.route());
        App.route();
    },

    route() {
        const hash = location.hash.slice(1) || '';
        const parts = hash.split('/');
        const view = parts[0] || this.viewMode;
        const param = parts[1];
        const app = document.getElementById('app');

        Sidebar.setActive(view);

        switch (view) {
            case 'project': ProjectView.render(app, param); break;
            case 'new': NewProjectView.render(app); break;
            case 'clients': ClientsView.render(app); break;
            case 'kanban': KanbanView.render(app); break;
            case 'crm': CrmView.render(app); break;
            case 'dashboard': DashboardView.render(app); break;
            default:
                // Use the current view mode as home
                if (this.viewMode === 'kanban') KanbanView.render(app);
                else if (this.viewMode === 'crm') CrmView.render(app);
                else DashboardView.render(app);
                break;
        }
    },

    navigate(path) { location.hash = path; },

    setViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('silvai_view', mode);
        Sidebar.render();
        // Navigate to the new view mode
        location.hash = mode;
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
