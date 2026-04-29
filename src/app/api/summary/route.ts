import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function cleanReadme(text: string): string {
  return text
    // Strip HTML img tags (often huge banner images)
    .replace(/<img[^>]*\/?>/gi, "")
    // Strip <p align="center"> wrappers and other HTML
    .replace(/<\/?(?:p|div|center|br|hr|table|tr|td|th|thead|tbody|a)[^>]*>/gi, "")
    // Strip badge images from common badge services
    .replace(
      /!\[[^\]]*\]\(https?:\/\/(?:img\.shields\.io|badgen\.net|badge\.fury\.io|travis-ci\.[a-z]+|circleci\.com|github\.com\/[^/]+\/[^/]+\/(?:workflows|actions))[^)]*\)/gi,
      ""
    )
    // Strip standalone HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // Collapse 4+ newlines into 2
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json({ error: "Missing owner or repo" }, { status: 400 });
  }

  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
  };
  if (GITHUB_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;

  const [repoRes, readmeRes] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: { ...headers, Accept: "application/vnd.github.v3.raw" },
    }),
  ]);

  if (repoRes.status === "rejected" || !repoRes.value.ok) {
    if (repoRes.status === "fulfilled" && repoRes.value.status === 403) {
      return NextResponse.json(
        { error: "GitHub rate limit reached. Add a GITHUB_TOKEN." },
        { status: 429 }
      );
    }
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const repoData = await repoRes.value.json();

  let readme = "";
  if (readmeRes.status === "fulfilled" && readmeRes.value.ok) {
    const raw = await readmeRes.value.text();
    readme = cleanReadme(raw).slice(0, 4000);
  }

  return NextResponse.json({ ...repoData, readme });
}
