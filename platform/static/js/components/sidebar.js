/* Sidebar navigation */
const Sidebar = {
    render() {
        document.getElementById('sidebar').innerHTML = `
            <div class="sidebar-logo" onclick="App.navigate('dashboard')">
                <div class="logo-icon">S</div>
                <div class="logo-text">Silv<span class="logo-accent">A.i</span></div>
            </div>
            <nav class="sidebar-nav">
                <a href="#dashboard" data-view="dashboard" class="nav-link">
                    <span class="nav-icon">&#9632;</span> Dashboard
                </a>
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
