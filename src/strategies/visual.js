/**
 * Visual Strategies — Strategy pattern implementations.
 *
 * Each strategy manipulates the page's visual appearance.
 * Filter-based strategies (monochrome, sepia, highContrast, invert) are
 * mutually exclusive — they all modify document.documentElement.style.filter.
 * blackYellow uses an injected <style> tag instead.
 */

// Mutual exclusion groups
var FILTER_GROUP = ['monochrome', 'sepia', 'highContrast', 'invert'];
var VISUAL_GROUP = FILTER_GROUP.concat(['blackYellow']);

function deactivateSiblings(widgetState, key) {
  if (VISUAL_GROUP.indexOf(key) === -1) return;
  VISUAL_GROUP.forEach(function (k) {
    if (k !== key) widgetState.state[k] = false;
  });
}

// Filters are applied to <body> so the widget (appended to <html>) is unaffected.
var VisualStrategies = {
  monochrome: {
    apply: function () {
      document.body.style.filter = 'grayscale(100%)';
    },
    remove: function () {
      document.body.style.filter = '';
    },
  },
  sepia: {
    apply: function () {
      document.body.style.filter = 'sepia(100%)';
    },
    remove: function () {
      document.body.style.filter = '';
    },
  },
  highContrast: {
    apply: function () {
      document.body.style.filter = 'contrast(150%)';
    },
    remove: function () {
      document.body.style.filter = '';
    },
  },
  invert: {
    apply: function () {
      document.body.style.filter = 'invert(100%)';
    },
    remove: function () {
      document.body.style.filter = '';
    },
  },
  blackYellow: {
    apply: function () {
      injectStyle(
        'a11y-black-yellow',
        'html *:not(.a11y-widget-container):not(.a11y-widget-container *):not(.a11y-widget-trigger):not(.a11y-widget-trigger *) ' +
        '{ background-color: #000 !important; color: #ff0 !important; border-color: #ff0 !important; }' +
        '.a11y-widget-container .a11y-widget-btn { background: #f5f5f5 !important; color: #333 !important; }' +
        '.a11y-widget-container .a11y-widget-btn.a11y-active { background: #4A90D9 !important; color: #fff !important; }' +
        '.a11y-widget-container .a11y-widget-header { background: #16213e !important; }' +
        '.a11y-widget-container .a11y-widget-title { color: #fff !important; }' +
        '.a11y-widget-container .a11y-widget-body { color: #e0e0e0 !important; }' +
        '.a11y-widget-container .a11y-widget-footer-btn { background: #2c3e50 !important; color: #fff !important; }' +
        '.a11y-widget-container .a11y-widget-close { color: #e74c3c !important; border-color: #e74c3c !important; background: transparent !important; }'
      );
    },
    remove: function () {
      removeStyle('a11y-black-yellow');
    },
  },
};
