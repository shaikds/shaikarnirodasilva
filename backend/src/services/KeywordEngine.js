/**
 * Keyword matching and NLP-lite engine.
 * Provides keyword matching, density scoring, and intent signal detection.
 */

const INTENT_SIGNALS = [
  'looking for', 'need', 'recommend', 'help me find', 'searching for',
  'any suggestions', 'best tool', 'best software', 'anyone know',
  'can someone suggest', 'what do you use', 'alternative to',
  'switch from', 'replace', 'upgrade', 'solution for', 'tool for',
  'software for', 'platform for', 'service for', 'how to automate',
  'wish there was', 'does anyone have', 'budget for', 'paying for',
  'willing to pay', 'want to buy', 'interested in', 'evaluating',
];

class KeywordEngine {
  /**
   * Check if content matches any of the given keywords.
   * @param {string} content - Text content to check
   * @param {string[]} keywords - Keywords to match against
   * @returns {{ matched: boolean, matchedKeywords: string[], density: number }}
   */
  static match(content, keywords) {
    if (!content || !keywords || keywords.length === 0) {
      return { matched: false, matchedKeywords: [], density: 0 };
    }

    const lowerContent = content.toLowerCase();
    const words = lowerContent.split(/\s+/).length;
    const matchedKeywords = [];
    let totalMatches = 0;

    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase().trim();
      if (!lowerKeyword) continue;

      const regex = new RegExp(`\\b${KeywordEngine._escapeRegex(lowerKeyword)}\\b`, 'gi');
      const matches = lowerContent.match(regex);

      if (matches && matches.length > 0) {
        matchedKeywords.push(keyword);
        totalMatches += matches.length;
      }
    }

    const density = words > 0 ? (totalMatches / words) * 100 : 0;

    return {
      matched: matchedKeywords.length > 0,
      matchedKeywords,
      density: Math.min(density, 100),
    };
  }

  /**
   * Detect intent signals in content.
   * @param {string} content - Text content to analyze
   * @returns {{ hasIntent: boolean, signals: string[], intentScore: number }}
   */
  static detectIntent(content) {
    if (!content) return { hasIntent: false, signals: [], intentScore: 0 };

    const lowerContent = content.toLowerCase();
    const foundSignals = [];

    for (const signal of INTENT_SIGNALS) {
      if (lowerContent.includes(signal)) {
        foundSignals.push(signal);
      }
    }

    const intentScore = Math.min((foundSignals.length / 3) * 15, 15);

    return {
      hasIntent: foundSignals.length > 0,
      signals: foundSignals,
      intentScore: Math.round(intentScore),
    };
  }

  /**
   * Calculate keyword match density score (0-30).
   * @param {number} density - Keyword density percentage
   * @returns {number}
   */
  static densityScore(density) {
    if (density <= 0) return 0;
    if (density >= 5) return 30;
    return Math.round((density / 5) * 30);
  }

  static _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export default KeywordEngine;
