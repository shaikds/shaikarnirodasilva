import { SCORING_WEIGHTS } from "@trendsupply/shared";
import type { SupplierScore } from "@trendsupply/shared";

interface ScoringInput {
  rating: number | null;
  reviewCount: number;
  responseTime: number | null;
  verified: boolean;
  orderConsistency?: number;
}

function normalizeRating(rating: number | null): number {
  if (rating === null || rating === undefined) return 0;
  return (Math.min(Math.max(rating, 0), 5) / 5) * 100;
}

function normalizeReviewCount(reviewCount: number): number {
  const maxReviews = 10000;
  return Math.min(reviewCount / maxReviews, 1) * 100;
}

function normalizeResponseTime(responseTime: number | null): number {
  if (responseTime === null || responseTime === undefined) return 0;
  const maxHours = 72;
  const clamped = Math.min(Math.max(responseTime, 0), maxHours);
  return ((maxHours - clamped) / maxHours) * 100;
}

function normalizeVerified(verified: boolean): number {
  return verified ? 100 : 0;
}

function normalizeConsistency(consistency: number | undefined): number {
  if (consistency === undefined || consistency === null) return 50;
  return Math.min(Math.max(consistency, 0), 100);
}

export function calculateReliabilityScore(input: ScoringInput): SupplierScore {
  const ratingScore = normalizeRating(input.rating);
  const reviewScore = normalizeReviewCount(input.reviewCount);
  const responseTimeScore = normalizeResponseTime(input.responseTime);
  const verifiedScore = normalizeVerified(input.verified);
  const consistencyScore = normalizeConsistency(input.orderConsistency);

  const total =
    SCORING_WEIGHTS.RATING * ratingScore +
    SCORING_WEIGHTS.REVIEWS * reviewScore +
    SCORING_WEIGHTS.RESPONSE_TIME * responseTimeScore +
    SCORING_WEIGHTS.VERIFIED * verifiedScore +
    SCORING_WEIGHTS.CONSISTENCY * consistencyScore;

  return {
    rating: ratingScore,
    reviews: reviewScore,
    responseTime: responseTimeScore,
    verified: verifiedScore,
    consistency: consistencyScore,
    total: Math.round(total * 100) / 100,
  };
}
