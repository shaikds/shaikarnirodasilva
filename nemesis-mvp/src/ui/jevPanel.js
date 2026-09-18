// Jev panel (FR-9.2/9.3, FR-10.2): a reusable "LET JEV PLAY/BE THE
// NEMESIS" toggle + backend config. Two independent instances exist — one
// drives the player, one drives the rival — each with its own namespaced
// backend config (separate localStorage key, possibly a different
// account). The key field is optional and dev-only; the preferred path
// is the local proxy, which holds the key server-side (AC-9.3.1).

const CSS = `
.jevpanel {
  position: fixed; right: 18px; z-index: 30; font-size: 11px; letter-spacing: 1px;
}
.jevpanel .toggle {
  padding: 7px 14px; cursor: pointer; user-select: none; text-align: center;
  border: 1px solid #33334f; background: rgba(14,14,28,0.9); color: #8a8aa5;
}
.jevpanel.on .toggle { color: #ffd24d; border-color: #ffd24d; box-shadow: 0 0 12px rgba(255,210,77,0.25); }
.jevpanel.offline .toggle { color: #ff4d6a; border-color: #ff4d6a; }
.jevpanel .cfg {
  display: none; margin-bottom: 6px; padding: 10px 12px; width: 250px;
  border: 1px solid #33334f; background: rgba(14,14,28,0.95);
}
.jevpanel.cfgopen .cfg { display: block; }
.jevpanel .cfg label { display: block; color: #667; margin: 6px 0 2px; }
.jevpanel .cfg input {
  width: 100%; box-sizing: border-box; padding: 4px 6px;
  background: #10101f; border: 1px solid #33334f; color: #dfe3ff;
  font: 11px monospace;
}
.jevpanel .cfg .note { color: #776a3a; margin-top: 7px; line-height: 1.5; }
.jevpanel .gear {
  position: absolute; right: 4px; top: -18px; cursor: pointer; color: #556;
}
`;
let styleInjected = false;

export class JevPanel {
  constructor({ id, driver, onToggle, bottom = 18, idleLabel = 'LET JEV PLAY',
                onLabel = 'JEV IS FIGHTING · click to take over',
                offlineLabel = 'JEV · OFFLINE (fallback fighting)' }) {
    this.driver = driver;
    this.onToggle = onToggle;
    this.active = false;
    this.idleLabel = idleLabel; this.onLabel = onLabel; this.offlineLabel = offlineLabel;
    if (!styleInjected) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      styleInjected = true;
    }
    this.el = document.createElement('div');
    this.el.id = id;
    this.el.className = 'jevpanel';
    this.el.style.bottom = bottom + 'px';
    this.el.innerHTML = `
      <div class="gear" title="configure backend">⚙</div>
      <div class="cfg">
        <label>decision endpoint (local proxy holds your key)</label>
        <input class="url" spellcheck="false" placeholder="https://api.typesafe.ai/v1/systemone for direct mode">
        <label>model</label>
        <input class="model" spellcheck="false" placeholder="jev-latest">
        <label>API key — dev only; prefer the proxy</label>
        <input class="key" type="password" spellcheck="false" placeholder="leave empty when using the proxy">
        <div class="note">key is kept in this browser's localStorage only — never in the page or the repo.
        proxy: <b>TYPESAFE_API_KEY=… node tools/jev-proxy.mjs</b></div>
      </div>
      <div class="toggle">${idleLabel}</div>`;
    document.body.appendChild(this.el);
    const q = s => this.el.querySelector(s);
    q('.url').value = driver.backend.url;
    q('.model').value = driver.backend.model;
    q('.key').value = driver.backend.apiKey;
    q('.gear').addEventListener('click', () => this.el.classList.toggle('cfgopen'));
    for (const cls of ['url', 'model', 'key']) {
      q('.' + cls).addEventListener('change', () => {
        driver.backend.saveConfig({
          url: q('.url').value.trim(),
          model: q('.model').value.trim(),
          apiKey: q('.key').value.trim(),
        });
      });
    }
    q('.toggle').addEventListener('click', () => this.toggle());
  }

  toggle(force = null) {
    this.active = force ?? !this.active;
    this.el.classList.toggle('on', this.active);
    this.onToggle(this.active);
  }

  // render-loop status: red border while the backend is failing
  tick() {
    this.el.classList.toggle('offline', this.active && this.driver.offline);
    const t = this.el.querySelector('.toggle');
    const label = !this.active ? this.idleLabel
      : this.driver.offline ? this.offlineLabel : this.onLabel;
    if (t.textContent !== label) t.textContent = label;
  }
}
