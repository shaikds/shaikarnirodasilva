import type { ISupplierScraper, ScrapedSupplierData, ScraperResult } from "../interfaces/scraper.strategy";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";

export class AlibabaScraper implements ISupplierScraper {
  readonly name = "alibaba";

  async execute(params: Record<string, unknown>): Promise<ScraperResult<ScrapedSupplierData>> {
    const keywords = (params.keywords as string[]) || [];
    const maxPages = (params.maxPages as number) || 2;
    const errors: string[] = [];
    const supplierData: ScrapedSupplierData[] = [];

    try {
      const { PlaywrightCrawler } = await import("crawlee");

      const results: ScrapedSupplierData[] = [];

      const crawler = new PlaywrightCrawler({
        maxConcurrency: env.SCRAPE_CONCURRENCY,
        requestHandlerTimeoutSecs: env.SCRAPE_REQUEST_TIMEOUT / 1000,
        headless: true,
        async requestHandler({ page, request }) {
          try {
            await page.waitForLoadState("networkidle", { timeout: 20000 });

            const supplierElements = await page.$$(".organic-list .list-no-v2-outter, .J-offer-wrapper, [class*='supplier-item']");

            for (const element of supplierElements) {
              try {
                const name = await element.$eval(
                  "[class*='company'], [class*='supplier-name'], .title a",
                  (el) => el.textContent?.trim() || ""
                ).catch(() => "");

                if (!name) continue;

                const sourceUrl = await element.$eval(
                  "a[href*='alibaba.com']",
                  (el) => (el as HTMLAnchorElement).href
                ).catch(() => request.url);

                const ratingText = await element.$eval(
                  "[class*='rating'], [class*='score']",
                  (el) => el.textContent?.trim() || "0"
                ).catch(() => "0");

                const reviewText = await element.$eval(
                  "[class*='review'], [class*='transaction']",
                  (el) => el.textContent?.trim() || "0"
                ).catch(() => "0");

                const countryText = await element.$eval(
                  "[class*='country'], [class*='location']",
                  (el) => el.textContent?.trim() || ""
                ).catch(() => "");

                const priceText = await element.$eval(
                  "[class*='price']",
                  (el) => el.textContent?.trim() || ""
                ).catch(() => "");

                const moqText = await element.$eval(
                  "[class*='moq'], [class*='min-order']",
                  (el) => el.textContent?.trim() || ""
                ).catch(() => "");

                const verified = await element.$("[class*='verified'], [class*='gold']")
                  .then((el) => el !== null)
                  .catch(() => false);

                results.push({
                  name,
                  sourceUrl,
                  rating: parseFloat(ratingText) || null,
                  reviewCount: parseInt(reviewText.replace(/[^0-9]/g, ""), 10) || 0,
                  responseTime: null,
                  minOrderQty: parseInt(moqText.replace(/[^0-9]/g, ""), 10) || null,
                  priceRange: priceText || null,
                  country: countryText || null,
                  contactEmail: null,
                  verified,
                });
              } catch (elementErr) {
                const errMsg = elementErr instanceof Error ? elementErr.message : String(elementErr);
                logger.debug("Failed to parse supplier element", { error: errMsg });
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to scrape page: ${errMsg}`);
          }
        },
      });

      const requests: { url: string; userData: Record<string, unknown> }[] = [];
      for (const keyword of keywords) {
        for (let page = 1; page <= maxPages; page++) {
          requests.push({
            url: `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(keyword)}&page=${page}`,
            userData: { keyword, page },
          });
        }
      }

      if (requests.length > 0) {
        await crawler.run(requests);
      }

      supplierData.push(...results);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Alibaba scraper initialization failed: ${errMsg}`);
      logger.error("Alibaba scraper failed", { error: errMsg });
    }

    logger.info(`Alibaba scraper completed: ${supplierData.length} suppliers found`, {
      errors: errors.length,
    });

    return {
      success: errors.length === 0,
      data: supplierData,
      errors,
      scrapedAt: new Date(),
    };
  }
}
