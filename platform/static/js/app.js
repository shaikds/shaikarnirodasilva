/* SPA Router + App initialization */
const App = {
    init() {
        Sidebar.render();
        window.addEventListener('hashchange', () => App.route());
        App.route();
    },
    route() {
        const hash = location.hash.slice(1) || 'dashboard';
        const parts = hash.split('/');
        const view = parts[0];
        const param = parts[1];
        const app = document.getElementById('app');
        Sidebar.setActive(view);
        switch (view) {
            case 'project': ProjectView.render(app, param); break;
            case 'new': NewProjectView.render(app); break;
            case 'clients': ClientsView.render(app); break;
            default: DashboardView.render(app); break;
        }
    },
    navigate(path) { location.hash = path; }
};

document.addEventListener('DOMContentLoaded', () => App.init());
