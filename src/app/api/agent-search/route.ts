import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const PARSE_SYSTEM = `You parse natural-language GitHub repo searches into structured query parameters.

Output ONLY valid JSON, no other text. Schema:
{
  "keywords": "string (core search terms — keep it short, 1-4 words)",
  "language": "string|null (e.g. TypeScript, Python, Rust, Go, JavaScript, CSS)",
  "license": "string|null (mit, apache-2.0, gpl-3.0, bsd-2-clause)",
  "topics": ["string"] (specific GitHub topic tags, lowercase, hyphen-separated),
  "min_stars": "number|null",
  "max_age_days": "number|null (recency for last push)",
  "reasoning": "string (one short sentence: how you interpreted the query)"
}

Heuristics:
- "actively maintained" → max_age_days: 90
- "popular" → min_stars: 1000
- "well-known" or "battle-tested" → min_stars: 5000
- "new" or "recent" or "trending" → max_age_days: 180
- Be conservative — only set filters that are explicit or strongly implied. When in doubt, leave null.
- Keywords should be the essential noun phrase (e.g. "animation library", "form validation").`;

const RANK_SYSTEM = `You rank GitHub repos by how well they match a user's intent.

Output ONLY valid JSON:
{
  "ranked": [
    { "i": <index>, "why": "<one short line: why this is a great match>" }
  ]
}

Rules:
- Up to 12 results, sorted best-match first.
- Skip repos that are clearly off-topic — quality over quantity.
- Look beyond keyword matching: consider stars, recency, language, license, and topic alignment.
- "lightweight" → prefer smaller, simpler repos.
- "production-ready" → prefer popular, well-maintained.
- "modern" → prefer recent, TypeScript, current frameworks.
- The "why" line should be specific (e.g. "5.2k stars, MIT, last push 2 weeks ago, headless React"), not generic.`;

type ParsedQuery = {
  keywords: string;
  language: string | null;
  license: string | null;
  topics: string[];
  min_stars: number | null;
  max_age_days: number | null;
  reasoning: string;
};

function extractJson(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      {
        error:
          "ANTHROPIC_API_KEY is not set. Add it in Vercel project settings → Environment Variables and redeploy to enable Smart Search.",
      },
      { status: 503 }
    );
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const client = new Anthropic();

  // ── Step 1: parse natural language → structured search params ────────────
  let parsed: ParsedQuery;
  try {
    const parseResp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: [
        {
          type: "text",
          text: PARSE_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: query }],
    });

    const block = parseResp.content.find((b) => b.type === "text");
    const text = block && "text" in block ? block.text : "{}";
    parsed = JSON.parse(extractJson(text));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is invalid" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Failed to parse query with AI" },
      { status: 500 }
    );
  }

  // ── Step 2: build a GitHub search query string ────────────────────────────
  let q = parsed.keywords || query;
  if (parsed.language) q += ` language:${parsed.language}`;
  if (parsed.license) q += ` license:${parsed.license}`;
  if (parsed.topics?.length) {
    q += " " + parsed.topics.map((t) => `topic:${t}`).join(" ");
  }
  if (parsed.min_stars && parsed.min_stars > 0) {
    q += ` stars:>${parsed.min_stars}`;
  }
  if (parsed.max_age_days && parsed.max_age_days > 0) {
    const since = new Date(Date.now() - parsed.max_age_days * 86400000)
      .toISOString()
      .split("T")[0];
    q += ` pushed:>${since}`;
  }

  // ── Step 3: search GitHub ────────────────────────────────────────────────
  const ghHeaders: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) ghHeaders["Authorization"] = `Bearer ${GITHUB_TOKEN}`;

  const ghUrl = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`;
  const ghRes = await fetch(ghUrl, { headers: ghHeaders });

  if (!ghRes.ok) {
    if (ghRes.status === 403) {
      return NextResponse.json(
        {
          error: "GitHub rate limit reached. Add a GITHUB_TOKEN env var for 5000 req/hour.",
        },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `GitHub search failed (${ghRes.status})` },
      { status: 502 }
    );
  }

  const ghData = await ghRes.json();
  const items = (ghData.items || []) as Array<Record<string, unknown>>;

  if (items.length === 0) {
    return NextResponse.json({
      items: [],
      interpretation: parsed,
      query: q,
      reasoning: {},
    });
  }

  // ── Step 4: rank with AI ──────────────────────────────────────────────────
  let rankedItems = items;
  const reasoning: Record<number, string> = {};

  try {
    const repoSummary = items
      .slice(0, 30)
      .map((r, i) => {
        const license = (r.license as { spdx_id?: string } | null)?.spdx_id || "no license";
        const topics = ((r.topics as string[]) || []).slice(0, 6).join(", ");
        const desc = ((r.description as string) || "").slice(0, 140);
        return `${i}. ${r.full_name} (★${r.stargazers_count}, ${r.language || "?"}, ${license}) — ${desc} [${topics}]`;
      })
      .join("\n");

    const rankResp = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: [
        {
          type: "text",
          text: RANK_SYSTEM,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Original query: "${query}"\n\nRepos:\n${repoSummary}\n\nRank up to 12 by relevance.`,
        },
      ],
    });

    const block = rankResp.content.find((b) => b.type === "text");
    const text = block && "text" in block ? block.text : "{}";
    const rankData = JSON.parse(extractJson(text)) as {
      ranked?: Array<{ i: number; why: string }>;
    };

    if (Array.isArray(rankData.ranked)) {
      const newItems: typeof items = [];
      for (const r of rankData.ranked) {
        const item = items[r.i];
        if (item) {
          newItems.push(item);
          reasoning[item.id as number] = r.why;
        }
      }
      if (newItems.length > 0) rankedItems = newItems;
    }
  } catch {
    // Ranking failed — fall back to GitHub's default order, no reasoning shown
  }

  return NextResponse.json({
    items: rankedItems,
    interpretation: parsed,
    query: q,
    reasoning,
  });
}
