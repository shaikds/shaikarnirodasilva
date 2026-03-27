import Notification from '../models/Notification.js';
import logger from '../utils/logger.js';

/**
 * Observer pattern implementation for notifications.
 * Services can subscribe to events and get notified when they occur.
 */

class NotificationObserver {
  /**
   * @param {string} name - Observer name for logging
   * @param {Function} handler - Handler function called on update
   */
  constructor(name, handler) {
    this.name = name;
    this.handler = handler;
  }

  update(event) {
    try {
      this.handler(event);
    } catch (err) {
      logger.error(`Observer "${this.name}" failed`, { error: err.message });
    }
  }
}

class NotificationService {
  constructor() {
    this.observers = [];
    this._registerDefaultObservers();
  }

  _registerDefaultObservers() {
    this.subscribe(new NotificationObserver('db-persister', (event) => {
      Notification.create({
        userId: event.userId,
        leadId: event.leadId || null,
        type: event.type,
        title: event.title,
        message: event.message,
      });
    }));

    this.subscribe(new NotificationObserver('logger', (event) => {
      logger.info('Notification dispatched', {
        type: event.type,
        userId: event.userId,
        title: event.title,
      });
    }));
  }

  /**
   * Subscribe an observer.
   * @param {NotificationObserver} observer
   */
  subscribe(observer) {
    this.observers.push(observer);
  }

  /**
   * Unsubscribe an observer by name.
   * @param {string} name
   */
  unsubscribe(name) {
    this.observers = this.observers.filter(o => o.name !== name);
  }

  /**
   * Notify all observers of an event.
   * @param {{ userId: number, leadId?: number, type: string, title: string, message: string }} event
   */
  notify(event) {
    for (const observer of this.observers) {
      observer.update(event);
    }
  }

  /**
   * Emit a "new leads found" notification.
   * @param {number} userId
   * @param {number} count
   * @param {string} platform
   */
  notifyNewLeads(userId, count, platform) {
    this.notify({
      userId,
      type: 'new_leads',
      title: `${count} new leads found`,
      message: `Discovered ${count} new potential leads from ${platform}. Check your dashboard for details.`,
    });
  }

  /**
   * Emit a "scrape completed" notification.
   * @param {number} userId
   * @param {string} platform
   * @param {number} resultsCount
   */
  notifyScrapeComplete(userId, platform, resultsCount) {
    this.notify({
      userId,
      type: 'scrape_complete',
      title: `Scrape completed for ${platform}`,
      message: `Scraping ${platform} finished. Found ${resultsCount} results.`,
    });
  }

  /**
   * Emit a "high score lead" notification.
   * @param {number} userId
   * @param {number} leadId
   * @param {number} score
   */
  notifyHighScoreLead(userId, leadId, score) {
    this.notify({
      userId,
      leadId,
      type: 'high_score_lead',
      title: 'High-potential lead detected',
      message: `A lead with a score of ${score}/100 was found. This looks like a strong prospect!`,
    });
  }
}

const notificationService = new NotificationService();
export { NotificationObserver };
export default notificationService;
