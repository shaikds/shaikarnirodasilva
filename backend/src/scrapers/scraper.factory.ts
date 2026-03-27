import { SCRAPER_TYPES } from "@trendsupply/shared";
import { RedditScraper } from "./strategies/reddit.scraper";
import { GoogleTrendsScraper } from "./strategies/googletrends.scraper";
import { AlibabaScraper } from "./strategies/alibaba.scraper";
import { LocalSupplierScraper } from "./strategies/local.scraper";
import type { ITrendScraper, ISupplierScraper } from "./interfaces/scraper.strategy";

type ScraperType = typeof SCRAPER_TYPES[keyof typeof SCRAPER_TYPES];

export class ScraperFactory {
  static createTrendScraper(type: ScraperType): ITrendScraper {
    switch (type) {
      case SCRAPER_TYPES.REDDIT:
        return new RedditScraper();
      case SCRAPER_TYPES.GOOGLE_TRENDS:
        return new GoogleTrendsScraper();
      default:
        throw new Error(`Unknown trend scraper type: ${type}`);
    }
  }

  static createSupplierScraper(type: ScraperType): ISupplierScraper {
    switch (type) {
      case SCRAPER_TYPES.ALIBABA:
        return new AlibabaScraper();
      case SCRAPER_TYPES.LOCAL:
        return new LocalSupplierScraper();
      default:
        throw new Error(`Unknown supplier scraper type: ${type}`);
    }
  }
}
