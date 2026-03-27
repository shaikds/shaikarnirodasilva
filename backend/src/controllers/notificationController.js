import Notification from '../models/Notification.js';

export async function getAll(req, res, next) {
  try {
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const notifications = Notification.findByUserId(req.user.id, { unreadOnly, limit, offset });
    const unreadCount = Notification.countUnread(req.user.id);

    res.json({ notifications, unreadCount });
  } catch (err) {
    next(err);
  }
}

export async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const existing = Notification.findByUserIdAndOwnership(Number(id), req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    const notification = Notification.markAsRead(Number(id));
    res.json({ notification });
  } catch (err) {
    next(err);
  }
}

export async function markAllAsRead(req, res, next) {
  try {
    const count = Notification.markAllAsRead(req.user.id);
    res.json({ message: `Marked ${count} notifications as read.`, count });
  } catch (err) {
    next(err);
  }
}

export default { getAll, markAsRead, markAllAsRead };
