/**
 * LanguageManager — Single Responsibility.
 *
 * Manages the widget's current language (he/en).
 * Persists choice to localStorage.
 * Provides t() for translation and isRTL() for direction.
 * Supports onChange listeners for live language switching.
 */
var LanguageManager = {
  _lang: null,
  _listeners: [],
  STORAGE_KEY: 'a11y-widget-lang',

  init: function () {
    try {
      this._lang = localStorage.getItem(this.STORAGE_KEY);
    } catch (e) { /* ignore */ }
    if (!this._lang) {
      var pageLang = document.documentElement.lang || 'he';
      this._lang = pageLang.startsWith('en') ? 'en' : 'he';
    }
  },

  getLang: function () {
    return this._lang || 'he';
  },

  isRTL: function () {
    return this.getLang() === 'he';
  },

  t: function (key) {
    var lang = this.getLang();
    return (Translations[lang] && Translations[lang][key]) || Translations.he[key] || key;
  },

  toggle: function () {
    this._lang = this._lang === 'he' ? 'en' : 'he';
    try {
      localStorage.setItem(this.STORAGE_KEY, this._lang);
    } catch (e) { /* ignore */ }
    var lang = this._lang;
    this._listeners.forEach(function (fn) { fn(lang); });
  },

  onChange: function (fn) {
    this._listeners.push(fn);
  },
};

// Convenience shortcuts
function t(key) { return LanguageManager.t(key); }
function isRTL() { return LanguageManager.isRTL(); }
