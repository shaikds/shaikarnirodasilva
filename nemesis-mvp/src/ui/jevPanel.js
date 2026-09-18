// JEV panel (FR-9.2/9.3): the "LET JEV PLAY" toggle + backend config.
// The key field is optional and dev-only — the preferred path is the
// local proxy, which holds the key server-side (AC-9.3.1).

const CSS = `
#jev {
  position: fixed; right: 18px; bottom: 18px; z-index: 30;
  font-size: 11px; letter-spacing: 1px;
}
#jev .toggle {
  padding: 7px 14px; cursor: pointer; user-select: none; text-align: center;
  border: 1px solid #33334f; background: rgba(14,14,28,0.9); color: #8a8aa5;
}
#jev.on .toggle { color: #ffd24d; border-color: #ffd24d; box-shadow: 0 0 12px rgba(255,210,77,0.25); }
#jev.offline .toggle { color: #ff4d6a; border-color: #ff4d6a; }
#jev .cfg {
  display: none; margin-bottom: 6px; padding: 10px 12px; width: 250px;
  border: 1px solid #33334f; background: rgba(14,14,28,0.95);
}
#jev.cfgopen .cfg { display: block; }
#jev .cfg label { display: block; color: #667; margin: 6px 0 2px; }
#jev .cfg input {
  width: 100%; box-sizing: border-box; padding: 4px 6px;
  background: #10101f; border: 1px solid #33334f; color: #dfe3ff;
  font: 11px monospace;
}
#jev .cfg .note { color: #554; color: #776a3a; margin-top: 7px; line-height: 1.5; }
#jev .cfg .gear { color: #667; }
#jev .gear {
  position: absolute; right: 4px; top: -18px; cursor: pointer; color: #556;
}
`;

export class JevPanel {
  constructor({ driver, onToggle }) {
    this.driver = driver;
    this.onToggle = onToggle;
    this.active = false;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'jev';
    this.el.innerHTML = `
      <div class="gear" title="configure backend">⚙</div>
      <div class="cfg">
        <label>decision endpoint (local proxy holds your key)</label>
        <input class="url" spellcheck="false">
        <label>model</label>
        <input class="model" spellcheck="false">
        <label>API key — dev only; prefer the proxy</label>
        <input class="key" type="password" spellcheck="false" placeholder="leave empty when using the proxy">
        <div class="note">key is kept in this browser's localStorage only — never in the page or the repo.
        proxy: <b>TYPESAFE_API_KEY=… node tools/jev-proxy.mjs</b></div>
      </div>
      <div class="toggle">LET JEV PLAY</div>`;
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
    const label = !this.active ? 'LET JEV PLAY'
      : this.driver.offline ? 'JEV · OFFLINE (fallback fighting)' : 'JEV IS FIGHTING · click to take over';
    if (t.textContent !== label) t.textContent = label;
  }
}
