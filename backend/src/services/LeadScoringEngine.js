import KeywordEngine from './KeywordEngine.js';

/**
 * Lead scoring engine. Scores leads 0-100 based on multiple factors:
 * - Keyword match density (0-30)
 * - Recency of post (0-20)
 * - Engagement level (0-20)
 * - Platform authority (0-15)
 * - Intent signals (0-15)
 */

const PLATFORM_AUTHORITY = {
  reddit: 12,
  web: 10,
  hackernews: 13,
};

class LeadScoringEngine {
  /**
   * Score a parsed lead.
   * @param {object} lead - Parsed lead object from a scraper
   * @param {string[]} keywords - User's keyword list
   * @returns {number} Score from 0-100
   */
  static score(lead, keywords) {
    const content = lead.content || '';
    let total = 0;

    // 1. Keyword match density (0-30)
    const matchResult = KeywordEngine.match(content, keywords);
    total += KeywordEngine.densityScore(matchResult.density);

    // 2. Recency (0-20)
    total += LeadScoringEngine._recencyScore(lead);

    // 3. Engagement (0-20)
    total += LeadScoringEngine._engagementScore(lead);

    // 4. Platform authority (0-15)
    total += LeadScoringEngine._platformScore(lead.platform);

    // 5. Intent signals (0-15)
    const intentResult = KeywordEngine.detectIntent(content);
    total += intentResult.intentScore;

    return Math.min(Math.round(total), 100);
  }

  static _recencyScore(lead) {
    let postDate;

    if (lead.createdUtc) {
      postDate = new Date(lead.createdUtc * 1000);
    } else if (lead.createdAt) {
      postDate = new Date(lead.createdAt);
    } else {
      return 5;
    }

    const now = new Date();
    const hoursAgo = (now - postDate) / (1000 * 60 * 60);

    if (hoursAgo <= 6) return 20;
    if (hoursAgo <= 24) return 17;
    if (hoursAgo <= 72) return 14;
    if (hoursAgo <= 168) return 10;
    if (hoursAgo <= 720) return 5;
    return 2;
  }

  static _engagementScore(lead) {
    const comments = lead.numComments || 0;
    const upvotes = lead.score || lead.points || 0;

    let commentScore = 0;
    if (comments >= 50) commentScore = 10;
    else if (comments >= 20) commentScore = 8;
    else if (comments >= 10) commentScore = 6;
    else if (comments >= 5) commentScore = 4;
    else if (comments >= 1) commentScore = 2;

    let upvoteScore = 0;
    if (upvotes >= 100) upvoteScore = 10;
    else if (upvotes >= 50) upvoteScore = 8;
    else if (upvotes >= 20) upvoteScore = 6;
    else if (upvotes >= 10) upvoteScore = 4;
    else if (upvotes >= 1) upvoteScore = 2;

    return Math.min(commentScore + upvoteScore, 20);
  }

  static _platformScore(platform) {
    return PLATFORM_AUTHORITY[platform?.toLowerCase()] || 8;
  }
}

export default LeadScoringEngine;
