import KeywordEngine from './KeywordEngine.js';

/**
 * Generates contextual outreach message templates based on lead content and matched keywords.
 * Provides 2-3 variations for each lead.
 */
class OutreachSuggestionService {
  /**
   * Generate outreach suggestions for a lead.
   * @param {object} lead - Lead object from the database
   * @returns {{ suggestions: Array<{ name: string, subject: string, body: string }> }}
   */
  static generate(lead) {
    const matchedKeywords = lead.matched_keywords
      ? lead.matched_keywords.split(',').map(k => k.trim())
      : [];

    const intentResult = KeywordEngine.detectIntent(lead.content);
    const platform = lead.platform || 'the web';
    const authorName = lead.author && lead.author !== '[deleted]' ? lead.author : 'there';
    const topKeyword = matchedKeywords[0] || 'AI solutions';
    const contentSnippet = OutreachSuggestionService._extractSnippet(lead.content, 80);

    const suggestions = [
      OutreachSuggestionService._helpfulApproach(authorName, topKeyword, platform, contentSnippet, intentResult),
      OutreachSuggestionService._valueFirstApproach(authorName, topKeyword, matchedKeywords, platform),
      OutreachSuggestionService._socialProofApproach(authorName, topKeyword, platform, contentSnippet),
    ];

    return { suggestions };
  }

  static _helpfulApproach(name, keyword, platform, snippet, intentResult) {
    const intentHook = intentResult.hasIntent
      ? `I noticed you mentioned ${intentResult.signals[0]} -- `
      : `I came across your post about "${snippet}" -- `;

    return {
      name: 'Helpful Expert',
      subject: `Re: Your question about ${keyword}`,
      body: `Hi ${name},\n\n${intentHook}and I thought I might be able to help.\n\nI work with ${keyword} solutions and have seen a lot of teams tackle similar challenges. Without knowing all the details, here are a couple of approaches that tend to work well:\n\n1. [Brief suggestion relevant to their need]\n2. [Alternative approach or tool recommendation]\n\nWould it be helpful if I shared more specifics? Happy to chat if you'd like to explore options.\n\nBest regards`,
    };
  }

  static _valueFirstApproach(name, keyword, matchedKeywords, platform) {
    const keywordList = matchedKeywords.length > 1
      ? matchedKeywords.slice(0, 3).join(', ')
      : keyword;

    return {
      name: 'Value First',
      subject: `Quick resource for ${keyword}`,
      body: `Hi ${name},\n\nI put together a quick comparison of the top solutions for ${keywordList} that might save you some research time.\n\nBased on what I've seen work for teams in similar situations:\n\n- For ease of use: [Tool A] is hard to beat\n- For flexibility: [Tool B] gives you the most control\n- For budget-conscious teams: [Tool C] has a generous free tier\n\nI've helped several teams evaluate and implement ${keyword} tools. If you'd find it useful, I'm happy to share what I've learned about what works and what doesn't.\n\nNo strings attached -- just glad to help.\n\nCheers`,
    };
  }

  static _socialProofApproach(name, keyword, platform, snippet) {
    return {
      name: 'Social Proof',
      subject: `How others solved the ${keyword} challenge`,
      body: `Hi ${name},\n\nYour post resonated with me -- "${snippet}" is something I hear from a lot of teams.\n\nRecently, I worked with a company facing a similar ${keyword} challenge. They were spending hours on manual processes and needed something that could scale. After evaluating several options, they landed on a solution that cut their workload by 60%.\n\nI'd be happy to share the details of what worked for them, including the pitfalls they avoided. Sometimes a quick conversation can save weeks of trial and error.\n\nWould a 15-minute call be worthwhile?\n\nBest`,
    };
  }

  static _extractSnippet(content, maxLength) {
    if (!content) return '';
    const cleaned = content.replace(/\n+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    return cleaned.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
  }
}

export default OutreachSuggestionService;
