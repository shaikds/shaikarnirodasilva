// Tutorial + escape prompts (M1): prominent center-screen guidance.

const CSS = `
#prompts .main {
  font: bold 26px 'Courier New', monospace; color: #fff;
  letter-spacing: 3px; text-shadow: 0 0 18px rgba(77,184,255,0.9);
  animation: promptPulse 1.6s ease-in-out infinite;
}
#prompts .sub {
  font: 14px 'Courier New', monospace; color: #8a8aa5;
  letter-spacing: 2px; margin-top: 8px;
}
#prompts.urgent .main { color: #ffd24d; text-shadow: 0 0 22px rgba(255,77,106,0.95); }
@keyframes promptPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
@media (prefers-reduced-motion: reduce) {
  #prompts .main { animation: none; }
}
`;

export class Prompts {
  constructor() {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.getElementById('prompts');
    this.root.innerHTML = `<div class="main"></div><div class="sub"></div>`;
    this.mainEl = this.root.querySelector('.main');
    this.subEl = this.root.querySelector('.sub');
    this.hide();
  }

  show(main, sub = '', urgent = false) {
    this.mainEl.textContent = main;
    this.subEl.textContent = sub;
    this.root.classList.toggle('urgent', urgent);
    this.root.style.display = 'block';
    this.current = main;
  }

  hide() {
    this.root.style.display = 'none';
    this.current = null;
  }
}
