/**
 * Widget Orchestrator — wires all components together.
 *
 * 1. Initializes LanguageManager
 * 2. Loads saved state from StorageManager
 * 3. Creates WidgetState (Observer)
 * 4. Builds UI via PanelBuilder (which uses ButtonFactory + AccessibilityStatement)
 * 5. Subscribes to state changes to apply/remove strategies
 * 6. Listens for language changes and rebuilds UI
 */
function Widget() {
  var self = this;

  var saved = StorageManager.load();
  this.widgetState = new WidgetState(saved);
  this._elements = null;
  this._panelBuilder = null;

  this._buildUI();
  this._subscribeStrategies();

  if (saved) {
    this.widgetState.notify();
  }

  // On language change: rebuild UI while preserving state + open/close
  LanguageManager.onChange(function () {
    var wasOpen = self._panelBuilder && self._panelBuilder.isOpen;
    self._destroyUI();
    self._buildUI();
    self.widgetState.notify();
    if (wasOpen) {
      self._panelBuilder.togglePanel();
    }
  });
}

Widget.prototype._buildUI = function () {
  this._panelBuilder = new PanelBuilder(this.widgetState);
  this._elements = this._panelBuilder.build();

  var existingStyle = document.getElementById('a11y-widget-styles');
  if (existingStyle) existingStyle.parentNode.removeChild(existingStyle);
  var styleEl = document.createElement('style');
  styleEl.id = 'a11y-widget-styles';
  styleEl.textContent = getWidgetCSS();
  document.head.appendChild(styleEl);

  document.documentElement.appendChild(this._elements.trigger);
  document.documentElement.appendChild(this._elements.panel);
};

Widget.prototype._destroyUI = function () {
  if (this._panelBuilder) {
    this._panelBuilder.destroy();
  }
  if (this._elements) {
    if (this._elements.trigger.parentNode) this._elements.trigger.parentNode.removeChild(this._elements.trigger);
    if (this._elements.panel.parentNode) this._elements.panel.parentNode.removeChild(this._elements.panel);
    this._elements = null;
  }
  this.widgetState.clearUIListeners();
};

Widget.prototype._subscribeStrategies = function () {
  var widgetState = this.widgetState;
  var handler = function (state) {
    document.body.style.filter = '';

    var activeFilterKey = null;
    Object.keys(StrategyRegistry).forEach(function (key) {
      var strategy = StrategyRegistry[key];
      if (state[key]) {
        if (FILTER_GROUP.indexOf(key) !== -1) {
          activeFilterKey = key;
        } else {
          strategy.apply();
        }
      } else {
        strategy.remove();
      }
    });

    if (activeFilterKey) {
      StrategyRegistry[activeFilterKey].apply();
    }

    applyFontSize(state.fontSizeDelta);
    applyZoom(state.zoomLevel);
  };
  handler._isStrategy = true;
  widgetState.subscribe(handler);
};

// Init
function init() {
  LanguageManager.init();
  new Widget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
