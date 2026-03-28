/**
 * StorageManager — localStorage persistence wrapper.
 * Handles environments where storage is blocked.
 */
var StorageManager = {
  STORAGE_KEY: 'a11y-widget-state',

  save: function (state) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Storage blocked or full
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

  clear: function () {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      // Silently ignore
    }
  },
};
