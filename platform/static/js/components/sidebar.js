/* Sidebar navigation with view switcher */
const Sidebar = {
    render() {
        const currentMode = App.viewMode || 'dashboard';
        document.getElementById('sidebar').innerHTML = `
            <div class="sidebar-logo" onclick="App.navigate('dashboard')">
                <div class="logo-icon">S</div>
                <div class="logo-text">Silv<span class="logo-accent">A.i</span></div>
            </div>

            <div class="view-switcher">
                <div class="view-switcher-label">View Mode</div>
                <div class="view-switcher-options">
                    <button class="view-btn ${currentMode === 'dashboard' ? 'active' : ''}" onclick="App.setViewMode('dashboard')" title="Dashboard - Quick daily check-in">
                        <span class="view-btn-icon">&#9632;</span>
                        <span>Dashboard</span>
                    </button>
                    <button class="view-btn ${currentMode === 'kanban' ? 'active' : ''}" onclick="App.setViewMode('kanban')" title="Kanban - Projects by phase">
                        <span class="view-btn-icon">&#9776;</span>
                        <span>Kanban</span>
                    </button>
                    <button class="view-btn ${currentMode === 'crm' ? 'active' : ''}" onclick="App.setViewMode('crm')" title="CRM - Client-first view">
                        <span class="view-btn-icon">&#9734;</span>
                        <span>CRM</span>
                    </button>
                </div>
            </div>

            <nav class="sidebar-nav">
                <a href="#new" data-view="new" class="nav-link">
                    <span class="nav-icon">+</span> New Project
                </a>
                <a href="#clients" data-view="clients" class="nav-link">
                    <span class="nav-icon">&#9830;</span> Clients
                </a>
            </nav>
            <div class="sidebar-footer">Project Manager v2.0</div>`;
    },
    setActive(view) {
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.toggle('active', el.dataset.view === view);
        });
    }
};
