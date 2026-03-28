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

  // Append to DOM
  document.body.appendChild(elements.trigger);
  document.body.appendChild(elements.panel);

  // Subscribe: apply/remove strategies on state change
  var widgetState = this.widgetState;
  widgetState.subscribe(function (state) {
    Object.keys(StrategyRegistry).forEach(function (key) {
      if (state[key]) {
        StrategyRegistry[key].apply();
      } else {
        StrategyRegistry[key].remove();
      }
    });

    var anyFilterActive = FILTER_GROUP.some(function (k) {
      return state[k];
    });
    if (!anyFilterActive) {
      document.documentElement.style.filter = '';
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
