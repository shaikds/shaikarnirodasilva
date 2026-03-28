/**
 * Size Strategies — action-based (not toggle).
 *
 * Each click increments/decrements a numeric value
 * clamped within bounds. The orchestrator applies the
 * actual DOM changes via applyFontSize() and applyZoom().
 */
var SizeStrategies = {
  fontIncrease: function (widgetState) {
    var delta = widgetState.get('fontSizeDelta');
    if (delta < 16) {
      widgetState.set('fontSizeDelta', delta + 2);
    }
  },
  fontDecrease: function (widgetState) {
    var delta = widgetState.get('fontSizeDelta');
    if (delta > -8) {
      widgetState.set('fontSizeDelta', delta - 2);
    }
  },
  zoomIn: function (widgetState) {
    var level = widgetState.get('zoomLevel');
    if (level < 2.0) {
      widgetState.set('zoomLevel', Math.round((level + 0.1) * 10) / 10);
    }
  },
  zoomOut: function (widgetState) {
    var level = widgetState.get('zoomLevel');
    if (level > 0.5) {
      widgetState.set('zoomLevel', Math.round((level - 0.1) * 10) / 10);
    }
  },
};

function applyFontSize(delta) {
  if (delta === 0) {
    document.documentElement.style.fontSize = '';
  } else {
    document.documentElement.style.fontSize = 16 + delta + 'px';
  }
}

function applyZoom(level) {
  if (level === 1) {
    document.body.style.transform = '';
    document.body.style.transformOrigin = '';
    document.body.style.width = '';
  } else {
    document.body.style.transform = 'scale(' + level + ')';
    document.body.style.transformOrigin = 'top left';
    document.body.style.width = 100 / level + '%';
  }
}
