import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, reportsTable } from "@workspace/db";
import {
  AnalyzeProductBody,
  GetReportParams,
  AnalyzeProductResponse,
  GetReportResponse,
  ListReportsResponseItem,
  ListReportsResponse,
} from "@workspace/api-zod";
import { collectRedditData } from "../../lib/reddit";
import { collectPlayStoreData } from "../../lib/playstore";
import { normalizeFeedback, clusterFeedback, deduplicateItems } from "../../lib/cluster";
import { generateReport } from "../../lib/analyzer";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

router.post("/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { query, forceRefresh } = parsed.data;
  const queryNormalized = normalizeQuery(query);

  req.log.info({ query, queryNormalized }, "Analysis requested");

  if (!forceRefresh) {
    const [cached] = await db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.queryNormalized, queryNormalized))
      .orderBy(desc(reportsTable.createdAt))
      .limit(1);

    if (cached) {
      const age = Date.now() - new Date(cached.createdAt).getTime();
      if (age < CACHE_TTL_MS) {
        req.log.info({ query }, "Returning cached report");
        res.json(AnalyzeProductResponse.parse(cached.reportData));
        return;
      }
    }
  }

  try {
    req.log.info({ query }, "Starting data collection");

    const [redditPosts, playStoreApps] = await Promise.all([
      collectRedditData(query),
      collectPlayStoreData(query),
    ]);

    const redditComments = redditPosts.reduce((sum, p) => sum + p.comments.length, 0);
    const playStoreReviews = playStoreApps.reduce((sum, a) => sum + a.reviews.length, 0);

    req.log.info({
      redditPosts: redditPosts.length,
      redditComments,
      playStoreReviews,
    }, "Data collected, clustering");

    const rawItems = normalizeFeedback(redditPosts, playStoreApps);
    const dedupedItems = deduplicateItems(rawItems);
    const feedbackSummary = clusterFeedback(dedupedItems);

    if (dedupedItems.length === 0) {
      res.status(200).json({
        id: `empty-${Date.now()}`,
        query,
        createdAt: new Date().toISOString(),
        dataSourceStats: { redditPosts: 0, redditComments: 0, playStoreReviews: 0, totalDataPoints: 0 },
        executiveSummary: {
          overallSentiment: "No data found",
          mainConcerns: [],
          biggestOpportunities: [],
          keyObservations: ["No public discussions found for this query. Try a different product name."],
        },
        sentiment: { positive: 0, neutral: 100, negative: 0 },
        topComplaints: [],
        customerPraise: [],
        featureRequests: [],
        competitorMentions: [],
        frustrations: [],
        opportunities: [],
        recommendations: [],
        aiVerdict: "Insufficient public data found for this product. Try searching with a different name or spelling.",
      });
      return;
    }

    req.log.info({ items: dedupedItems.length }, "Generating AI report");

    const report = await generateReport(query, feedbackSummary, dedupedItems, {
      redditPosts: redditPosts.length,
      redditComments,
      playStoreReviews,
    });

    await db
      .insert(reportsTable)
      .values({
        id: report.id,
        query,
        queryNormalized,
        reportData: report,
      })
      .onConflictDoUpdate({
        target: reportsTable.id,
        set: { reportData: report },
      });

    req.log.info({ query, reportId: report.id }, "Report generated and cached");
    res.json(AnalyzeProductResponse.parse(report));
  } catch (err) {
    req.log.error({ err, query }, "Analysis failed");
    res.status(500).json({
      error: err instanceof Error ? err.message : "Analysis failed. Please try again.",
    });
  }
});

router.get("/reports/:query", async (req, res): Promise<void> => {
  const params = GetReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const rawParam = decodeURIComponent(params.data.query);

  // Try lookup by ID first (frontend navigates using report.id),
  // then fall back to queryNormalized for direct query lookups.
  const [byId] = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.id, rawParam))
    .limit(1);

  const [byQuery] = byId
    ? []
    : await db
        .select()
        .from(reportsTable)
        .where(eq(reportsTable.queryNormalized, normalizeQuery(rawParam)))
        .orderBy(desc(reportsTable.createdAt))
        .limit(1);

  const cached = byId ?? byQuery;

  if (!cached) {
    res.status(404).json({ error: "No cached report found for this query." });
    return;
  }

  const age = Date.now() - new Date(cached.createdAt).getTime();
  if (age >= CACHE_TTL_MS) {
    res.status(404).json({ error: "Cached report has expired. Please re-analyze." });
    return;
  }

  res.json(GetReportResponse.parse(cached.reportData));
});

router.get("/reports", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(reportsTable)
    .orderBy(desc(reportsTable.createdAt))
    .limit(20);

  const summaries = rows
    .filter((r) => {
      const age = Date.now() - new Date(r.createdAt).getTime();
      return age < CACHE_TTL_MS;
    })
    .map((r) => {
      const data = r.reportData as { executiveSummary?: { overallSentiment?: string }; dataSourceStats?: { totalDataPoints?: number } };
      return ListReportsResponseItem.parse({
        id: r.id,
        query: r.query,
        createdAt: r.createdAt.toISOString(),
        overallSentiment: data?.executiveSummary?.overallSentiment ?? "Unknown",
        totalDataPoints: data?.dataSourceStats?.totalDataPoints ?? 0,
      });
    });

  res.json(ListReportsResponse.parse(summaries));
});

export default router;
