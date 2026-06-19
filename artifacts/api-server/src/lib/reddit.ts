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

const REDDIT_BASE = "https://www.reddit.com";
const SEARCH_VARIATIONS = [
  "{query}",
  "{query} review",
  "{query} experience",
  "{query} complaint",
  "{query} issue",
  "{query} alternative",
  "{query} vs",
];

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "SignalOS/1.0 (product intelligence platform)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function searchReddit(query: string, limit = 25): Promise<RedditPost[]> {
  const encoded = encodeURIComponent(query);
  const url = `${REDDIT_BASE}/search.json?q=${encoded}&type=link&limit=${limit}&sort=relevance&t=year`;

  const data = await fetchJson<{
    data: { children: { data: Record<string, unknown> }[] };
  }>(url);

  if (!data?.data?.children) return [];

  return data.data.children.map((child) => {
    const d = child.data;
    return {
      id: String(d.id ?? ""),
      title: String(d.title ?? ""),
      selftext: String(d.selftext ?? ""),
      url: String(d.url ?? ""),
      permalink: `${REDDIT_BASE}${d.permalink ?? ""}`,
      subreddit: String(d.subreddit ?? ""),
      score: Number(d.score ?? 0),
      created_utc: Number(d.created_utc ?? 0),
      num_comments: Number(d.num_comments ?? 0),
      comments: [],
    };
  });
}

async function fetchComments(permalink: string): Promise<RedditComment[]> {
  const url = `${permalink.replace(/\/$/, "")}.json?limit=50&sort=top&depth=1`;
  const data = await fetchJson<unknown[]>(url);

  if (!Array.isArray(data) || data.length < 2) return [];

  const commentTree = (
    data[1] as { data: { children: { data: Record<string, unknown>; kind: string }[] } }
  ).data?.children;
  if (!Array.isArray(commentTree)) return [];

  return commentTree
    .filter((c) => c.kind === "t1" && c.data.body && c.data.body !== "[deleted]")
    .slice(0, 10)
    .map((c) => ({
      id: String(c.data.id ?? ""),
      body: String(c.data.body ?? ""),
      score: Number(c.data.score ?? 0),
      created_utc: Number(c.data.created_utc ?? 0),
      permalink: `${REDDIT_BASE}${c.data.permalink ?? ""}`,
    }));
}

export async function collectRedditData(query: string): Promise<RedditPost[]> {
  logger.info({ query }, "Collecting Reddit data");

  const allPosts: RedditPost[] = [];
  const seenIds = new Set<string>();

  const searchTerms = SEARCH_VARIATIONS.map((v) =>
    v.replace("{query}", query),
  ).slice(0, 4);

  const searchResults = await Promise.all(
    searchTerms.map((term) => searchReddit(term, 20)),
  );

  for (const posts of searchResults) {
    for (const post of posts) {
      if (!seenIds.has(post.id)) {
        seenIds.add(post.id);
        allPosts.push(post);
      }
    }
  }

  logger.info({ count: allPosts.length }, "Found Reddit posts, fetching comments");

  const topPosts = allPosts
    .filter((p) => p.num_comments > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  await Promise.all(
    topPosts.map(async (post) => {
      post.comments = await fetchComments(post.permalink);
    }),
  );

  logger.info({ posts: allPosts.length }, "Reddit data collected");
  return allPosts;
}
