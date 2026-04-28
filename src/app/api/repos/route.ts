import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") || "design system";
  const license = searchParams.get("license");
  const language = searchParams.get("language");
  const sort = searchParams.get("sort") || "stars";
  const page = searchParams.get("page") || "1";

  let query = q;
  if (license) query += ` license:${license}`;
  if (language) query += ` language:${language}`;

  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "30");
  url.searchParams.set("page", page);

  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;

  try {
    const res = await fetch(url.toString(), {
      headers,
      next: { revalidate: 300 },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
