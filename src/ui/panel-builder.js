/**
 * PanelBuilder — Constructs the widget panel DOM.
 *
 * Creates:
 *   - Floating trigger button (wheelchair icon)
 *   - Panel with header (title + close), body (button grid), footer (reset + cancel)
 *   - Keyboard support (Escape to close)
 */
function PanelBuilder(widgetState) {
  this.widgetState = widgetState;
  this.panel = null;
  this.trigger = null;
  this.isOpen = false;
}

PanelBuilder.prototype.build = function () {
  var self = this;

  // Floating trigger
  this.trigger = document.createElement('button');
  this.trigger.className = 'a11y-widget-trigger';
  this.trigger.setAttribute('aria-label', t('openMenu'));
  this.trigger.innerHTML =
    Icons.wheelchair +
    '<span class="a11y-badge"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="#4A90D9" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>';
  this.trigger.addEventListener('click', function () {
    self.togglePanel();
  });

  // Panel container
  this.panel = document.createElement('div');
  this.panel.className = 'a11y-widget-container';
  this.panel.setAttribute('role', 'dialog');
  this.panel.setAttribute('aria-label', t('widgetTitle'));
  this.panel.setAttribute('aria-modal', 'true');

  // Header
  var header = document.createElement('div');
  header.className = 'a11y-widget-header';
  var title = document.createElement('h2');
  title.className = 'a11y-widget-title';
  title.textContent = t('widgetTitle');
  var closeBtn = document.createElement('button');
  closeBtn.className = 'a11y-widget-close';
  closeBtn.setAttribute('aria-label', t('close'));
  closeBtn.innerHTML = Icons.close;
  closeBtn.addEventListener('click', function () {
    self.togglePanel();
  });
  if (isRTL()) {
    header.appendChild(closeBtn);
    header.appendChild(title);
  } else {
    header.appendChild(title);
    header.appendChild(closeBtn);
  }

  // Body
  var body = document.createElement('div');
  body.className = 'a11y-widget-body';
  var grid = document.createElement('div');
  grid.className = 'a11y-widget-grid';
  var factory = new ButtonFactory(this.widgetState, function () {
    self.togglePanel();
  });
  BUTTON_CONFIGS.forEach(function (config) {
    grid.appendChild(factory.create(config));
  });
  body.appendChild(grid);

  // Footer
  var footer = document.createElement('div');
  footer.className = 'a11y-widget-footer';
  var resetBtn = document.createElement('button');
  resetBtn.className = 'a11y-widget-footer-btn a11y-reset';
  resetBtn.innerHTML = Icons.reset + '<span>' + t('reset') + '</span>';
  resetBtn.addEventListener('click', function () {
    self.widgetState.reset();
  });
  var cancelHLBtn = document.createElement('button');
  cancelHLBtn.className = 'a11y-widget-footer-btn a11y-cancel-hl';
  cancelHLBtn.innerHTML = Icons.cancelHighlights + '<span>' + t('cancelHighlights') + '</span>';
  cancelHLBtn.addEventListener('click', function () {
    self.widgetState.state.highlightHeadings = false;
    self.widgetState.state.highlightLinks = false;
    self.widgetState.notify();
  });
  footer.appendChild(resetBtn);
  footer.appendChild(cancelHLBtn);

  // Assemble
  this.panel.appendChild(header);
  this.panel.appendChild(body);
  this.panel.appendChild(footer);

  // Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && self.isOpen) {
      self.togglePanel();
    }
  });

  return { trigger: this.trigger, panel: this.panel };
};

PanelBuilder.prototype.togglePanel = function () {
  this.isOpen = !this.isOpen;
  if (this.isOpen) {
    this.panel.classList.add('a11y-open');
    this.trigger.style.display = 'none';
    var closeBtn = this.panel.querySelector('.a11y-widget-close');
    if (closeBtn) closeBtn.focus();
  } else {
    this.panel.classList.remove('a11y-open');
    this.trigger.style.display = 'flex';
    this.trigger.focus();
  }
};
