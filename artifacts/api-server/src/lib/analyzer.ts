import { chatWithFallback } from "./openrouter";
import type { FeedbackItem } from "./cluster";
import { logger } from "./logger";

export interface EvidenceItem {
  text: string;
  source: "community" | "playstore";
  url: string | null;
  date: string | null;
  subreddit: string | null;
  rating: number | null;
}

export interface AnalysisReport {
  id: string;
  query: string;
  createdAt: string;
  dataSourceStats: {
    redditPosts: number;
    redditComments: number;
    playStoreReviews: number;
    totalDataPoints: number;
  };
  executiveSummary: {
    overallSentiment: string;
    mainConcerns: string[];
    biggestOpportunities: string[];
    keyObservations: string[];
  };
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
  };
  topComplaints: {
    title: string;
    mentionCount: number;
    severity: string;
    evidence: EvidenceItem[];
  }[];
  customerPraise: {
    title: string;
    frequency: number;
    evidence: EvidenceItem[];
  }[];
  featureRequests: {
    title: string;
    frequency: number;
    evidence: EvidenceItem[];
    estimatedImportance: string;
  }[];
  competitorMentions: {
    name: string;
    mentionCount: number;
    context: string[];
  }[];
  frustrations: {
    title: string;
    severity: string;
    evidence: EvidenceItem[];
  }[];
  opportunities: {
    problem: string;
    mentions: number;
    severity: string;
    opportunity: string;
    potentialImpact: string;
  }[];
  recommendations: {
    title: string;
    why: string;
    evidence: string[];
    priority: string;
    expectedImpact: string;
  }[];
  aiVerdict: string;
}

function toEvidenceItems(items: FeedbackItem[], max = 3): EvidenceItem[] {
  return items.slice(0, max).map((i) => ({
    text: i.text.slice(0, 400),
    source: i.source,
    url: i.url,
    date: i.date,
    subreddit: i.subreddit,
    rating: i.rating,
  }));
}

function safeParseJson<T>(text: string): T | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
    text.match(/```\s*([\s\S]*?)\s*```/) ||
    text.match(/(\{[\s\S]*\})/);

  const jsonStr = jsonMatch ? jsonMatch[1] : text.trim();

  try {
    return JSON.parse(jsonStr) as T;
  } catch {
    try {
      const cleaned = jsonStr
        .replace(/,\s*([}\]])/g, "$1")
        .replace(/([{,]\s*)(\w+):/g, '$1"$2":');
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}

export async function generateReport(
  query: string,
  feedbackSummary: string,
  allItems: FeedbackItem[],
  stats: { redditPosts: number; redditComments: number; playStoreReviews: number },
): Promise<AnalysisReport> {
  logger.info({ query }, "Generating AI analysis report");

  const prompt = `You are a senior product intelligence analyst specializing in brand perception, customer experience, and market positioning. Analyze the following public feedback for "${query}" — this may be a product, a company, a service, or a brand — and generate a comprehensive intelligence report.

${feedbackSummary}

Your goal is to surface what customers, users, and the public genuinely think about "${query}" as a whole: the company's reputation, product quality, pricing, customer support, competitors, and brand perception. Do NOT treat this purely as an app review analysis — look for broader strategic signals.

Generate a detailed JSON report with ONLY real insights derived from the data above. Do NOT invent evidence. If data is insufficient for a section, return fewer items (or empty arrays). Every insight must be grounded in the feedback provided.

Respond with ONLY valid JSON matching this exact structure:
{
  "executiveSummary": {
    "overallSentiment": "string — concise summary e.g. 'Mostly positive: customers love the core product but frustrated by pricing and support'",
    "mainConcerns": ["top concern about the company/product", "second concern", "third concern"],
    "biggestOpportunities": ["opportunity based on real gaps mentioned", "second opportunity", "third opportunity"],
    "keyObservations": ["notable observation about brand/market position", "second observation", "third observation"]
  },
  "sentiment": {
    "positive": <number 0-100>,
    "neutral": <number 0-100>,
    "negative": <number 0-100>
  },
  "topComplaints": [
    {
      "title": "specific complaint about the company, product, service, or brand",
      "mentionCount": <estimated count based on data>,
      "severity": "low|medium|high|critical",
      "evidenceQuotes": ["exact or near-exact quote from feedback", "another quote"]
    }
  ],
  "customerPraise": [
    {
      "title": "what customers genuinely appreciate about the company or product",
      "frequency": <estimated count>,
      "evidenceQuotes": ["exact or near-exact quote"]
    }
  ],
  "featureRequests": [
    {
      "title": "feature, improvement, or service change users want",
      "frequency": <estimated count>,
      "estimatedImportance": "low|medium|high",
      "evidenceQuotes": ["exact or near-exact quote"]
    }
  ],
  "competitorMentions": [
    {
      "name": "competitor or alternative brand name",
      "mentionCount": <estimated count>,
      "context": ["context of how they're mentioned — favorably or unfavorably"]
    }
  ],
  "frustrations": [
    {
      "title": "recurring frustration with the company, product, pricing, or support",
      "severity": "low|medium|high|critical",
      "evidenceQuotes": ["exact or near-exact quote"]
    }
  ],
  "opportunities": [
    {
      "problem": "specific problem signal from the data",
      "mentions": <estimated count>,
      "severity": "low|medium|high|critical",
      "opportunity": "strategic opportunity this creates for the company",
      "potentialImpact": "what improving this would mean for the brand or business"
    }
  ],
  "recommendations": [
    {
      "title": "actionable recommendation for the company",
      "why": "why this matters — grounded in the feedback data",
      "evidence": ["supporting data point from feedback"],
      "priority": "low|medium|high|critical",
      "expectedImpact": "expected outcome if this recommendation is acted on"
    }
  ],
  "aiVerdict": "2-3 sentence conclusive verdict: what does the public truly think about ${query}, what is the most important thing they need to change or double down on, and what is the biggest strategic risk or opportunity?"
}

Important rules:
- sentiment must sum to 100
- Include 3-8 items per section where the data supports it
- Be specific — use company/product-specific language, not generic platitudes
- Complaints, frustrations, and praise should reflect what people say about the COMPANY and PRODUCT broadly, not just app bugs
- Feature requests should include business/service improvements, not just UI features
- The AI verdict must be opinionated, direct, and evidence-backed`;

  const responseText = await chatWithFallback(
    [
      {
        role: "system",
        content:
          "You are a product intelligence analyst. You MUST respond with ONLY valid JSON — no markdown fences, no prose, no thinking tags, no commentary. Start your response with '{' and end it with '}'.",
      },
      { role: "user", content: prompt },
    ],
    { temperature: 0.2, maxTokens: 8192, jsonMode: true },
  );

  logger.info("AI response received, parsing");

  const parsed = safeParseJson<{
    executiveSummary: {
      overallSentiment: string;
      mainConcerns: string[];
      biggestOpportunities: string[];
      keyObservations: string[];
    };
    sentiment: { positive: number; neutral: number; negative: number };
    topComplaints: { title: string; mentionCount: number; severity: string; evidenceQuotes: string[] }[];
    customerPraise: { title: string; frequency: number; evidenceQuotes: string[] }[];
    featureRequests: { title: string; frequency: number; estimatedImportance: string; evidenceQuotes: string[] }[];
    competitorMentions: { name: string; mentionCount: number; context: string[] }[];
    frustrations: { title: string; severity: string; evidenceQuotes: string[] }[];
    opportunities: { problem: string; mentions: number; severity: string; opportunity: string; potentialImpact: string }[];
    recommendations: { title: string; why: string; evidence: string[]; priority: string; expectedImpact: string }[];
    aiVerdict: string;
  }>(responseText);

  if (!parsed) {
    throw new Error("Failed to parse AI response as JSON");
  }

  const positiveItems = allItems.filter((i) =>
    ["great", "excellent", "amazing", "love", "good", "best", "awesome", "nice", "happy", "recommend"].some(
      (k) => i.text.toLowerCase().includes(k),
    ),
  );
  const negativeItems = allItems.filter((i) =>
    ["bad", "terrible", "worst", "hate", "broken", "crash", "slow", "expensive", "issue", "problem", "fail", "complaint", "frustrat"].some(
      (k) => i.text.toLowerCase().includes(k),
    ),
  );

  const report: AnalysisReport = {
    id: `${query.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`,
    query,
    createdAt: new Date().toISOString(),
    dataSourceStats: {
      ...stats,
      totalDataPoints: stats.redditPosts + stats.redditComments + stats.playStoreReviews,
    },
    executiveSummary: parsed.executiveSummary ?? {
      overallSentiment: "Insufficient data",
      mainConcerns: [],
      biggestOpportunities: [],
      keyObservations: [],
    },
    sentiment: {
      positive: Math.min(100, Math.max(0, parsed.sentiment?.positive ?? 50)),
      neutral: Math.min(100, Math.max(0, parsed.sentiment?.neutral ?? 30)),
      negative: Math.min(100, Math.max(0, parsed.sentiment?.negative ?? 20)),
    },
    topComplaints: (parsed.topComplaints ?? []).map((c) => ({
      title: c.title,
      mentionCount: c.mentionCount,
      severity: c.severity,
      evidence: toEvidenceItems(
        negativeItems.filter((i) =>
          c.evidenceQuotes?.some((q) => i.text.toLowerCase().includes(q.slice(0, 30).toLowerCase())),
        ).concat(negativeItems).slice(0, 3),
        3,
      ),
    })),
    customerPraise: (parsed.customerPraise ?? []).map((p) => ({
      title: p.title,
      frequency: p.frequency,
      evidence: toEvidenceItems(
        positiveItems.filter((i) =>
          p.evidenceQuotes?.some((q) => i.text.toLowerCase().includes(q.slice(0, 30).toLowerCase())),
        ).concat(positiveItems).slice(0, 3),
        3,
      ),
    })),
    featureRequests: (parsed.featureRequests ?? []).map((f) => ({
      title: f.title,
      frequency: f.frequency,
      estimatedImportance: f.estimatedImportance,
      evidence: toEvidenceItems(
        allItems.filter((i) =>
          f.evidenceQuotes?.some((q) => i.text.toLowerCase().includes(q.slice(0, 30).toLowerCase())),
        ).slice(0, 3),
        3,
      ),
    })),
    competitorMentions: parsed.competitorMentions ?? [],
    frustrations: (parsed.frustrations ?? []).map((fr) => ({
      title: fr.title,
      severity: fr.severity,
      evidence: toEvidenceItems(
        negativeItems.filter((i) =>
          fr.evidenceQuotes?.some((q) => i.text.toLowerCase().includes(q.slice(0, 30).toLowerCase())),
        ).concat(negativeItems).slice(0, 3),
        3,
      ),
    })),
    opportunities: parsed.opportunities ?? [],
    recommendations: parsed.recommendations ?? [],
    aiVerdict: parsed.aiVerdict ?? "Insufficient data to generate a verdict.",
  };

  return report;
}
