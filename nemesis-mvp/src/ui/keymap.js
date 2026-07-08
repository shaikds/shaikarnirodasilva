// Key-map overlay (FR-8.5): shown once on boot so a new player knows the
// controls before First Blood; H re-opens it any time. DOM only.

const CSS = `
#keymap {
  position: fixed; inset: 0; z-index: 40; display: flex;
  align-items: center; justify-content: center;
  background: rgba(6, 6, 14, 0.82);
  transition: opacity 0.25s; font-size: 14px;
}
#keymap.hidden { opacity: 0; pointer-events: none; }
#keymap .panel {
  min-width: 460px; max-width: 620px; padding: 26px 34px;
  border: 1px solid #33334f; background: rgba(14, 14, 28, 0.95);
  box-shadow: 0 0 40px rgba(255, 77, 106, 0.15);
}
#keymap h1 {
  margin: 0 0 14px; font-size: 18px; letter-spacing: 5px;
  color: var(--rival, #ff4d6a); text-align: center;
}
#keymap .grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px 30px;
}
#keymap .row { display: flex; align-items: baseline; gap: 12px; padding: 3px 0; }
#keymap kbd {
  flex: none; min-width: 30px; padding: 2px 7px; text-align: center;
  border: 1px solid #4a4a6a; border-bottom-width: 3px; border-radius: 4px;
  background: #1c1c34; color: #dfe3ff; font: bold 12px monospace;
  white-space: nowrap;
}
#keymap .what { color: #aab; }
#keymap .hot { color: var(--gold, #ffd24d); }
#keymap .sect {
  grid-column: 1 / -1; margin-top: 10px; font-size: 11px;
  letter-spacing: 3px; color: #667;
}
#keymap .dismiss {
  margin-top: 18px; text-align: center; font-size: 12px; color: #667;
  letter-spacing: 2px;
}
`;

const ROWS = [
  ['MOVEMENT', null],
  ['W A S D', 'move'],
  ['Mouse', 'camera · click to lock pointer'],
  ['Space', 'jump / rise (in flight)'],
  ['Shift', 'dodge — vanish through attacks'],
  ['Tab', 'lock on to your nemesis'],
  ['COMBAT', null],
  ['J / LMB', 'light attack — chains ×3'],
  ['K hold', 'CHARGE heavy — release to strike. Full charge = BLAST: sends them flying'],
  ['J J K', 'combo route — rising uppercut launcher'],
  ['Q + K', 'dash headbutt — momentum into impact'],
  ['B / RMB', 'block · tap-release = parry'],
  ['L', 'special beam (full energy)'],
  ['SAIYAN', null],
  ['F', 'flight (awakens after First Blood)'],
  ['Q hold', 'ki dash toward your foe'],
  ['I hold', 'ki blast barrage'],
  ['C', 'descend in flight'],
];

export class KeymapOverlay {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.el = document.createElement('div');
    this.el.id = 'keymap';
    this.el.className = 'hidden';
    const rows = ROWS.map(([k, what]) => what == null
      ? `<div class="sect">${k}</div>`
      : `<div class="row"><kbd>${k}</kbd><span class="what${/CHARGE|BLAST/.test(what) ? ' hot' : ''}">${what}</span></div>`
    ).join('');
    this.el.innerHTML = `
      <div class="panel">
        <h1>HOW TO FIGHT</h1>
        <div class="grid">${rows}</div>
        <div class="dismiss">press H, Enter, or click to close — H reopens any time</div>
      </div>`;
    document.body.appendChild(this.el);
    this.visible = false;
    this.el.addEventListener('mousedown', () => this.hide());
    addEventListener('keydown', e => {
      if (this.visible && (e.code === 'Enter' || e.code === 'Escape')) this.hide();
    });
  }

  show() { this.visible = true; this.el.classList.remove('hidden'); }
  hide() { this.visible = false; this.el.classList.add('hidden'); }
  toggle() { this.visible ? this.hide() : this.show(); }
}
