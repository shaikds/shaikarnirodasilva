/**
 * Accessibility Widget — Drop-in, self-contained, unbranded.
 * Usage: <script src="accessibility-widget.js"></script>
 *
 * Design Patterns:
 *   - Module (IIFE): zero global pollution
 *   - Observer: WidgetState with subscribe/notify
 *   - Strategy: each feature has apply()/remove()
 *   - Factory: ButtonFactory generates UI from config
 */
(function () {
  'use strict';

  // ========================================================
  // SECTION: Translations (i18n)
  // ========================================================
  const Translations = {
    he: {
      widgetTitle: 'הגדרות נגישות',
      close: 'סגירה',
      reset: 'איפוס הגדרות',
      cancelHighlights: 'ביטול הנהובים',
      monochrome: 'מונוכרום',
      sepia: 'ספיה',
      highContrast: 'ניגודיות גבוהה',
      blackYellow: 'שחור צהוב',
      invert: 'היפוך צבעים',
      highlightHeadings: 'הדגשת כותרות',
      highlightLinks: 'הדגשת קישורים',
      imageAlt: 'תיאור קבוע',
      readableFont: 'גופן קריא',
      fontIncrease: 'הגדלת גופן',
      fontDecrease: 'הקטנת גופן',
      zoomIn: 'הגדלת מסך',
      zoomOut: 'הקטנת מסך',
      openMenu: 'פתח תפריט נגישות',
    },
    en: {
      widgetTitle: 'Accessibility Settings',
      close: 'Close',
      reset: 'Reset Settings',
      cancelHighlights: 'Cancel Highlights',
      monochrome: 'Monochrome',
      sepia: 'Sepia',
      highContrast: 'High Contrast',
      blackYellow: 'Black & Yellow',
      invert: 'Invert Colors',
      highlightHeadings: 'Highlight Headings',
      highlightLinks: 'Highlight Links',
      imageAlt: 'Image Descriptions',
      readableFont: 'Readable Font',
      fontIncrease: 'Increase Font',
      fontDecrease: 'Decrease Font',
      zoomIn: 'Zoom In',
      zoomOut: 'Zoom Out',
      openMenu: 'Open accessibility menu',
    },
  };

  function detectLanguage() {
    var lang = document.documentElement.lang || 'he';
    return lang.startsWith('en') ? 'en' : 'he';
  }

  function t(key) {
    var lang = detectLanguage();
    return (Translations[lang] && Translations[lang][key]) || Translations.he[key] || key;
  }

  function isRTL() {
    return detectLanguage() === 'he';
  }

  // ========================================================
  // SECTION: StorageManager
  // ========================================================
  var StorageManager = {
    STORAGE_KEY: 'a11y-widget-state',

    save: function (state) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        // Storage blocked or full — silently ignore
      }
    },

    load: function () {
      try {
        var data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        return null;
      }
    },

  };

  // ========================================================
  // SECTION: WidgetState (Observer Pattern)
  // ========================================================
  function WidgetState(initialState) {
    this.state = Object.assign(
      {
        monochrome: false,
        sepia: false,
        highContrast: false,
        blackYellow: false,
        invert: false,
        highlightHeadings: false,
        highlightLinks: false,
        imageAlt: false,
        readableFont: false,
        fontSizeDelta: 0,
        zoomLevel: 1,
      },
      initialState || {}
    );
    this.listeners = [];
  }

  WidgetState.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
  };

  WidgetState.prototype.notify = function () {
    var state = this.state;
    this.listeners.forEach(function (fn) {
      fn(state);
    });
    StorageManager.save(state);
  };

  WidgetState.prototype.get = function (key) {
    return this.state[key];
  };

  WidgetState.prototype.set = function (key, value) {
    this.state[key] = value;
    this.notify();
  };

  WidgetState.prototype.toggle = function (key) {
    this.state[key] = !this.state[key];
    this.notify();
  };

  WidgetState.prototype.reset = function () {
    this.state = {
      monochrome: false,
      sepia: false,
      highContrast: false,
      blackYellow: false,
      invert: false,
      highlightHeadings: false,
      highlightLinks: false,
      imageAlt: false,
      readableFont: false,
      fontSizeDelta: 0,
      zoomLevel: 1,
    };
    this.notify();
  };

  // ========================================================
  // SECTION: Filter Group (mutual exclusion)
  // ========================================================
  var FILTER_GROUP = ['monochrome', 'sepia', 'highContrast', 'invert'];
  var VISUAL_GROUP = FILTER_GROUP.concat(['blackYellow']);

  function deactivateSiblings(widgetState, key) {
    if (VISUAL_GROUP.indexOf(key) === -1) return;
    VISUAL_GROUP.forEach(function (k) {
      if (k !== key) widgetState.state[k] = false;
    });
  }

  // ========================================================
  // SECTION: Feature Strategies (Strategy Pattern)
  // ========================================================

  // --- Helper: inject/remove a <style> by ID ---
  function injectStyle(id, css) {
    removeStyle(id);
    var el = document.createElement('style');
    el.id = id;
    el.textContent = css;
    document.head.appendChild(el);
  }

  function removeStyle(id) {
    var el = document.getElementById(id);
    if (el) el.parentNode.removeChild(el);
  }

  // --- Visual Strategies ---
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

  // --- Content Strategies ---
  var ContentStrategies = {
    highlightHeadings: {
      apply: function () {
        injectStyle(
          'a11y-highlight-headings',
          'h1, h2, h3, h4, h5, h6 ' +
          '{ outline: 3px solid #f39c12 !important; background-color: rgba(243,156,18,0.15) !important; padding: 4px !important; }' +
          '.a11y-widget-container h1, .a11y-widget-container h2, .a11y-widget-container h3, ' +
          '.a11y-widget-container h4, .a11y-widget-container h5, .a11y-widget-container h6 ' +
          '{ outline: none !important; background-color: transparent !important; padding: 0 !important; }'
        );
      },
      remove: function () {
        removeStyle('a11y-highlight-headings');
      },
    },
    highlightLinks: {
      apply: function () {
        injectStyle(
          'a11y-highlight-links',
          'a:not(.a11y-widget-container a) { outline: 3px solid #3498db !important; background-color: rgba(52,152,219,0.15) !important; text-decoration: underline !important; padding: 2px !important; }'
        );
      },
      remove: function () {
        removeStyle('a11y-highlight-links');
      },
    },
    imageAlt: {
      _overlays: [],
      apply: function () {
        this.remove();
        var self = this;
        var images = document.querySelectorAll('img[alt]:not(.a11y-widget-container img)');
        images.forEach(function (img) {
          var alt = img.getAttribute('alt');
          if (!alt || !alt.trim()) return;
          var wrapper = img.parentElement;
          if (!wrapper) return;
          var prevPosition = wrapper.style.position;
          if (getComputedStyle(wrapper).position === 'static') {
            wrapper.style.position = 'relative';
          }
          var overlay = document.createElement('div');
          overlay.className = 'a11y-img-alt-overlay';
          overlay.textContent = alt;
          overlay.style.cssText =
            'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.85);color:#fff;' +
            'padding:6px 8px;font-size:13px;line-height:1.4;z-index:999998;pointer-events:none;' +
            'font-family:Arial,sans-serif;word-wrap:break-word;max-height:50%;overflow-y:auto;';
          wrapper.appendChild(overlay);
          self._overlays.push({ wrapper: wrapper, overlay: overlay, prevPosition: prevPosition });
        });
      },
      remove: function () {
        this._overlays.forEach(function (item) {
          if (item.overlay.parentNode) item.overlay.parentNode.removeChild(item.overlay);
          if (item.prevPosition !== undefined) item.wrapper.style.position = item.prevPosition;
        });
        this._overlays = [];
      },
    },
    readableFont: {
      apply: function () {
        injectStyle(
          'a11y-readable-font',
          'html *:not(.a11y-widget-container):not(.a11y-widget-container *):not(.a11y-widget-trigger):not(.a11y-widget-trigger *) ' +
          '{ font-family: "Comic Sans MS", "OpenDyslexic", cursive, sans-serif !important; }'
        );
      },
      remove: function () {
        removeStyle('a11y-readable-font');
      },
    },
  };

  // --- Size Strategies ---
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
      var base = 16;
      document.documentElement.style.fontSize = base + delta + 'px';
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

  // ========================================================
  // SECTION: Strategy Registry
  // ========================================================
  var StrategyRegistry = {};
  Object.keys(VisualStrategies).forEach(function (k) {
    StrategyRegistry[k] = VisualStrategies[k];
  });
  Object.keys(ContentStrategies).forEach(function (k) {
    StrategyRegistry[k] = ContentStrategies[k];
  });

  // ========================================================
  // SECTION: SVG Icons
  // ========================================================
  var Icons = {
    wheelchair:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32"><path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-1 8c-1.1 0-2 .9-2 2v4h2v5h2v-5h2v-4c0-1.1-.9-2-2-2h-2zm-4 8a4 4 0 0 0 3.5 3.97v-2.03A2 2 0 0 1 9 18H7zm10 0h-2a2 2 0 0 1-1.5 1.94v2.03A4 4 0 0 0 17 18z"/></svg>',
    close:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    monochrome:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><circle cx="12" cy="12" r="10"/></svg>',
    sepia:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><path d="M4 4h16v16H4z"/><path d="M4 4l16 16M20 4L4 20"/></svg>',
    contrast:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V4c4.41 0 8 3.59 8 8s-3.59 8-8 8z"/></svg>',
    blackYellow:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18"/></svg>',
    invertColors:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8v16z"/></svg>',
    heading:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><text x="4" y="18" font-size="16" font-weight="bold" font-family="Arial">H</text></svg>',
    link:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    imageDesc:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>',
    font:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><text x="5" y="18" font-size="16" font-weight="bold" font-family="Arial">A</text></svg>',
    fontIncrease:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><text x="2" y="18" font-size="14" font-weight="bold" font-family="Arial">A</text><text x="14" y="12" font-size="14" font-family="Arial">+</text></svg>',
    fontDecrease:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><text x="2" y="18" font-size="14" font-weight="bold" font-family="Arial">A</text><text x="14" y="12" font-size="14" font-family="Arial">−</text></svg>',
    zoomIn:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/></svg>',
    zoomOut:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12h8"/></svg>',
    reset:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
    cancelHighlights:
      '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>',
  };

  // ========================================================
  // SECTION: CSS Styles
  // ========================================================
  function getWidgetCSS() {
    return (
      '.a11y-widget-trigger{' +
      'position:fixed;bottom:20px;' +
      (isRTL() ? 'left:20px;' : 'right:20px;') +
      'z-index:999999;width:56px;height:56px;border-radius:50%;border:none;' +
      'background:#4A90D9;color:#fff;cursor:pointer;display:flex;align-items:center;' +
      'justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);transition:transform 0.2s,background 0.2s;' +
      'padding:0;outline:none;' +
      '}' +
      '.a11y-widget-trigger:hover{transform:scale(1.1);background:#3a7bc8;}' +
      '.a11y-widget-trigger:focus-visible{box-shadow:0 0 0 3px #fff,0 0 0 6px #4A90D9;}' +
      '.a11y-widget-trigger .a11y-badge{' +
      'position:absolute;top:-2px;' +
      (isRTL() ? 'right:-2px;' : 'left:-2px;') +
      'width:20px;height:20px;background:#fff;border-radius:50%;display:flex;' +
      'align-items:center;justify-content:center;' +
      '}' +
      '.a11y-widget-trigger .a11y-badge svg{width:14px;height:14px;fill:#4A90D9;}' +
      '.a11y-widget-container{' +
      'position:fixed;bottom:20px;' +
      (isRTL() ? 'left:20px;' : 'right:20px;') +
      'z-index:1000000;width:340px;max-height:calc(100vh - 40px);' +
      'background:#1a1a2e;color:#e0e0e0;border-radius:16px;' +
      'box-shadow:0 8px 32px rgba(0,0,0,0.4);overflow:hidden;' +
      'transform:scale(0);opacity:0;transform-origin:bottom ' + (isRTL() ? 'left' : 'right') + ';' +
      'transition:transform 0.3s cubic-bezier(0.4,0,0.2,1),opacity 0.3s ease;' +
      'font-family:Arial,Helvetica,sans-serif;direction:' + (isRTL() ? 'rtl' : 'ltr') + ';' +
      '}' +
      '.a11y-widget-container.a11y-open{transform:scale(1);opacity:1;}' +
      '.a11y-widget-header{' +
      'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;' +
      'background:#16213e;border-bottom:1px solid #0f3460;' +
      '}' +
      '.a11y-widget-title{font-size:16px;font-weight:700;margin:0;color:#fff;}' +
      '.a11y-widget-close{' +
      'background:none;border:2px solid #e74c3c;border-radius:50%;width:32px;height:32px;' +
      'color:#e74c3c;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'padding:0;transition:background 0.2s;outline:none;' +
      '}' +
      '.a11y-widget-close:hover{background:#e74c3c;color:#fff;}' +
      '.a11y-widget-close:focus-visible{box-shadow:0 0 0 3px rgba(231,76,60,0.5);}' +
      '.a11y-widget-body{padding:12px;overflow-y:auto;max-height:calc(100vh - 160px);}' +
      '.a11y-widget-grid{' +
      'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;' +
      '}' +
      '.a11y-widget-btn{' +
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      'gap:6px;padding:12px 4px;border-radius:10px;border:2px solid transparent;' +
      'background:#f5f5f5;color:#333;cursor:pointer;transition:all 0.2s;' +
      'font-size:12px;font-weight:600;text-align:center;min-height:72px;outline:none;' +
      'font-family:Arial,Helvetica,sans-serif;' +
      '}' +
      '.a11y-widget-btn:hover{background:#e8e8e8;border-color:#4A90D9;}' +
      '.a11y-widget-btn:focus-visible{box-shadow:0 0 0 3px rgba(74,144,217,0.5);}' +
      '.a11y-widget-btn.a11y-active{background:#4A90D9;color:#fff;border-color:#3a7bc8;}' +
      '.a11y-widget-btn svg{width:24px;height:24px;flex-shrink:0;}' +
      '.a11y-widget-btn.a11y-active svg{fill:#fff;stroke:#fff;color:#fff;}' +
      '.a11y-widget-btn.a11y-btn-close{border:2px solid #e74c3c;background:#fff;}' +
      '.a11y-widget-btn.a11y-btn-close:hover{background:#e74c3c;color:#fff;}' +
      '.a11y-widget-btn.a11y-btn-close svg{fill:#e74c3c;color:#e74c3c;}' +
      '.a11y-widget-btn.a11y-btn-close:hover svg{fill:#fff;color:#fff;}' +
      '.a11y-widget-footer{' +
      'display:flex;gap:8px;padding:12px 12px 16px;border-top:1px solid #0f3460;' +
      '}' +
      '.a11y-widget-footer-btn{' +
      'flex:1;display:flex;align-items:center;justify-content:center;gap:6px;' +
      'padding:10px 8px;border-radius:8px;border:none;cursor:pointer;' +
      'font-size:12px;font-weight:600;transition:background 0.2s;outline:none;' +
      'font-family:Arial,Helvetica,sans-serif;' +
      '}' +
      '.a11y-widget-footer-btn.a11y-reset{background:#2c3e50;color:#fff;}' +
      '.a11y-widget-footer-btn.a11y-reset:hover{background:#34495e;}' +
      '.a11y-widget-footer-btn.a11y-cancel-hl{background:#2c3e50;color:#fff;}' +
      '.a11y-widget-footer-btn.a11y-cancel-hl:hover{background:#34495e;}' +
      '.a11y-widget-footer-btn:focus-visible{box-shadow:0 0 0 3px rgba(74,144,217,0.5);}' +
      '@media(max-width:480px){' +
      '.a11y-widget-container{width:calc(100vw - 24px);' +
      (isRTL() ? 'left:12px;' : 'right:12px;') +
      'bottom:12px;border-radius:12px;}' +
      '.a11y-widget-grid{grid-template-columns:repeat(2,1fr);}' +
      '.a11y-widget-trigger{bottom:12px;' + (isRTL() ? 'left:12px;' : 'right:12px;') + 'width:48px;height:48px;}' +
      '}'
    );
  }

  // ========================================================
  // SECTION: Button Configurations
  // ========================================================
  var BUTTON_CONFIGS = [
    // Row 1 — Visual
    { key: 'close', label: 'close', icon: Icons.close, type: 'control' },
    { key: 'cancelHighlights', label: 'cancelHighlights', icon: Icons.cancelHighlights, type: 'action' },
    { key: 'monochrome', label: 'monochrome', icon: Icons.monochrome, type: 'toggle' },
    // Row 2
    { key: 'sepia', label: 'sepia', icon: Icons.sepia, type: 'toggle' },
    { key: 'highContrast', label: 'highContrast', icon: Icons.contrast, type: 'toggle' },
    { key: 'blackYellow', label: 'blackYellow', icon: Icons.blackYellow, type: 'toggle' },
    // Row 3
    { key: 'invert', label: 'invert', icon: Icons.invertColors, type: 'toggle' },
    { key: 'highlightHeadings', label: 'highlightHeadings', icon: Icons.heading, type: 'toggle' },
    { key: 'highlightLinks', label: 'highlightLinks', icon: Icons.link, type: 'toggle' },
    // Row 4
    { key: 'imageAlt', label: 'imageAlt', icon: Icons.imageDesc, type: 'toggle' },
    { key: 'readableFont', label: 'readableFont', icon: Icons.font, type: 'toggle' },
    { key: 'fontIncrease', label: 'fontIncrease', icon: Icons.fontIncrease, type: 'action' },
    // Row 5
    { key: 'fontDecrease', label: 'fontDecrease', icon: Icons.fontDecrease, type: 'action' },
    { key: 'zoomIn', label: 'zoomIn', icon: Icons.zoomIn, type: 'action' },
    { key: 'zoomOut', label: 'zoomOut', icon: Icons.zoomOut, type: 'action' },
  ];

  // ========================================================
  // SECTION: ButtonFactory (Factory Pattern)
  // ========================================================
  function ButtonFactory(widgetState, onClose) {
    this.widgetState = widgetState;
    this.onClose = onClose;
  }

  ButtonFactory.prototype.create = function (config) {
    var btn = document.createElement('button');
    btn.className = 'a11y-widget-btn' + (config.key === 'close' ? ' a11y-btn-close' : '');
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
        // Handle mutual exclusion for visual group
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

    // Subscribe to state changes for toggle buttons
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

  // ========================================================
  // SECTION: PanelBuilder
  // ========================================================
  function PanelBuilder(widgetState) {
    this.widgetState = widgetState;
    this.panel = null;
    this.trigger = null;
    this.isOpen = false;
  }

  PanelBuilder.prototype.build = function () {
    var self = this;

    // --- Floating trigger button ---
    this.trigger = document.createElement('button');
    this.trigger.className = 'a11y-widget-trigger';
    this.trigger.setAttribute('aria-label', t('openMenu'));
    this.trigger.innerHTML =
      Icons.wheelchair +
      '<span class="a11y-badge"><svg viewBox="0 0 24 24" width="14" height="14"><path fill="#4A90D9" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></span>';

    this.trigger.addEventListener('click', function () {
      self.togglePanel();
    });

    // --- Panel container ---
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

    // Body with button grid
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
    resetBtn.setAttribute('aria-label', t('reset'));
    resetBtn.addEventListener('click', function () {
      self.widgetState.reset();
    });

    var cancelHLBtn = document.createElement('button');
    cancelHLBtn.className = 'a11y-widget-footer-btn a11y-cancel-hl';
    cancelHLBtn.innerHTML = Icons.cancelHighlights + '<span>' + t('cancelHighlights') + '</span>';
    cancelHLBtn.setAttribute('aria-label', t('cancelHighlights'));
    cancelHLBtn.addEventListener('click', function () {
      self.widgetState.state.highlightHeadings = false;
      self.widgetState.state.highlightLinks = false;
      self.widgetState.notify();
    });

    footer.appendChild(resetBtn);
    footer.appendChild(cancelHLBtn);

    // Assemble panel
    this.panel.appendChild(header);
    this.panel.appendChild(body);
    this.panel.appendChild(footer);

    // Keyboard support: Escape to close + focus trap
    document.addEventListener('keydown', function (e) {
      if (!self.isOpen) return;
      if (e.key === 'Escape') {
        self.togglePanel();
        return;
      }
      // Focus trap within the panel
      if (e.key === 'Tab') {
        var focusable = self.panel.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
        if (focusable.length === 0) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
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

  // ========================================================
  // SECTION: Widget Orchestrator
  // ========================================================
  function Widget() {
    // Load saved state
    var saved = StorageManager.load();
    this.widgetState = new WidgetState(saved);

    // Build UI
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

    // Subscribe to state changes — apply/remove strategies
    var widgetState = this.widgetState;
    widgetState.subscribe(function (state) {
      // First: clear the filter property, then let the active filter re-apply
      document.body.style.filter = '';

      // Apply/remove all strategies
      var activeFilterKey = null;
      Object.keys(StrategyRegistry).forEach(function (key) {
        var strategy = StrategyRegistry[key];
        if (state[key]) {
          // Defer filter strategies — apply the active one last
          if (FILTER_GROUP.indexOf(key) !== -1) {
            activeFilterKey = key;
          } else {
            strategy.apply();
          }
        } else {
          strategy.remove();
        }
      });

      // Apply the single active filter strategy last (avoids order issues)
      if (activeFilterKey) {
        StrategyRegistry[activeFilterKey].apply();
      }

      // Apply size settings
      applyFontSize(state.fontSizeDelta);
      applyZoom(state.zoomLevel);
    });

    // Apply saved state on load
    if (saved) {
      widgetState.notify();
    }
  }

  // ========================================================
  // SECTION: Init
  // ========================================================
  function init() {
    new Widget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
