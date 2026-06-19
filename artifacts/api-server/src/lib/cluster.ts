import type { RedditPost } from "./reddit";
import type { PlayStoreApp } from "./playstore";

export interface FeedbackItem {
  text: string;
  source: "reddit" | "playstore";
  url: string | null;
  date: string | null;
  subreddit: string | null;
  rating: number | null;
  score: number;
}

export interface FeedbackCluster {
  category: string;
  items: FeedbackItem[];
  totalMentions: number;
}

function extractDate(utc: number): string {
  return new Date(utc * 1000).toISOString();
}

function simpleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

export function normalizeFeedback(
  redditPosts: RedditPost[],
  playStoreApps: PlayStoreApp[],
): FeedbackItem[] {
  const items: FeedbackItem[] = [];
  const seenTexts = new Set<string>();

  for (const post of redditPosts) {
    const texts: string[] = [];
    if (post.selftext && post.selftext.length > 20) texts.push(post.selftext);
    if (post.title && post.title.length > 10) texts.push(post.title);

    for (const text of texts) {
      const key = text.slice(0, 80);
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      items.push({
        text: text.slice(0, 1000),
        source: "reddit",
        url: post.permalink,
        date: extractDate(post.created_utc),
        subreddit: post.subreddit,
        rating: null,
        score: post.score,
      });
    }

    for (const comment of post.comments) {
      if (!comment.body || comment.body.length < 20) continue;
      const key = comment.body.slice(0, 80);
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      items.push({
        text: comment.body.slice(0, 1000),
        source: "reddit",
        url: comment.permalink,
        date: extractDate(comment.created_utc),
        subreddit: post.subreddit,
        rating: null,
        score: comment.score,
      });
    }
  }

  for (const app of playStoreApps) {
    for (const review of app.reviews) {
      if (!review.text || review.text.length < 10) continue;
      const key = review.text.slice(0, 80);
      if (seenTexts.has(key)) continue;
      seenTexts.add(key);
      items.push({
        text: review.text.slice(0, 1000),
        source: "playstore",
        url: null,
        date: review.date,
        subreddit: null,
        rating: review.score,
        score: review.thumbsUp,
      });
    }
  }

  return items;
}

export function clusterFeedback(items: FeedbackItem[]): string {
  const COMPLAINT_KEYWORDS = [
    "bad", "terrible", "awful", "broken", "bug", "crash", "slow", "expensive",
    "expensive", "price", "cost", "delay", "late", "wait", "support", "refund",
    "disappointed", "poor", "worst", "hate", "useless", "scam", "fraud",
    "issue", "problem", "error", "fail", "wrong", "complaint", "frustrat",
    "annoying", "glitch", "freeze", "not working",
  ];
  const PRAISE_KEYWORDS = [
    "great", "excellent", "amazing", "love", "perfect", "best", "awesome",
    "fantastic", "good", "nice", "wonderful", "helpful", "recommend", "happy",
    "satisfied", "quality", "smooth", "easy", "fast", "reliable", "affordable",
  ];
  const REQUEST_KEYWORDS = [
    "wish", "want", "need", "should", "could", "feature", "add", "improve",
    "please", "request", "suggestion", "would be", "hope", "expect", "missing",
    "lack", "unable to",
  ];

  const complaints = items.filter((i) =>
    COMPLAINT_KEYWORDS.some((k) => i.text.toLowerCase().includes(k)),
  );
  const praises = items.filter((i) =>
    PRAISE_KEYWORDS.some((k) => i.text.toLowerCase().includes(k)),
  );
  const requests = items.filter((i) =>
    REQUEST_KEYWORDS.some((k) => i.text.toLowerCase().includes(k)),
  );
  const neutral = items.filter(
    (i) =>
      !COMPLAINT_KEYWORDS.some((k) => i.text.toLowerCase().includes(k)) &&
      !PRAISE_KEYWORDS.some((k) => i.text.toLowerCase().includes(k)),
  );

  const positiveCount = praises.length;
  const negativeCount = complaints.length;
  const neutralCount = neutral.length + requests.length;
  const total = items.length;

  const positivePct = total > 0 ? Math.round((positiveCount / total) * 100) : 0;
  const negativePct = total > 0 ? Math.round((negativeCount / total) * 100) : 0;
  const neutralPct = 100 - positivePct - negativePct;

  const sample = (arr: FeedbackItem[], n: number) =>
    arr
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map((i) => `- [${i.source}${i.rating ? ` ★${i.rating}` : ""}] ${i.text.slice(0, 200)}`)
      .join("\n");

  return `FEEDBACK SUMMARY FOR AI ANALYSIS
Total data points: ${total} (${positiveCount} positive, ${negativeCount} negative, ${neutralCount} neutral/requests)

Estimated sentiment: ${positivePct}% positive, ${neutralPct}% neutral, ${negativePct}% negative

TOP COMPLAINT SAMPLES (${complaints.length} total):
${sample(complaints, 30)}

TOP PRAISE SAMPLES (${praises.length} total):
${sample(praises, 20)}

FEATURE REQUEST SAMPLES (${requests.length} total):
${sample(requests, 20)}

NEUTRAL/CONTEXT SAMPLES (${neutral.length} total):
${sample(neutral, 15)}
`;
}

export function deduplicateItems(items: FeedbackItem[]): FeedbackItem[] {
  const result: FeedbackItem[] = [];
  for (const item of items) {
    const isDuplicate = result.some(
      (r) => simpleSimilarity(r.text, item.text) > 0.7,
    );
    if (!isDuplicate) result.push(item);
  }
  return result;
}
