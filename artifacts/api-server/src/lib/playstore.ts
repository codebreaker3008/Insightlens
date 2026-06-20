/**
 * Play Store data source — supplementary signal only.
 * Fetches reviews for the top matching app to capture app-specific UX feedback.
 * Intentionally capped at 150 reviews from 1 app so it doesn't drown out
 * broader community discussions from Reddit.
 */
import { logger } from "./logger";

export interface PlayStoreReview {
  id: string;
  userName: string;
  text: string;
  score: number;
  date: string;
  thumbsUp: number;
  replyDate: string | null;
  replyText: string | null;
}

export interface PlayStoreApp {
  appId: string;
  title: string;
  reviews: PlayStoreReview[];
}

async function searchPlayStore(query: string): Promise<string[]> {
  try {
    const gplay = await import("google-play-scraper");
    const results = await gplay.default.search({
      term: query,
      num: 3,
      lang: "en",
      country: "us",
    });
    // Only take the top 1 result — we want supplementary signal, not dominance
    return results.map((r: { appId: string }) => r.appId).slice(0, 1);
  } catch (err) {
    logger.warn({ err }, "Play Store search failed");
    return [];
  }
}

function mapReview(r: Record<string, unknown>): PlayStoreReview {
  const toDate = (v: unknown) =>
    v ? new Date(v as string | number | Date).toISOString() : new Date().toISOString();
  const toNullDate = (v: unknown) =>
    v ? new Date(v as string | number | Date).toISOString() : null;

  return {
    id: String((r as { id?: string }).id ?? ""),
    userName: String(r.userName ?? ""),
    text: String(r.text ?? ""),
    score: Number(r.score ?? 0),
    date: toDate(r.date),
    thumbsUp: Number(r.thumbsUp ?? 0),
    replyDate: toNullDate(r.replyDate),
    replyText: r.replyText ? String(r.replyText) : null,
  };
}

async function fetchReviews(appId: string, max = 150): Promise<PlayStoreReview[]> {
  try {
    const gplay = await import("google-play-scraper");
    const result = await gplay.default.reviews({
      appId,
      lang: "en",
      country: "us",
      sort: 1 as unknown as Parameters<typeof gplay.default.reviews>[0]["sort"],
      num: max,
    });

    const reviews = (result.data as unknown as Record<string, unknown>[]).map(mapReview);
    return reviews.slice(0, max);
  } catch (err) {
    logger.warn({ appId, err }, "Failed to fetch Play Store reviews for app");
    return [];
  }
}

export async function collectPlayStoreData(query: string): Promise<PlayStoreApp[]> {
  logger.info({ query }, "Collecting supplementary Play Store data");

  const appIds = await searchPlayStore(query);
  if (appIds.length === 0) {
    logger.info("No Play Store apps found");
    return [];
  }

  const apps = await Promise.all(
    appIds.map(async (appId) => {
      const reviews = await fetchReviews(appId, 150);
      return { appId, title: appId, reviews };
    }),
  );

  const total = apps.reduce((sum, a) => sum + a.reviews.length, 0);
  logger.info({ apps: apps.length, reviews: total }, "Play Store supplementary data collected");

  return apps.filter((a) => a.reviews.length > 0);
}
