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

var VisualStrategies = {
  monochrome: {
    apply: function () {
      document.documentElement.style.filter = 'grayscale(100%)';
    },
    remove: function () {
      document.documentElement.style.filter = '';
    },
  },
  sepia: {
    apply: function () {
      document.documentElement.style.filter = 'sepia(100%)';
    },
    remove: function () {
      document.documentElement.style.filter = '';
    },
  },
  highContrast: {
    apply: function () {
      document.documentElement.style.filter = 'contrast(150%)';
    },
    remove: function () {
      document.documentElement.style.filter = '';
    },
  },
  invert: {
    apply: function () {
      document.documentElement.style.filter = 'invert(100%)';
    },
    remove: function () {
      document.documentElement.style.filter = '';
    },
  },
  blackYellow: {
    apply: function () {
      injectStyle(
        'a11y-black-yellow',
        'html *:not(.a11y-widget-container):not(.a11y-widget-container *) { background-color: #000 !important; color: #ff0 !important; border-color: #ff0 !important; }'
      );
    },
    remove: function () {
      removeStyle('a11y-black-yellow');
    },
  },
};
