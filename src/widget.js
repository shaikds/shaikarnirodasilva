/**
 * Widget Orchestrator — wires all components together.
 *
 * 1. Loads saved state from StorageManager
 * 2. Creates WidgetState (Observer)
 * 3. Builds UI via PanelBuilder (which uses ButtonFactory)
 * 4. Subscribes to state changes to apply/remove strategies
 * 5. Injects CSS and appends to DOM
 * 6. Restores saved state
 */
function Widget() {
  var saved = StorageManager.load();
  this.widgetState = new WidgetState(saved);

  var panelBuilder = new PanelBuilder(this.widgetState);
  var elements = panelBuilder.build();

  // Inject CSS
  var styleEl = document.createElement('style');
  styleEl.id = 'a11y-widget-styles';
  styleEl.textContent = getWidgetCSS();
  document.head.appendChild(styleEl);

  // Append to <html> (not <body>) so filter strategies on <body> don't affect widget
  document.documentElement.appendChild(elements.trigger);
  document.documentElement.appendChild(elements.panel);

  // Subscribe: apply/remove strategies on state change
  var widgetState = this.widgetState;
  widgetState.subscribe(function (state) {
    // Clear body filter first, then let the active filter re-apply
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

    // Apply the single active filter strategy last
    if (activeFilterKey) {
      StrategyRegistry[activeFilterKey].apply();
    }

    applyFontSize(state.fontSizeDelta);
    applyZoom(state.zoomLevel);
  });

  // Restore saved state
  if (saved) {
    widgetState.notify();
  }
}

// Init
function init() {
  new Widget();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
