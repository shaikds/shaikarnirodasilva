import BaseScraper from './BaseScraper.js';
import logger from '../../utils/logger.js';

const DEFAULT_SUBREDDITS = [
  'smallbusiness', 'startups', 'SaaS', 'artificial', 'entrepreneur',
  'MachineLearning', 'technology', 'software', 'business', 'Automate'
];

const REDDIT_BASE = 'https://www.reddit.com';
const USER_AGENT = process.env.REDDIT_USER_AGENT || 'AICustomerDiscovery/1.0';
const REQUEST_DELAY_MS = 1200;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class RedditScraper extends BaseScraper {
  constructor() {
    super('reddit');
  }

  async scrape(keywords, options = {}) {
    const subreddits = options.subreddits || DEFAULT_SUBREDDITS;
    const limit = options.limit || 25;
    const allResults = [];

    for (const keyword of keywords) {
      for (const subreddit of subreddits) {
        try {
          const results = await this._searchSubreddit(subreddit, keyword, limit);
          allResults.push(...results);
          await delay(REQUEST_DELAY_MS);
        } catch (err) {
          logger.warn(`Reddit scrape failed for r/${subreddit} with keyword "${keyword}"`, {
            error: err.message,
          });
        }
      }
    }

    const uniqueResults = this._deduplicateByUrl(allResults);
    logger.info(`Reddit scraper found ${uniqueResults.length} unique results for ${keywords.length} keywords`);
    return uniqueResults;
  }

  async _searchSubreddit(subreddit, keyword, limit) {
    const url = `${REDDIT_BASE}/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(keyword)}&restrict_sr=1&sort=new&limit=${limit}&t=month`;

    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Reddit API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || !data.data || !data.data.children) {
      return [];
    }

    return data.data.children
      .filter(child => child.kind === 't3')
      .map(child => ({
        ...child.data,
        _matchedKeyword: keyword,
        _subreddit: subreddit,
      }));
  }

  async parseLead(rawData) {
    const title = rawData.title || '';
    const selftext = rawData.selftext || '';
    const content = `${title}\n\n${selftext}`.trim();

    return {
      platform: 'reddit',
      author: rawData.author || '[deleted]',
      authorUrl: rawData.author && rawData.author !== '[deleted]'
        ? `${REDDIT_BASE}/user/${rawData.author}`
        : null,
      content: content.substring(0, 5000),
      sourceUrl: rawData.permalink
        ? `${REDDIT_BASE}${rawData.permalink}`
        : `${REDDIT_BASE}/r/${rawData._subreddit}`,
      matchedKeyword: rawData._matchedKeyword,
      subreddit: rawData.subreddit_name_prefixed || `r/${rawData._subreddit}`,
      score: rawData.score || 0,
      numComments: rawData.num_comments || 0,
      createdUtc: rawData.created_utc || Date.now() / 1000,
      upvoteRatio: rawData.upvote_ratio || 0,
    };
  }

  _deduplicateByUrl(results) {
    const seen = new Set();
    return results.filter(item => {
      const key = item.permalink || item.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}

export default RedditScraper;
