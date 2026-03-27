/**
 * Abstract base scraper class implementing the Strategy pattern.
 * All scrapers must extend this and implement scrape() and parseLead().
 */
class BaseScraper {
  constructor(name) {
    if (new.target === BaseScraper) {
      throw new Error('Cannot instantiate abstract BaseScraper class directly.');
    }
    this.name = name;
  }

  /**
   * Scrape a source for leads matching the given keywords.
   * @param {string[]} keywords - Keywords to search for
   * @param {object} options - Scraper-specific options
   * @returns {Promise<object[]>} Array of raw data objects
   */
  async scrape(keywords, options) {
    throw new Error('Subclass must implement scrape()');
  }

  /**
   * Parse raw scraped data into a normalized lead object.
   * @param {object} rawData - Raw data from scraping
   * @returns {Promise<object>} Normalized lead object
   */
  async parseLead(rawData) {
    throw new Error('Subclass must implement parseLead()');
  }

  /**
   * Get the name of this scraper.
   * @returns {string}
   */
  getName() {
    return this.name;
  }
}

export default BaseScraper;
