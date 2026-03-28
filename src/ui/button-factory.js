/**
 * ButtonFactory — Factory pattern.
 * Generates accessible UI buttons from configuration objects.
 * Each button subscribes to WidgetState for active styling.
 */
function ButtonFactory(widgetState, onClose) {
  this.widgetState = widgetState;
  this.onClose = onClose;
}

ButtonFactory.prototype.create = function (config) {
  var btn = document.createElement('button');
  btn.className = 'a11y-widget-btn';
  btn.innerHTML = config.icon + '<span>' + t(config.label) + '</span>';
  btn.setAttribute('aria-label', t(config.label));

  if (config.type === 'toggle') {
    btn.setAttribute('aria-pressed', 'false');
  }

  var widgetState = this.widgetState;
  var onClose = this.onClose;

  btn.addEventListener('click', function () {
    if (config.key === 'close') {
      onClose();
      return;
    }
    if (config.key === 'cancelHighlights') {
      widgetState.state.highlightHeadings = false;
      widgetState.state.highlightLinks = false;
      widgetState.notify();
      return;
    }
    if (config.type === 'toggle') {
      if (VISUAL_GROUP.indexOf(config.key) !== -1 && !widgetState.get(config.key)) {
        deactivateSiblings(widgetState, config.key);
      }
      widgetState.toggle(config.key);
    } else if (config.type === 'action') {
      if (SizeStrategies[config.key]) {
        SizeStrategies[config.key](widgetState);
      }
    }
  });

  if (config.type === 'toggle') {
    widgetState.subscribe(function (state) {
      var active = state[config.key];
      if (active) {
        btn.classList.add('a11y-active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.classList.remove('a11y-active');
        btn.setAttribute('aria-pressed', 'false');
      }
    });
  }

  return btn;
};
