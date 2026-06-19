/**
 * Reddit data source — uses Arctic Shift (photon-reddit.com) which provides
 * Reddit post/comment archives via a public API. We search product subreddits
 * (e.g. r/spotify for "Spotify") to get real Reddit discussions.
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
  link_id?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
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

async function fetchSubredditPosts(subreddit: string, limit = 100): Promise<ArcticPost[]> {
  const url = `${ARCTIC_BASE}/posts/search?subreddit=${subreddit}&limit=${limit}`;
  const data = await fetchJson<{ data: ArcticPost[] }>(url);
  return data?.data ?? [];
}

async function fetchSubredditComments(subreddit: string, limit = 200): Promise<ArcticComment[]> {
  const url = `${ARCTIC_BASE}/comments/search?subreddit=${subreddit}&limit=${limit}`;
  const data = await fetchJson<{ data: ArcticComment[] }>(url);
  return data?.data ?? [];
}

export async function collectRedditData(query: string): Promise<RedditPost[]> {
  logger.info({ query }, "Collecting Reddit data via Arctic Shift");

  const base = toSubredditName(query);
  // Try the main subreddit name and common variants (e.g. r/spotify, r/notionapp, r/uberdrivers)
  const candidates = [base, `${base}app`, `${base}official`, `${base}mobile`];

  // Try each candidate subreddit and use the first that returns posts
  let posts: ArcticPost[] = [];
  let comments: ArcticComment[] = [];
  let foundSubreddit = "";

  for (const sub of candidates) {
    const [p, c] = await Promise.all([
      fetchSubredditPosts(sub, 100),
      fetchSubredditComments(sub, 200),
    ]);
    if (p.length > 0 || c.length > 0) {
      posts = p;
      comments = c;
      foundSubreddit = sub;
      logger.info({ subreddit: sub, posts: p.length, comments: c.length }, "Found Reddit subreddit");
      break;
    }
  }

  if (posts.length === 0 && comments.length === 0) {
    logger.warn({ query, candidates }, "No Reddit subreddit found via Arctic Shift");
    return [];
  }

  // Build a map of posts
  const postMap = new Map<string, RedditPost>();
  for (const p of posts) {
    if (!p.id) continue;
    postMap.set(p.id, {
      id: p.id,
      title: p.title ?? "",
      selftext: p.selftext ?? "",
      url: p.url ?? `${REDDIT_BASE}/r/${foundSubreddit}`,
      permalink: p.permalink ? `${REDDIT_BASE}${p.permalink}` : `${REDDIT_BASE}/r/${foundSubreddit}/comments/${p.id}`,
      subreddit: p.subreddit ?? foundSubreddit,
      score: p.score ?? 0,
      created_utc: p.created_utc ?? 0,
      num_comments: p.num_comments ?? 0,
      comments: [],
    });
  }

  // Attach comments to their parent posts
  const orphanPost: RedditPost = {
    id: `reddit-orphans-${query}`,
    title: `r/${foundSubreddit} community discussion`,
    selftext: "",
    url: `${REDDIT_BASE}/r/${foundSubreddit}`,
    permalink: `${REDDIT_BASE}/r/${foundSubreddit}`,
    subreddit: foundSubreddit,
    score: 0,
    created_utc: Date.now() / 1000,
    num_comments: comments.length,
    comments: [],
  };

  for (const c of comments) {
    if (!c.body || c.body.length < 15 || c.body === "[deleted]" || c.body === "[removed]") continue;
    const comment: RedditComment = {
      id: c.id,
      body: c.body,
      score: c.score ?? 0,
      created_utc: c.created_utc ?? 0,
      permalink: c.permalink ? `${REDDIT_BASE}${c.permalink}` : `${REDDIT_BASE}/r/${foundSubreddit}`,
    };
    // link_id is "t3_POSTID" format
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
    subreddit: foundSubreddit,
    posts: postMap.size,
    totalComments: comments.length,
    totalPosts: result.length,
  }, "Reddit data collected via Arctic Shift");

  return result;
}
