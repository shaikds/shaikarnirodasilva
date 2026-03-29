/**
 * Content Strategies — Strategy pattern implementations.
 *
 * highlightHeadings: outlines all h1-h6 elements
 * highlightLinks: outlines all <a> elements
 * imageAlt: overlays alt-text divs on images
 * readableFont: switches to dyslexia-friendly font
 */
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
