import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/[*_~]/g, "")
    .replace(/\n{3,}/g, "\n\n")
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
    return NextResponse.json({ error: "Repo not found" }, { status: 404 });
  }

  const repoData = await repoRes.value.json();

  let readme = "";
  if (readmeRes.status === "fulfilled" && readmeRes.value.ok) {
    const raw = await readmeRes.value.text();
    readme = stripMarkdown(raw).slice(0, 700);
  }

  return NextResponse.json({ ...repoData, readme });
}
