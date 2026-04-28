import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") || "design";

  // Repos created in last 30 days sorted by stars = trending signal
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", `${q} created:>${since}`);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "30");

  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;

  try {
    const res = await fetch(url.toString(), {
      headers,
      next: { revalidate: 3600 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
