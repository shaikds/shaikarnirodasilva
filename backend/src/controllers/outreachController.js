import Lead from '../models/Lead.js';
import OutreachSuggestionService from '../services/OutreachSuggestionService.js';

export async function suggest(req, res, next) {
  try {
    const { leadId } = req.params;
    const lead = Lead.findByUserIdAndOwnership(Number(leadId), req.user.id);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found.' });
    }

    const result = OutreachSuggestionService.generate(lead);

    res.json({
      leadId: lead.id,
      platform: lead.platform,
      author: lead.author,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export default { suggest };
