/**
 * Web review sources — G2, Capterra, TrustRadius, Product Hunt.
 * All are best-effort scrapers: they fail gracefully and return empty arrays
 * rather than crashing the analysis pipeline. Reviews are mapped to the shared
 * FeedbackItem format with `subreddit` set to the platform name.
 */
import type { FeedbackItem } from "./cluster";
import { logger } from "./logger";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const JSON_HEADERS = {
  "User-Agent": BROWSER_HEADERS["User-Agent"],
  Accept: "application/json, */*",
  "Content-Type": "application/json",
};

async function fetchHtml(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function toSlug(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Extract reviews from HTML pages that embed data in a <script id="__NEXT_DATA__"> tag.
 * Returns raw objects from the embedded JSON, or null if not found.
 */
function extractNextData(html: string): unknown {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Extract schema.org Review items from JSON-LD blocks in HTML.
 */
function extractJsonLdReviews(html: string): { reviewBody?: string; ratingValue?: number; datePublished?: string }[] {
  const results: { reviewBody?: string; ratingValue?: number; datePublished?: string }[] = [];
  const scriptRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const items: unknown[] = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const obj = item as Record<string, unknown>;
        if (obj["@type"] === "Review" || obj["@type"] === "UserReview") {
          results.push({
            reviewBody: obj.reviewBody as string | undefined,
            ratingValue: (obj.reviewRating as Record<string, number> | undefined)?.ratingValue,
            datePublished: obj.datePublished as string | undefined,
          });
        }
        // Handle aggregate/itemList
        if (obj.review && Array.isArray(obj.review)) {
          for (const r of obj.review as Record<string, unknown>[]) {
            results.push({
              reviewBody: r.reviewBody as string | undefined,
              ratingValue: (r.reviewRating as Record<string, number> | undefined)?.ratingValue,
              datePublished: r.datePublished as string | undefined,
            });
          }
        }
      }
    } catch { /* skip */ }
  }
  return results;
}

function makeItem(text: string, platform: string, url: string | null, rating: number | null, date: string | null): FeedbackItem {
  return {
    text: text.slice(0, 1000),
    source: "community",
    url,
    date,
    subreddit: platform,
    rating,
    score: 0,
  };
}

// ─── G2 ──────────────────────────────────────────────────────────────────────

async function collectG2Reviews(query: string): Promise<FeedbackItem[]> {
  const slug = toSlug(query);
  const url = `https://www.g2.com/products/${slug}/reviews`;
  const html = await fetchHtml(url);
  if (!html) {
    logger.debug({ query }, "G2 reviews page not accessible");
    return [];
  }

  const reviews: FeedbackItem[] = [];

  // Strategy 1: JSON-LD
  const jsonLd = extractJsonLdReviews(html);
  for (const r of jsonLd) {
    if (r.reviewBody && r.reviewBody.length > 20) {
      reviews.push(makeItem(r.reviewBody, "G2", url, r.ratingValue ?? null, r.datePublished ?? null));
    }
  }

  // Strategy 2: __NEXT_DATA__
  if (reviews.length === 0) {
    const next = extractNextData(html);
    const pageProps = (next as Record<string, unknown> | null)?.props as Record<string, unknown> | undefined;
    const reviewData = pageProps?.pageProps as Record<string, unknown> | undefined;
    const list = reviewData?.reviews as unknown[] | undefined ?? reviewData?.reviewData as unknown[] | undefined;
    if (Array.isArray(list)) {
      for (const r of list.slice(0, 40)) {
        const obj = r as Record<string, unknown>;
        const body = (obj.body as string) || (obj.review_body as string) || (obj.text as string) || "";
        if (body.length > 20) {
          reviews.push(makeItem(body, "G2", url, obj.rating ? Number(obj.rating) : null, null));
        }
      }
    }
  }

  // Strategy 3: regex fallback — look for review text blocks
  if (reviews.length === 0) {
    const reviewRe = /"review_body"\s*:\s*"([^"]{40,500})"/g;
    let m: RegExpExecArray | null;
    while ((m = reviewRe.exec(html)) !== null && reviews.length < 30) {
      reviews.push(makeItem(m[1], "G2", url, null, null));
    }
  }

  logger.info({ platform: "G2", query, count: reviews.length }, "G2 reviews collected");
  return reviews.slice(0, 40);
}

// ─── Capterra ────────────────────────────────────────────────────────────────

async function collectCapterraReviews(query: string): Promise<FeedbackItem[]> {
  const slug = toSlug(query);

  // Try search to find the product URL
  const searchHtml = await fetchHtml(`https://www.capterra.com/search/?query=${encodeURIComponent(query)}`);
  let productUrl: string | null = null;

  if (searchHtml) {
    // Look for a capterra product link in search results
    const linkRe = /href="(\/p\/[^"]+\/reviews\/?[^"]*)"/;
    const lm = linkRe.exec(searchHtml);
    if (lm) {
      productUrl = `https://www.capterra.com${lm[1]}`;
    }
  }

  if (!productUrl) {
    productUrl = `https://www.capterra.com/p/1/${slug}/reviews/`;
  }

  const html = await fetchHtml(productUrl);
  if (!html) {
    logger.debug({ query }, "Capterra reviews page not accessible");
    return [];
  }

  const reviews: FeedbackItem[] = [];

  const jsonLd = extractJsonLdReviews(html);
  for (const r of jsonLd) {
    if (r.reviewBody && r.reviewBody.length > 20) {
      reviews.push(makeItem(r.reviewBody, "Capterra", productUrl, r.ratingValue ?? null, r.datePublished ?? null));
    }
  }

  if (reviews.length === 0) {
    // Regex: look for common review patterns
    const bodyRe = /"(?:reviewBody|review_body|body|comment)"\s*:\s*"([^"]{40,600})"/g;
    let m: RegExpExecArray | null;
    while ((m = bodyRe.exec(html)) !== null && reviews.length < 30) {
      reviews.push(makeItem(m[1], "Capterra", productUrl, null, null));
    }
  }

  logger.info({ platform: "Capterra", query, count: reviews.length }, "Capterra reviews collected");
  return reviews.slice(0, 40);
}

// ─── TrustRadius ─────────────────────────────────────────────────────────────

async function collectTrustRadiusReviews(query: string): Promise<FeedbackItem[]> {
  const GQL = "https://www.trustradius.com/gql";

  // First: search for the product
  const searchPayload = JSON.stringify({
    operationName: "ProductSearch",
    variables: { query, first: 3 },
    query: `query ProductSearch($query: String!, $first: Int) {
      productSearch(query: $query, first: $first) {
        edges { node { id name slug } }
      }
    }`,
  });

  let slug: string | null = null;
  try {
    const searchRes = await fetch(GQL, {
      method: "POST",
      headers: { ...JSON_HEADERS, Origin: "https://www.trustradius.com", Referer: "https://www.trustradius.com/" },
      body: searchPayload,
      signal: AbortSignal.timeout(12000),
    });
    if (searchRes.ok) {
      const data = await searchRes.json() as Record<string, unknown>;
      const edges = ((data.data as Record<string, unknown>)?.productSearch as Record<string, unknown>)?.edges as { node: { slug: string } }[] | undefined;
      slug = edges?.[0]?.node?.slug ?? null;
    }
  } catch { /* ignore */ }

  // Fallback to direct slug guess
  if (!slug) slug = toSlug(query);

  // Now fetch reviews via GraphQL
  const reviewPayload = JSON.stringify({
    operationName: "ProductReviews",
    variables: { slug, first: 30 },
    query: `query ProductReviews($slug: String!, $first: Int) {
      product(slug: $slug) {
        id name
        reviews(first: $first) {
          edges {
            node {
              body pros cons
              rating
              createdAt
            }
          }
        }
      }
    }`,
  });

  const reviews: FeedbackItem[] = [];
  try {
    const revRes = await fetch(GQL, {
      method: "POST",
      headers: { ...JSON_HEADERS, Origin: "https://www.trustradius.com", Referer: "https://www.trustradius.com/" },
      body: reviewPayload,
      signal: AbortSignal.timeout(12000),
    });
    if (revRes.ok) {
      const data = await revRes.json() as Record<string, unknown>;
      const edges = (((data.data as Record<string, unknown>)?.product as Record<string, unknown>)?.reviews as Record<string, unknown>)?.edges as { node: Record<string, unknown> }[] | undefined;
      for (const edge of (edges ?? [])) {
        const n = edge.node;
        const parts = [n.body as string, n.pros as string, n.cons as string].filter(Boolean);
        const text = parts.join(" ").trim();
        if (text.length > 20) {
          reviews.push(makeItem(text, "TrustRadius", `https://www.trustradius.com/products/${slug}/reviews`, n.rating ? Number(n.rating) : null, n.createdAt as string | null));
        }
      }
    }
  } catch { /* ignore */ }

  if (reviews.length === 0) {
    // Fallback: scrape the HTML page
    const html = await fetchHtml(`https://www.trustradius.com/products/${slug}/reviews`);
    if (html) {
      const jsonLd = extractJsonLdReviews(html);
      for (const r of jsonLd) {
        if (r.reviewBody && r.reviewBody.length > 20) {
          reviews.push(makeItem(r.reviewBody, "TrustRadius", `https://www.trustradius.com/products/${slug}/reviews`, r.ratingValue ?? null, r.datePublished ?? null));
        }
      }
    }
  }

  logger.info({ platform: "TrustRadius", query, count: reviews.length }, "TrustRadius reviews collected");
  return reviews.slice(0, 40);
}

// ─── Product Hunt ─────────────────────────────────────────────────────────────

async function collectProductHuntReviews(query: string): Promise<FeedbackItem[]> {
  const slug = toSlug(query);
  const url = `https://www.producthunt.com/products/${slug}/reviews`;
  const html = await fetchHtml(url);
  if (!html) {
    logger.debug({ query }, "Product Hunt page not accessible");
    return [];
  }

  const reviews: FeedbackItem[] = [];

  // Strategy 1: __NEXT_DATA__
  const next = extractNextData(html);
  if (next) {
    const allText = JSON.stringify(next);
    // Look for review body text embedded in the JSON
    const bodyRe = /"body"\s*:\s*"([^"]{40,600})"/g;
    const sentimentRe = /"(?:sentiment|content|text|review)"\s*:\s*"([^"]{40,600})"/g;

    for (const re of [bodyRe, sentimentRe]) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(allText)) !== null && reviews.length < 40) {
        const text = m[1].replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
        if (text.length > 30 && !reviews.some(r => r.text.slice(0, 50) === text.slice(0, 50))) {
          reviews.push(makeItem(text, "Product Hunt", url, null, null));
        }
      }
    }
  }

  // Strategy 2: JSON-LD
  if (reviews.length === 0) {
    const jsonLd = extractJsonLdReviews(html);
    for (const r of jsonLd) {
      if (r.reviewBody && r.reviewBody.length > 20) {
        reviews.push(makeItem(r.reviewBody, "Product Hunt", url, r.ratingValue ?? null, r.datePublished ?? null));
      }
    }
  }

  logger.info({ platform: "Product Hunt", query, count: reviews.length }, "Product Hunt reviews collected");
  return reviews.slice(0, 40);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function collectReviewSiteData(query: string): Promise<FeedbackItem[]> {
  logger.info({ query }, "Collecting review site data (G2, Capterra, TrustRadius, Product Hunt)");

  const [g2, capterra, trustRadius, productHunt] = await Promise.all([
    collectG2Reviews(query).catch(() => [] as FeedbackItem[]),
    collectCapterraReviews(query).catch(() => [] as FeedbackItem[]),
    collectTrustRadiusReviews(query).catch(() => [] as FeedbackItem[]),
    collectProductHuntReviews(query).catch(() => [] as FeedbackItem[]),
  ]);

  const total = g2.length + capterra.length + trustRadius.length + productHunt.length;
  logger.info({ g2: g2.length, capterra: capterra.length, trustRadius: trustRadius.length, productHunt: productHunt.length, total }, "Review site data collected");

  return [...g2, ...capterra, ...trustRadius, ...productHunt];
}
