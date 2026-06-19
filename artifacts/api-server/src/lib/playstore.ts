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
      num: 5,
      lang: "en",
      country: "us",
    });
    return results.map((r: { appId: string }) => r.appId).slice(0, 3);
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

async function fetchAllReviews(appId: string, maxTotal = 500): Promise<PlayStoreReview[]> {
  try {
    const gplay = await import("google-play-scraper");
    const allReviews: PlayStoreReview[] = [];
    let nextPaginationToken: string | undefined;

    do {
      const result = await gplay.default.reviews({
        appId,
        lang: "en",
        country: "us",
        sort: 1 as unknown as Parameters<typeof gplay.default.reviews>[0]["sort"],
        num: 300,
        ...(nextPaginationToken ? { nextPaginationToken } : {}),
      });

      const batch = (result.data as unknown as Record<string, unknown>[]).map(mapReview);
      allReviews.push(...batch);
      nextPaginationToken = result.nextPaginationToken as string | undefined;

      if (batch.length === 0) break;
    } while (nextPaginationToken && allReviews.length < maxTotal);

    return allReviews.slice(0, maxTotal);
  } catch (err) {
    logger.warn({ appId, err }, "Failed to fetch Play Store reviews for app");
    return [];
  }
}

export async function collectPlayStoreData(query: string): Promise<PlayStoreApp[]> {
  logger.info({ query }, "Collecting Play Store data");

  const appIds = await searchPlayStore(query);
  if (appIds.length === 0) {
    logger.info("No Play Store apps found");
    return [];
  }

  const apps = await Promise.all(
    appIds.map(async (appId) => {
      const reviews = await fetchAllReviews(appId, 500);
      return { appId, title: appId, reviews };
    }),
  );

  const total = apps.reduce((sum, a) => sum + a.reviews.length, 0);
  logger.info({ apps: apps.length, reviews: total }, "Play Store data collected");

  return apps.filter((a) => a.reviews.length > 0);
}
