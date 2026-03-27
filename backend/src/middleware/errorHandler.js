import logger from '../utils/logger.js';
import { escapeHtml } from '../utils/sanitizer.js';

export function errorHandler(err, req, res, _next) {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  if (err.name === 'SqliteError') {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Resource already exists.' });
    }
    if (err.message.includes('FOREIGN KEY constraint failed')) {
      return res.status(400).json({ error: 'Referenced resource does not exist.' });
    }
    return res.status(500).json({ error: 'Database error.' });
  }

  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? 'Internal server error.' : err.message;

  res.status(statusCode).json({ error: message });
}

export function notFoundHandler(req, res) {
  const safePath = escapeHtml(req.path);
  const safeMethod = escapeHtml(req.method);
  res.status(404).json({ error: `Route ${safeMethod} ${safePath} not found.` });
}

export default { errorHandler, notFoundHandler };
