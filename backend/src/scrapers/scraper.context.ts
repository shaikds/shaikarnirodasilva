import type { IScraperStrategy, ScraperResult } from "./interfaces/scraper.strategy";
import { logger } from "../utils/logger";

export class ScraperContext<T> {
  private strategy: IScraperStrategy<T>;

  constructor(strategy: IScraperStrategy<T>) {
    this.strategy = strategy;
  }

  setStrategy(strategy: IScraperStrategy<T>): void {
    this.strategy = strategy;
  }

  getStrategyName(): string {
    return this.strategy.name;
  }

  async run(params: Record<string, unknown>): Promise<ScraperResult<T>> {
    const startTime = Date.now();
    logger.info(`Starting scraper: ${this.strategy.name}`, { params });

    try {
      const result = await this.strategy.execute(params);
      const duration = Date.now() - startTime;

      logger.info(`Scraper ${this.strategy.name} completed in ${duration}ms`, {
        itemCount: result.data.length,
        errorCount: result.errors.length,
        success: result.success,
      });

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      logger.error(`Scraper ${this.strategy.name} failed after ${duration}ms`, {
        error: errMsg,
      });

      return {
        success: false,
        data: [],
        errors: [errMsg],
        scrapedAt: new Date(),
      };
    }
  }
}
