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

async function fetchReviews(appId: string, maxReviews = 200): Promise<PlayStoreReview[]> {
  try {
    const gplay = await import("google-play-scraper");
    const { data } = await gplay.default.reviews({
      appId,
      lang: "en",
      country: "us",
      sort: 1 as unknown as Parameters<typeof gplay.default.reviews>[0]["sort"],
      num: maxReviews,
    });

    return data.map((r) => ({
      id: (r as { id?: string }).id ?? "",
      userName: r.userName ?? "",
      text: r.text ?? "",
      score: r.score ?? 0,
      date: r.date ? new Date(r.date as unknown as string | number | Date).toISOString() : new Date().toISOString(),
      thumbsUp: r.thumbsUp ?? 0,
      replyDate: r.replyDate ? new Date(r.replyDate as unknown as string | number | Date).toISOString() : null,
      replyText: r.replyText ?? null,
    }));
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
      const reviews = await fetchReviews(appId, 150);
      return { appId, title: appId, reviews };
    }),
  );

  const total = apps.reduce((sum, a) => sum + a.reviews.length, 0);
  logger.info({ apps: apps.length, reviews: total }, "Play Store data collected");

  return apps.filter((a) => a.reviews.length > 0);
}
