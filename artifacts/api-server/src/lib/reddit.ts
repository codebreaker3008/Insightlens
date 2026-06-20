/**
 * Reddit data source — uses Arctic Shift (photon-reddit.com) which archives
 * Reddit content. We use TWO strategies:
 *  1. Keyword search across all of Reddit (q=<query>) — catches discussions in
 *     tech, business, consumer, and news subreddits.
 *  2. Product-specific subreddit (r/spotify, r/notion, etc.) — deep community
 *     discussions from the product's own fans and critics.
 *
 * This makes Reddit the primary, broad signal rather than just the app sub.
 */
import { logger } from "./logger";

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  subreddit: string;
  score: number;
  created_utc: number;
  num_comments: number;
  comments: RedditComment[];
}

export interface RedditComment {
  id: string;
  body: string;
  score: number;
  created_utc: number;
  permalink: string;
}

const ARCTIC_BASE = "https://arctic-shift.photon-reddit.com/api";
const REDDIT_BASE = "https://www.reddit.com";

interface ArcticPost {
  id: string;
  title?: string;
  selftext?: string;
  url?: string;
  permalink?: string;
  subreddit?: string;
  score?: number;
  created_utc?: number;
  num_comments?: number;
}

interface ArcticComment {
  id: string;
  body?: string;
  score?: number;
  created_utc?: number;
  permalink?: string;
  subreddit?: string;
  link_id?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      logger.debug({ url, status: res.status }, "Arctic Shift fetch failed");
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    logger.debug({ url, err }, "Arctic Shift fetch error");
    return null;
  }
}

function toSubredditName(query: string): string {
  return query.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9_]/g, "");
}

/** Search posts across ALL of Reddit mentioning the query keyword */
async function fetchKeywordPosts(query: string, limit = 150): Promise<ArcticPost[]> {
  const q = encodeURIComponent(query);
  const url = `${ARCTIC_BASE}/posts/search?q=${q}&limit=${limit}`;
  const data = await fetchJson<{ data: ArcticPost[] }>(url);
  return data?.data ?? [];
}

/** Search comments across ALL of Reddit mentioning the query keyword */
async function fetchKeywordComments(query: string, limit = 250): Promise<ArcticComment[]> {
  const q = encodeURIComponent(query);
  const url = `${ARCTIC_BASE}/comments/search?q=${q}&limit=${limit}`;
  const data = await fetchJson<{ data: ArcticComment[] }>(url);
  return data?.data ?? [];
}

/** Search posts within a specific subreddit */
async function fetchSubredditPosts(subreddit: string, limit = 100): Promise<ArcticPost[]> {
  const url = `${ARCTIC_BASE}/posts/search?subreddit=${subreddit}&limit=${limit}`;
  const data = await fetchJson<{ data: ArcticPost[] }>(url);
  return data?.data ?? [];
}

/** Search comments within a specific subreddit */
async function fetchSubredditComments(subreddit: string, limit = 150): Promise<ArcticComment[]> {
  const url = `${ARCTIC_BASE}/comments/search?subreddit=${subreddit}&limit=${limit}`;
  const data = await fetchJson<{ data: ArcticComment[] }>(url);
  return data?.data ?? [];
}

function buildPost(p: ArcticPost, fallbackSub: string): RedditPost {
  const sub = p.subreddit ?? fallbackSub;
  return {
    id: p.id,
    title: p.title ?? "",
    selftext: p.selftext ?? "",
    url: p.url ?? `${REDDIT_BASE}/r/${sub}`,
    permalink: p.permalink
      ? `${REDDIT_BASE}${p.permalink}`
      : `${REDDIT_BASE}/r/${sub}/comments/${p.id}`,
    subreddit: sub,
    score: p.score ?? 0,
    created_utc: p.created_utc ?? 0,
    num_comments: p.num_comments ?? 0,
    comments: [],
  };
}

export async function collectRedditData(query: string): Promise<RedditPost[]> {
  logger.info({ query }, "Collecting Reddit data via Arctic Shift (keyword + subreddit)");

  const base = toSubredditName(query);
  const subredditCandidates = [base, `${base}app`, `${base}official`, `${base}mobile`];

  // Run keyword-wide search and subreddit candidate checks concurrently
  const [keywordPosts, keywordComments, ...subredditResults] = await Promise.all([
    fetchKeywordPosts(query, 150),
    fetchKeywordComments(query, 250),
    ...subredditCandidates.map((sub) =>
      Promise.all([fetchSubredditPosts(sub, 100), fetchSubredditComments(sub, 150)]).then(
        ([p, c]) => ({ sub, posts: p, comments: c }),
      ),
    ),
  ]);

  // Pick best matching subreddit (first with results)
  let subPosts: ArcticPost[] = [];
  let subComments: ArcticComment[] = [];
  let foundSubreddit = "";

  for (const r of subredditResults) {
    if (r.posts.length > 0 || r.comments.length > 0) {
      subPosts = r.posts;
      subComments = r.comments;
      foundSubreddit = r.sub;
      logger.info({ subreddit: r.sub, posts: r.posts.length, comments: r.comments.length }, "Found Reddit subreddit");
      break;
    }
  }

  // Merge all posts into a map (deduplicate by id)
  const postMap = new Map<string, RedditPost>();

  // Keyword-wide posts first (broadest signal)
  for (const p of keywordPosts) {
    if (!p.id) continue;
    postMap.set(p.id, buildPost(p, "reddit"));
  }

  // Subreddit posts (community deep-dive)
  for (const p of subPosts) {
    if (!p.id || postMap.has(p.id)) continue;
    postMap.set(p.id, buildPost(p, foundSubreddit));
  }

  // Orphan bucket for comments without a matching post
  const orphanPost: RedditPost = {
    id: `reddit-orphans-${query}`,
    title: `Community discussions about ${query}`,
    selftext: "",
    url: `${REDDIT_BASE}/search?q=${encodeURIComponent(query)}`,
    permalink: `${REDDIT_BASE}/search?q=${encodeURIComponent(query)}`,
    subreddit: foundSubreddit || "reddit",
    score: 0,
    created_utc: Date.now() / 1000,
    num_comments: 0,
    comments: [],
  };

  // Attach all comments (keyword-wide + subreddit) to their parent posts
  const allComments = [...keywordComments, ...subComments];
  const seenCommentIds = new Set<string>();

  for (const c of allComments) {
    if (!c.body || c.body.length < 15 || c.body === "[deleted]" || c.body === "[removed]") continue;
    if (seenCommentIds.has(c.id)) continue;
    seenCommentIds.add(c.id);

    const comment: RedditComment = {
      id: c.id,
      body: c.body,
      score: c.score ?? 0,
      created_utc: c.created_utc ?? 0,
      permalink: c.permalink
        ? `${REDDIT_BASE}${c.permalink}`
        : `${REDDIT_BASE}/r/${c.subreddit ?? foundSubreddit}`,
    };

    const postId = c.link_id?.replace(/^t3_/, "");
    const parent = postId ? postMap.get(postId) : undefined;
    if (parent) {
      parent.comments.push(comment);
    } else {
      orphanPost.comments.push(comment);
    }
  }

  const result = [...postMap.values()];
  if (orphanPost.comments.length > 0) result.push(orphanPost);

  logger.info({
    keywordPosts: keywordPosts.length,
    keywordComments: keywordComments.length,
    subreddit: foundSubreddit,
    subredditPosts: subPosts.length,
    subredditComments: subComments.length,
    totalPosts: result.length,
    totalComments: seenCommentIds.size,
  }, "Reddit data collected");

  return result;
}
