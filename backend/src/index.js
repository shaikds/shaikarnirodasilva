import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeDatabase } from './config/database.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/authRoutes.js';
import keywordRoutes from './routes/keywordRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import outreachRoutes from './routes/outreachRoutes.js';
import schedulerService from './services/SchedulerService.js';
import logger from './utils/logger.js';

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3001;

// Validate critical environment variables
const INSECURE_SECRETS = ['your-super-secret-jwt-key-change-this', 'secret', 'changeme', ''];
if (!process.env.JWT_SECRET || INSECURE_SECRETS.includes(process.env.JWT_SECRET)) {
  if (process.env.NODE_ENV === 'production') {
    logger.error('FATAL: JWT_SECRET is missing or insecure. Set a strong secret in .env before running in production.');
    process.exit(1);
  }
  logger.warn('JWT_SECRET is missing or using an insecure default. Set a strong secret in .env for production use.');
}

// --------------- Security middleware ---------------
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(generalLimiter);

// --------------- Body parsing ---------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// --------------- Health check ---------------
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --------------- Routes ---------------
app.use('/api/auth', authRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/outreach', outreachRoutes);

// --------------- Error handling ---------------
app.use(notFoundHandler);
app.use(errorHandler);

// --------------- Start server ---------------
function start() {
  try {
    initializeDatabase();
    logger.info('Database initialized');

    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

    if (process.env.NODE_ENV === 'production') {
      schedulerService.startDefaultSchedule();
    }
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...');
  schedulerService.stopAll();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down gracefully...');
  schedulerService.stopAll();
  process.exit(0);
});

start();

export default app;
