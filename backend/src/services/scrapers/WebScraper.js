import BaseScraper from './BaseScraper.js';
import logger from '../../utils/logger.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; AICustomerDiscovery/1.0)';
const REQUEST_DELAY_MS = 2000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generic web scraper that searches via public search-like endpoints.
 * Uses Hacker News Algolia API as a real, working web source.
 */
class WebScraper extends BaseScraper {
  constructor() {
    super('web');
  }

  async scrape(keywords, options = {}) {
    const limit = options.limit || 20;
    const allResults = [];

    for (const keyword of keywords) {
      try {
        const results = await this._searchHackerNews(keyword, limit);
        allResults.push(...results);
        await delay(REQUEST_DELAY_MS);
      } catch (err) {
        logger.warn(`Web scrape failed for keyword "${keyword}"`, { error: err.message });
      }
    }

    const uniqueResults = this._deduplicateByUrl(allResults);
    logger.info(`Web scraper found ${uniqueResults.length} unique results for ${keywords.length} keywords`);
    return uniqueResults;
  }

  async _searchHackerNews(keyword, limit) {
    const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(keyword)}&tags=story&hitsPerPage=${limit}`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HN API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || !data.hits) return [];

    return data.hits.map(hit => ({
      ...hit,
      _matchedKeyword: keyword,
      _source: 'hackernews',
    }));
  }

  async parseLead(rawData) {
    const title = rawData.title || '';
    const storyText = rawData.story_text || '';
    const content = `${title}\n\n${storyText}`.trim();

    return {
      platform: 'web',
      author: rawData.author || 'unknown',
      authorUrl: rawData.author
        ? `https://news.ycombinator.com/user?id=${rawData.author}`
        : null,
      content: content.substring(0, 5000),
      sourceUrl: rawData.url || `https://news.ycombinator.com/item?id=${rawData.objectID}`,
      matchedKeyword: rawData._matchedKeyword,
      points: rawData.points || 0,
      numComments: rawData.num_comments || 0,
      createdAt: rawData.created_at || new Date().toISOString(),
    };
  }

  _deduplicateByUrl(results) {
    const seen = new Set();
    return results.filter(item => {
      const key = item.objectID || item.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export default WebScraper;
