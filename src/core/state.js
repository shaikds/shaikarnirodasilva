/**
 * WidgetState — Observer pattern for central state management.
 *
 * Tracks which accessibility features are active.
 * Subscribers (UI buttons, strategy appliers) react to state changes.
 * Persists to localStorage on every mutation.
 */
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
