/**
 * AccessibilityStatement — Single Responsibility.
 *
 * Manages the accessibility statement modal dialog.
 * Opens/closes independently from the main widget panel.
 * Supports keyboard (Escape) and click-outside to close.
 */
function AccessibilityStatement() {
  this.overlay = null;
  this._escHandler = null;
}

AccessibilityStatement.prototype.open = function () {
  if (this.overlay) return;
  var self = this;

  this.overlay = document.createElement('div');
  this.overlay.className = 'a11y-statement-overlay';
  this.overlay.addEventListener('click', function (e) {
    if (e.target === self.overlay) self.close();
  });

  var modal = document.createElement('div');
  modal.className = 'a11y-statement-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-label', t('statementTitle'));
  modal.setAttribute('aria-modal', 'true');

  // Header
  var header = document.createElement('div');
  header.className = 'a11y-statement-header';

  var title = document.createElement('h3');
  title.textContent = t('statementTitle');

  var closeBtn = document.createElement('button');
  closeBtn.className = 'a11y-statement-close';
  closeBtn.setAttribute('aria-label', t('statementClose'));
  closeBtn.innerHTML = Icons.close;
  closeBtn.addEventListener('click', function () { self.close(); });

  if (isRTL()) {
    header.appendChild(closeBtn);
    header.appendChild(title);
  } else {
    header.appendChild(title);
    header.appendChild(closeBtn);
  }

  // Body
  var body = document.createElement('div');
  body.className = 'a11y-statement-body';
  body.textContent = t('statementBody');

  modal.appendChild(header);
  modal.appendChild(body);
  this.overlay.appendChild(modal);
  document.documentElement.appendChild(this.overlay);

  closeBtn.focus();

  // Escape to close
  this._escHandler = function (e) {
    if (e.key === 'Escape') {
      e.stopImmediatePropagation();
      self.close();
    }
  };
  document.addEventListener('keydown', this._escHandler);
};

AccessibilityStatement.prototype.close = function () {
  if (this.overlay && this.overlay.parentNode) {
    this.overlay.parentNode.removeChild(this.overlay);
  }
  this.overlay = null;
  if (this._escHandler) {
    document.removeEventListener('keydown', this._escHandler);
    this._escHandler = null;
  }
};
