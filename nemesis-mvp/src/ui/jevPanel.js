// Jev panel (FR-9.2/9.3, FR-10.2): a reusable "LET JEV PLAY/BE THE
// NEMESIS" toggle + backend config. Two independent instances exist — one
// drives the player, one drives the rival — each with its own namespaced
// backend config (separate localStorage key, possibly a different
// account). The key field is optional and dev-only; the preferred path
// is the local proxy, which holds the key server-side (AC-9.3.1).

const CSS = `
.jevpanel {
  position: fixed; z-index: 30; font-size: 11px; letter-spacing: 1px;
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
.jevpanel .err {
  display: none; margin-top: 4px; padding: 6px 8px; max-width: 320px;
  background: rgba(30,8,14,0.95); border: 1px solid #ff4d6a; color: #ffb3c0;
  font-size: 10px; line-height: 1.5; word-break: break-word; white-space: normal;
  cursor: text; user-select: text;
}
.jevpanel.offline .err { display: block; }
@media (max-width: 560px) {
  .jevpanel .cfg { width: 190px; }
  .jevpanel .toggle { font-size: 10px; padding: 6px 8px; }
  .jevpanel .err { max-width: 220px; }
}
`;
let styleInjected = false;

export class JevPanel {
  // pos: any mix of {left,right,top,bottom} in px — lets the caller place
  // this clear of the touch-button cluster on mobile (FR-11.1.2) without
  // the component itself knowing about layout, same component either way
  constructor({ id, driver, onToggle, pos = { right: 18, bottom: 18 },
                idleLabel = 'LET JEV PLAY',
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
    for (const [k, v] of Object.entries(pos)) this.el.style[k] = v + 'px';
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
      <div class="toggle">${idleLabel}</div>
      <div class="err"></div>`;
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

  // render-loop status: red border while the backend is failing, with the
  // actual failure text shown on screen — no dev tools required
  tick() {
    const failing = this.active && this.driver.offline;
    this.el.classList.toggle('offline', failing);
    const t = this.el.querySelector('.toggle');
    const label = !this.active ? this.idleLabel
      : this.driver.offline ? this.offlineLabel : this.onLabel;
    if (t.textContent !== label) t.textContent = label;
    const errEl = this.el.querySelector('.err');
    const errText = failing ? (this.driver.lastError ?? 'unknown error') : '';
    if (errEl.textContent !== errText) errEl.textContent = errText;
  }
}
