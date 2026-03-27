import RedditScraper from './RedditScraper.js';
import WebScraper from './WebScraper.js';

/**
 * Factory pattern for creating scraper instances.
 * New scrapers can be registered without modifying existing code (Open/Closed Principle).
 */
class ScraperFactory {
  constructor() {
    this._registry = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.register('reddit', () => new RedditScraper());
    this.register('web', () => new WebScraper());
  }

  /**
   * Register a new scraper type.
   * @param {string} name - Platform name
   * @param {Function} creator - Factory function returning a BaseScraper instance
   */
  register(name, creator) {
    this._registry.set(name.toLowerCase(), creator);
  }

  /**
   * Create a scraper instance by platform name.
   * @param {string} platform - Platform name (e.g., 'reddit', 'web')
   * @returns {BaseScraper}
   */
  create(platform) {
    const creator = this._registry.get(platform.toLowerCase());
    if (!creator) {
      throw new Error(`No scraper registered for platform: ${platform}`);
    }
    return creator();
  }

  /**
   * Create all registered scrapers.
   * @returns {BaseScraper[]}
   */
  createAll() {
    return Array.from(this._registry.values()).map(creator => creator());
  }

  /**
   * Get list of available platform names.
   * @returns {string[]}
   */
  getAvailablePlatforms() {
    return Array.from(this._registry.keys());
  }
}

const scraperFactory = new ScraperFactory();
export default scraperFactory;
