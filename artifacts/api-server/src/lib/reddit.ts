/**
 * Community discussions data source — uses Hacker News (Algolia API).
 * Reddit blocks Replit's egress IPs (403), so HN is used as the
 * primary community discussion source.
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

const HN_BASE = "https://hn.algolia.com/api/v1";
const ONE_YEAR_AGO = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;

interface HNHit {
  objectID: string;
  title?: string;
  story_text?: string;
  comment_text?: string;
  url?: string;
  author?: string;
  created_at_i?: number;
  points?: number;
  num_comments?: number;
  story_id?: number;
  story_title?: string;
  story_url?: string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function searchHN(query: string, tags: string, hitsPerPage = 30): Promise<HNHit[]> {
  const encoded = encodeURIComponent(query);
  const url = `${HN_BASE}/search?query=${encoded}&tags=${tags}&hitsPerPage=${hitsPerPage}&numericFilters=created_at_i%3E${ONE_YEAR_AGO}`;
  const data = await fetchJson<{ hits: HNHit[] }>(url);
  return data?.hits ?? [];
}

async function searchHNAll(query: string, hitsPerPage = 30): Promise<HNHit[]> {
  const encoded = encodeURIComponent(query);
  const url = `${HN_BASE}/search?query=${encoded}&hitsPerPage=${hitsPerPage}&numericFilters=created_at_i%3E${ONE_YEAR_AGO}`;
  const data = await fetchJson<{ hits: HNHit[] }>(url);
  return data?.hits ?? [];
}

export async function collectRedditData(query: string): Promise<RedditPost[]> {
  logger.info({ query }, "Collecting community discussion data (Hacker News)");

  const searchTerms = [query, `${query} review`, `${query} experience`, `${query} alternative`];

  const [stories, comments, ...moreResults] = await Promise.all([
    searchHN(query, "story", 30),
    searchHN(query, "comment", 50),
    ...searchTerms.slice(1).map((term) => searchHNAll(term, 15)),
  ]);

  const allHits: HNHit[] = [...(stories ?? []), ...(comments ?? [])];
  for (const hits of moreResults) allHits.push(...hits);

  // Deduplicate by objectID
  const seen = new Set<string>();
  const unique = allHits.filter((h) => {
    if (seen.has(h.objectID)) return false;
    seen.add(h.objectID);
    return true;
  });

  // Convert stories into RedditPost format
  const storyHits = unique.filter((h) => h.title || h.story_text);
  const commentHits = unique.filter((h) => h.comment_text && !h.title);

  // Group comments under their parent story
  const storyMap = new Map<string, RedditPost>();

  for (const hit of storyHits) {
    const text = hit.story_text ?? "";
    if (!hit.title && text.length < 20) continue;

    const post: RedditPost = {
      id: hit.objectID,
      title: hit.title ?? "(no title)",
      selftext: text,
      url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
      permalink: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      subreddit: "HackerNews",
      score: hit.points ?? 0,
      created_utc: hit.created_at_i ?? 0,
      num_comments: hit.num_comments ?? 0,
      comments: [],
    };
    storyMap.set(hit.objectID, post);
  }

  // Create a catch-all post for orphaned comments
  const orphanPost: RedditPost = {
    id: `hn-comments-${query}`,
    title: `HN community discussion: ${query}`,
    selftext: "",
    url: `https://news.ycombinator.com/search?q=${encodeURIComponent(query)}`,
    permalink: `https://news.ycombinator.com/search?q=${encodeURIComponent(query)}`,
    subreddit: "HackerNews",
    score: 0,
    created_utc: Date.now() / 1000,
    num_comments: commentHits.length,
    comments: [],
  };

  for (const hit of commentHits) {
    const body = hit.comment_text ?? "";
    if (body.length < 20) continue;

    const comment: RedditComment = {
      id: hit.objectID,
      body: body.replace(/<[^>]+>/g, " ").trim(), // strip HTML tags
      score: hit.points ?? 0,
      created_utc: hit.created_at_i ?? 0,
      permalink: `https://news.ycombinator.com/item?id=${hit.objectID}`,
    };

    // Try to attach to parent story, otherwise go to orphan post
    const storyId = String(hit.story_id ?? "");
    const parent = storyMap.get(storyId);
    if (parent) {
      parent.comments.push(comment);
    } else {
      orphanPost.comments.push(comment);
    }
  }

  const posts = [...storyMap.values()];
  if (orphanPost.comments.length > 0) posts.push(orphanPost);

  logger.info({
    stories: storyMap.size,
    orphanComments: orphanPost.comments.length,
    total: posts.length,
  }, "HN data collected");

  return posts;
}
