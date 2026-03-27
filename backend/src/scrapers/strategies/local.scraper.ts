import type { ISupplierScraper, ScrapedSupplierData, ScraperResult } from "../interfaces/scraper.strategy";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";

export class LocalSupplierScraper implements ISupplierScraper {
  readonly name = "local";

  async execute(params: Record<string, unknown>): Promise<ScraperResult<ScrapedSupplierData>> {
    const keywords = (params.keywords as string[]) || [];
    const region = (params.region as string) || "US";
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
            await page.waitForLoadState("networkidle", { timeout: 15000 });

            const listings = await page.$$("[class*='result'], [class*='listing'], .business-card");

            for (const listing of listings) {
              try {
                const name = await listing.$eval(
                  "h2, h3, [class*='name'], [class*='title']",
                  (el) => el.textContent?.trim() || ""
                ).catch(() => "");

                if (!name) continue;

                const website = await listing.$eval(
                  "a[href*='http']",
                  (el) => (el as HTMLAnchorElement).href
                ).catch(() => request.url);

                const ratingText = await listing.$eval(
                  "[class*='rating'], [class*='stars']",
                  (el) => el.textContent?.trim() || "0"
                ).catch(() => "0");

                const reviewText = await listing.$eval(
                  "[class*='review']",
                  (el) => el.textContent?.trim() || "0"
                ).catch(() => "0");

                const locationText = await listing.$eval(
                  "[class*='location'], [class*='address']",
                  (el) => el.textContent?.trim() || ""
                ).catch(() => "");

                const emailText = await listing.$eval(
                  "a[href^='mailto:']",
                  (el) => (el as HTMLAnchorElement).href.replace("mailto:", "")
                ).catch(() => null);

                results.push({
                  name,
                  sourceUrl: website,
                  rating: parseFloat(ratingText) || null,
                  reviewCount: parseInt(reviewText.replace(/[^0-9]/g, ""), 10) || 0,
                  responseTime: null,
                  minOrderQty: null,
                  priceRange: null,
                  country: locationText || region,
                  contactEmail: emailText,
                  verified: false,
                });
              } catch (elementErr) {
                const errMsg = elementErr instanceof Error ? elementErr.message : String(elementErr);
                logger.debug("Failed to parse local listing", { error: errMsg });
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push(`Failed to scrape local directory page: ${errMsg}`);
          }
        },
      });

      const requests: { url: string; userData: Record<string, unknown> }[] = [];
      for (const keyword of keywords) {
        requests.push({
          url: `https://www.thomasnet.com/nsearch.html?cov=NA&heading=&what=${encodeURIComponent(keyword)}&where=${encodeURIComponent(region)}`,
          userData: { keyword, region },
        });
      }

      if (requests.length > 0) {
        await crawler.run(requests);
      }

      supplierData.push(...results);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push(`Local supplier scraper failed: ${errMsg}`);
      logger.error("Local supplier scraper failed", { error: errMsg });
    }

    logger.info(`Local supplier scraper completed: ${supplierData.length} suppliers found`, {
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
