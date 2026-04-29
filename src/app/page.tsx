"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Types ──────────────────────────────────────────────────────────────────

type Repo = {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  language: string | null;
  license: { spdx_id: string; name: string } | null;
  topics: string[];
  updated_at: string;
  created_at: string;
  clone_url: string;
  homepage: string | null;
};

type RepoDetail = Repo & { readme?: string };

type AiInterpretation = {
  keywords: string;
  language: string | null;
  license: string | null;
  topics: string[];
  min_stars: number | null;
  max_age_days: number | null;
  reasoning: string;
};

// ── Constants ──────────────────────────────────────────────────────────────

const LANGUAGES = [
  "JavaScript", "TypeScript", "Python", "Rust", "Go",
  "CSS", "Vue", "Swift", "Kotlin", "HTML",
];

const CATEGORIES: Record<string, string[]> = {
  "UI Kit": ["ui-kit", "ui-components", "components", "react-components", "vue-components", "web-components"],
  "Design System": ["design-system", "design-tokens", "storybook", "style-guide"],
  Icons: ["icons", "icon-set", "svg-icons", "icon-font", "icon-library"],
  Animation: ["animation", "motion", "transitions", "css-animation", "lottie"],
  Charts: ["charts", "data-visualization", "graphs", "chart", "d3"],
  CSS: ["css", "tailwind", "scss", "postcss", "css-framework", "utility-css"],
  Figma: ["figma", "figma-plugin", "design-tool"],
  Templates: ["template", "theme", "starter", "boilerplate"],
};

const TECH_STACKS: Record<string, string[]> = {
  React: ["react", "reactjs", "react-hooks", "react-component", "react-native"],
  Vue: ["vue", "vuejs", "vue3", "vue-component"],
  Angular: ["angular", "angularjs"],
  Svelte: ["svelte", "sveltekit"],
  "Next.js": ["nextjs", "next-js", "nextjs14", "nextjs13"],
  Nuxt: ["nuxt", "nuxtjs"],
  Tailwind: ["tailwind", "tailwindcss"],
  TypeScript: ["typescript"],
  "Web Components": ["web-components", "lit", "stencil"],
};

const TECH_COLORS: Record<string, string> = {
  React: "bg-cyan-950 text-cyan-400",
  Vue: "bg-emerald-950 text-emerald-400",
  Angular: "bg-red-950 text-red-400",
  Svelte: "bg-orange-950 text-orange-400",
  "Next.js": "bg-gray-700 text-gray-200",
  Nuxt: "bg-green-950 text-green-400",
  Tailwind: "bg-sky-950 text-sky-400",
  TypeScript: "bg-blue-950 text-blue-400",
  "Web Components": "bg-purple-950 text-purple-400",
};

const LANG_COLORS: Record<string, string> = {
  JavaScript: "#f7df1e",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  CSS: "#563d7c",
  Vue: "#41b883",
  Swift: "#FA7343",
  Kotlin: "#A97BFF",
  HTML: "#e34c26",
};

const AI_EXAMPLES = [
  "lightweight react animation library, MIT licensed, actively maintained",
  "modern python web framework with async support",
  "rust cli tool for fuzzy file search",
  "vue 3 component library with dark mode and tailwind",
  "open source alternative to Notion",
];

// ── Helpers ────────────────────────────────────────────────────────────────

function detectCategory(repo: Repo): string {
  const topics = repo.topics || [];
  const text = `${repo.name} ${repo.description || ""}`.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORIES)) {
    if (keywords.some((k) => topics.includes(k) || text.includes(k))) return cat;
  }
  return "Other";
}

function detectTechStack(repo: Repo): string[] {
  const topics = repo.topics || [];
  const text = `${repo.name} ${repo.description || ""}`.toLowerCase();
  return Object.entries(TECH_STACKS)
    .filter(([, keywords]) => keywords.some((k) => topics.includes(k) || text.includes(k)))
    .map(([tech]) => tech)
    .slice(0, 3);
}

function daysSince(dateStr: string): number {
  return Math.max(1, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function velocityOf(repo: Repo): number {
  return repo.stargazers_count / daysSince(repo.created_at);
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function fmtVelocity(repo: Repo): string {
  const rate = velocityOf(repo);
  if (rate >= 100) return `${Math.round(rate)}/day`;
  if (rate >= 1) return `${rate.toFixed(1)}/day`;
  return `${(rate * 7).toFixed(1)}/wk`;
}

function timeAgo(dateStr: string): string {
  const days = daysSince(dateStr);
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function savedReposFromStorage(): Repo[] {
  try {
    return JSON.parse(localStorage.getItem("repofinder-saved") || "[]");
  } catch {
    return [];
  }
}

// ── Icons ──────────────────────────────────────────────────────────────────

function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function ForkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function FireIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
    </svg>
  );
}

function BookmarkIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  );
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 0l2.5 7.5L22 10l-7.5 2.5L12 20l-2.5-7.5L2 10l7.5-2.5L12 0z" />
    </svg>
  );
}

// ── Markdown components for README rendering ───────────────────────────────

const MD_COMPONENTS = {
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className="text-base font-semibold text-white mt-3 mb-2" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className="text-sm font-semibold text-white mt-3 mb-1.5" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className="text-sm font-semibold text-gray-200 mt-2 mb-1" {...props} />
  ),
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="text-sm text-gray-300 leading-relaxed mb-2" {...props} />
  ),
  a: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a className="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer" {...props} />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code className="text-xs bg-gray-700/70 px-1.5 py-0.5 rounded text-pink-300 font-mono" {...props} />
  ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="bg-gray-950/60 border border-gray-700 p-3 rounded-lg text-xs overflow-x-auto my-2 text-gray-200" {...props} />
  ),
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="list-disc list-inside text-sm text-gray-300 mb-2 ml-1 space-y-0.5" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="list-decimal list-inside text-sm text-gray-300 mb-2 ml-1 space-y-0.5" {...props} />
  ),
  blockquote: (props: React.BlockquoteHTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className="border-l-2 border-gray-600 pl-3 text-sm text-gray-400 italic my-2" {...props} />
  ),
  hr: () => <hr className="border-gray-700 my-3" />,
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-white" {...props} />
  ),
  img: () => null, // strip images entirely
};

// ── Summary Modal ──────────────────────────────────────────────────────────

function SummaryModal({
  fullName,
  onClose,
  onFindSimilar,
}: {
  fullName: string;
  onClose: () => void;
  onFindSimilar: (query: string) => void;
}) {
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const [owner, repo] = fullName.split("/");
    fetch(`/api/summary?owner=${owner}&repo=${repo}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) setError(data.error || "Failed to load");
        else setDetail(data);
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
  }, [fullName]);

  // Close on Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const techStack = detail ? detectTechStack(detail) : [];

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">Loading summary...</div>
        ) : error ? (
          <div className="p-10 text-center text-red-400 text-sm">{error}</div>
        ) : !detail ? null : (
          <div className="p-6 flex flex-col gap-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Image
                  src={detail.owner.avatar_url}
                  alt={detail.owner.login}
                  width={44}
                  height={44}
                  className="rounded-full"
                />
                <div>
                  <h2 className="font-semibold text-lg text-white leading-tight">
                    {detail.name}
                  </h2>
                  <span className="text-gray-400 text-sm">{detail.owner.login}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-500 hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Description */}
            {detail.description && (
              <p className="text-gray-300 leading-relaxed">{detail.description}</p>
            )}

            {/* Stats */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Stars", value: fmtNum(detail.stargazers_count) },
                { label: "Forks", value: fmtNum(detail.forks_count) },
                { label: "Watchers", value: fmtNum(detail.watchers_count) },
                { label: "Issues", value: String(detail.open_issues_count) },
              ].map((s) => (
                <div key={s.label} className="bg-gray-800 rounded-xl p-3 text-center">
                  <div className="font-semibold text-white text-lg">{s.value}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap gap-2">
              {detail.language && (
                <span className="flex items-center gap-1.5 text-sm bg-gray-800 px-3 py-1 rounded-full text-gray-200">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: LANG_COLORS[detail.language] || "#888" }}
                  />
                  {detail.language}
                </span>
              )}
              {detail.license && (
                <span
                  className={`text-sm px-3 py-1 rounded-full ${
                    detail.license.spdx_id === "MIT"
                      ? "bg-green-950 text-green-400"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {detail.license.spdx_id}
                </span>
              )}
              <span className="text-sm bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                {fmtVelocity(detail)} velocity
              </span>
              <span className="text-sm bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
                Updated {timeAgo(detail.updated_at)}
              </span>
            </div>

            {/* Tech stack */}
            {techStack.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {techStack.map((t) => (
                  <span key={t} className={`text-xs px-2.5 py-1 rounded-full font-medium ${TECH_COLORS[t] || "bg-gray-800 text-gray-300"}`}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Topics */}
            {detail.topics && detail.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.topics.map((t) => (
                  <span key={t} className="text-xs bg-indigo-950 text-indigo-300 px-2.5 py-1 rounded-full">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* README preview with markdown */}
            {detail.readme && (
              <div className="bg-gray-800/40 rounded-xl p-4 border border-gray-700/50">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-2 font-medium">
                  README
                </div>
                <div className="prose-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                    {detail.readme}
                  </ReactMarkdown>
                </div>
                {detail.readme.length >= 4000 && (
                  <div className="text-xs text-gray-600 mt-2">README truncated…</div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1 flex-wrap">
              <a
                href={detail.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium py-2.5 px-4 rounded-xl text-center transition-colors"
              >
                View on GitHub
              </a>
              {detail.topics && detail.topics.length > 0 && (
                <button
                  onClick={() => onFindSimilar(detail.topics.slice(0, 3).join(" "))}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
                >
                  Find Similar
                </button>
              )}
              {detail.homepage && (
                <a
                  href={detail.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
                >
                  Live Demo
                </a>
              )}
              <button
                onClick={() => navigator.clipboard.writeText(detail.clone_url)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm font-medium py-2.5 px-4 rounded-xl transition-colors"
                title="Copy clone URL"
              >
                Clone
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Repo Card ──────────────────────────────────────────────────────────────

function RepoCard({
  repo,
  onSummary,
  onSave,
  isTrending,
  isSaved,
  aiReason,
}: {
  repo: Repo;
  onSummary: () => void;
  onSave: () => void;
  isTrending?: boolean;
  isSaved?: boolean;
  aiReason?: string;
}) {
  const cat = detectCategory(repo);
  const techStack = detectTechStack(repo);
  const langColor = LANG_COLORS[repo.language || ""] || "#6b7280";

  return (
    <div
      onClick={onSummary}
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 hover:border-gray-600 hover:bg-gray-900/80 transition-colors cursor-pointer"
    >
      {/* AI reasoning chip (only on smart-search results) */}
      {aiReason && (
        <div className="flex items-start gap-2 bg-violet-950/40 border border-violet-900/50 rounded-lg p-2 -mt-1 -mx-1">
          <SparkleIcon className="w-3.5 h-3.5 text-violet-400 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-violet-200 leading-snug">{aiReason}</span>
        </div>
      )}

      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Image
            src={repo.owner.avatar_url}
            alt={repo.owner.login}
            width={20}
            height={20}
            className="rounded-full flex-shrink-0"
          />
          <a
            href={repo.html_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-indigo-400 hover:text-indigo-300 text-sm font-medium truncate transition-colors"
          >
            {repo.full_name}
          </a>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full text-gray-400 whitespace-nowrap">
            {cat}
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onSave(); }}
            className={`transition-colors ${isSaved ? "text-amber-400 hover:text-amber-300" : "text-gray-600 hover:text-gray-300"}`}
            title={isSaved ? "Remove bookmark" : "Bookmark"}
          >
            <BookmarkIcon filled={isSaved} className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-gray-400 text-sm leading-relaxed line-clamp-2 min-h-[2.5rem]">
        {repo.description || "No description provided."}
      </p>

      {/* Tech stack chips */}
      {techStack.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {techStack.map((t) => (
            <span key={t} className={`text-xs px-2 py-0.5 rounded-full font-medium ${TECH_COLORS[t] || "bg-gray-800 text-gray-300"}`}>
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Topics */}
      {repo.topics && repo.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {repo.topics.slice(0, 4).map((t) => (
            <span key={t} className="text-xs bg-indigo-950 text-indigo-400 px-2 py-0.5 rounded-full">
              {t}
            </span>
          ))}
          {repo.topics.length > 4 && (
            <span className="text-xs text-gray-600">+{repo.topics.length - 4}</span>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <StarIcon className="w-3.5 h-3.5" />
            {fmtNum(repo.stargazers_count)}
          </span>
          <span className="flex items-center gap-1">
            <ForkIcon className="w-3.5 h-3.5" />
            {fmtNum(repo.forks_count)}
          </span>
          {repo.language && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: langColor }} />
              {repo.language}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 group-hover:text-indigo-400 transition-colors">Click for summary →</span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-800 pt-2">
        <div className="flex items-center gap-2">
          {repo.license && (
            <span className={repo.license.spdx_id === "MIT" ? "text-green-600 font-medium" : ""}>
              {repo.license.spdx_id}
            </span>
          )}
          {(isTrending || velocityOf(repo) > 5) && (
            <span className="text-orange-500 font-medium">{fmtVelocity(repo)}</span>
          )}
        </div>
        <span>{timeAgo(repo.updated_at)}</span>
      </div>
    </div>
  );
}

// ── Smart Search interpretation chips ──────────────────────────────────────

function InterpretationDisplay({ interp }: { interp: AiInterpretation }) {
  const chips: { label: string; color: string }[] = [];
  if (interp.keywords) chips.push({ label: `"${interp.keywords}"`, color: "bg-gray-800 text-gray-200" });
  if (interp.language) chips.push({ label: interp.language, color: "bg-blue-950 text-blue-300" });
  if (interp.license) chips.push({ label: interp.license.toUpperCase(), color: "bg-green-950 text-green-400" });
  for (const t of interp.topics || []) chips.push({ label: t, color: "bg-indigo-950 text-indigo-300" });
  if (interp.min_stars) chips.push({ label: `>${interp.min_stars} stars`, color: "bg-orange-950 text-orange-400" });
  if (interp.max_age_days) chips.push({ label: `pushed <${interp.max_age_days}d`, color: "bg-amber-950 text-amber-400" });

  return (
    <div className="bg-violet-950/30 border border-violet-900/40 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <SparkleIcon className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-medium text-violet-200">AI understood your query as</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c, i) => (
          <span key={i} className={`text-xs px-2.5 py-1 rounded-full font-medium ${c.color}`}>
            {c.label}
          </span>
        ))}
      </div>
      {interp.reasoning && (
        <p className="text-xs text-violet-300/80 italic leading-relaxed">{interp.reasoning}</p>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

type Tab = "discover" | "trending" | "saved" | "ai";

export default function Home() {
  const [tab, setTab] = useState<Tab>("discover");
  const [query, setQuery] = useState("design system");
  const [inputValue, setInputValue] = useState("design system");
  const [license, setLicense] = useState("");
  const [language, setLanguage] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("stars");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaryTarget, setSummaryTarget] = useState<string | null>(null);
  const [saved, setSaved] = useState<Repo[]>([]);

  // Smart Search state
  const [aiInputValue, setAiInputValue] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<Repo[]>([]);
  const [aiInterpretation, setAiInterpretation] = useState<AiInterpretation | null>(null);
  const [aiReasoning, setAiReasoning] = useState<Record<number, string>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLTextAreaElement>(null);

  // Load saved from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setSaved(savedReposFromStorage());
  }, []);

  const savedIds = useMemo(() => new Set(saved.map((r) => r.id)), [saved]);

  const toggleSave = useCallback((repo: Repo) => {
    setSaved((prev) => {
      const next = prev.some((r) => r.id === repo.id)
        ? prev.filter((r) => r.id !== repo.id)
        : [...prev, repo];
      localStorage.setItem("repofinder-saved", JSON.stringify(next));
      return next;
    });
  }, []);

  const fetchRepos = useCallback(async () => {
    if (tab === "saved" || tab === "ai") return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query });
      params.set("sort", sort === "velocity" ? "stars" : sort);
      if (license) params.set("license", license);
      if (language) params.set("language", language);
      const endpoint = tab === "trending" ? "/api/trending" : "/api/repos";
      const res = await fetch(`${endpoint}?${params}`);
      const data = await res.json();
      if (!res.ok || data.message) {
        setError(data.message || data.error || `Request failed (${res.status})`);
        setRepos([]);
      } else {
        setRepos(data.items || []);
      }
    } catch {
      setError("Network error. Check your connection.");
      setRepos([]);
    } finally {
      setLoading(false);
    }
  }, [tab, query, license, language, sort]);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const handleSearch = () => setQuery(inputValue);

  const runSmartSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setAiLoading(true);
    setAiError(null);
    setAiQuery(q);
    try {
      const res = await fetch("/api/agent-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || `Request failed (${res.status})`);
        setAiResults([]);
        setAiInterpretation(null);
      } else {
        setAiResults(data.items || []);
        setAiInterpretation(data.interpretation || null);
        setAiReasoning(data.reasoning || {});
      }
    } catch {
      setAiError("Network error. Check your connection.");
      setAiResults([]);
    } finally {
      setAiLoading(false);
    }
  }, []);

  // Find Similar: switch to discover, set query, close modal
  const findSimilar = useCallback((similarQuery: string) => {
    setInputValue(similarQuery);
    setQuery(similarQuery);
    setTab("discover");
    setSummaryTarget(null);
  }, []);

  // Keyboard shortcuts: "/" to focus search, ignored when typing in inputs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (tab === "ai") aiInputRef.current?.focus();
      else searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab]);

  // Apply client-side category filter + velocity sort
  const displayRepos = useMemo(() => {
    let source: Repo[];
    if (tab === "saved") source = saved;
    else if (tab === "ai") source = aiResults;
    else source = repos;
    let result = category
      ? source.filter((r) => detectCategory(r) === category)
      : [...source];
    if (sort === "velocity" && tab !== "saved" && tab !== "ai") {
      result.sort((a, b) => velocityOf(b) - velocityOf(a));
    }
    return result;
  }, [tab, repos, saved, aiResults, category, sort]);

  const hasFilters = license || language || category;
  const showSearchHeader = tab !== "ai";

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "discover", label: "Discover", icon: <GithubIcon className="w-4 h-4" /> },
    { id: "trending", label: "Trending Now", icon: <FireIcon className="w-4 h-4" /> },
    { id: "ai", label: "Smart Search", icon: <SparkleIcon className="w-4 h-4" /> },
    {
      id: "saved",
      label: saved.length > 0 ? `Saved (${saved.length})` : "Saved",
      icon: <BookmarkIcon className="w-4 h-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center gap-4 sticky top-0 bg-gray-950/90 backdrop-blur z-40">
        <div className="flex items-center gap-2 flex-shrink-0">
          <GithubIcon className="w-6 h-6 text-indigo-400" />
          <span className="font-semibold text-base">RepoFinder</span>
        </div>
        {showSearchHeader && (
          <div className="flex-1 flex gap-2 max-w-xl">
            <div className="flex-1 relative">
              <input
                ref={searchInputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search GitHub repos... (press / to focus)"
                className="w-full bg-gray-800 rounded-lg px-4 py-2 text-sm outline-none border border-gray-700 focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              onClick={handleSearch}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0"
            >
              Search
            </button>
          </div>
        )}
      </header>

      {/* Tabs */}
      <div className="border-b border-gray-800 px-6">
        <div className="flex overflow-x-auto">
          {tabs.map(({ id, label, icon }) => {
            const activeColor =
              id === "trending" ? "border-orange-500 text-orange-400"
              : id === "saved" ? "border-amber-500 text-amber-400"
              : id === "ai" ? "border-violet-500 text-violet-400"
              : "border-indigo-500 text-indigo-400";
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === id ? activeColor : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {icon}
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* AI Search input panel */}
      {tab === "ai" && (
        <div className="border-b border-gray-800 bg-violet-950/10 px-6 py-6">
          <div className="max-w-3xl mx-auto space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                <SparkleIcon className="w-5 h-5 text-violet-400" />
                Smart Search
              </h2>
              <p className="text-sm text-gray-400">
                Describe what you&apos;re looking for in plain English. Grok 4 Fast figures out the filters and ranks the results.
              </p>
            </div>
            <div className="flex gap-2">
              <textarea
                ref={aiInputRef}
                value={aiInputValue}
                onChange={(e) => setAiInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    runSmartSearch(aiInputValue);
                  }
                }}
                placeholder="e.g. lightweight react animation library, MIT licensed, actively maintained"
                rows={2}
                className="flex-1 bg-gray-800 rounded-lg px-4 py-3 text-sm outline-none border border-gray-700 focus:border-violet-500 transition-colors resize-none"
              />
              <button
                onClick={() => runSmartSearch(aiInputValue)}
                disabled={aiLoading || !aiInputValue.trim()}
                className="bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white px-5 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <SparkleIcon className="w-4 h-4" />
                    Ask AI
                  </>
                )}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500 mr-1">Try:</span>
              {AI_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setAiInputValue(ex); runSmartSearch(ex); }}
                  className="text-xs bg-gray-800/60 hover:bg-violet-900/50 text-gray-400 hover:text-violet-200 px-2.5 py-1 rounded-full border border-gray-700/50 hover:border-violet-700 transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
            {aiInterpretation && !aiLoading && <InterpretationDisplay interp={aiInterpretation} />}
            {aiError && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-lg p-3 text-sm text-red-300">
                {aiError}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters (hidden on AI tab) */}
      {tab !== "ai" && (
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap border-b border-gray-800 bg-gray-900/40">
          <select
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none cursor-pointer"
          >
            <option value="">Any License</option>
            <option value="mit">MIT</option>
            <option value="apache-2.0">Apache 2.0</option>
            <option value="gpl-3.0">GPL 3.0</option>
            <option value="bsd-2-clause">BSD 2-Clause</option>
          </select>

          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none cursor-pointer"
          >
            <option value="">Any Language</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none cursor-pointer"
          >
            <option value="">All Types</option>
            {Object.keys(CATEGORIES).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {tab !== "saved" && (
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 outline-none cursor-pointer"
            >
              <option value="stars">Most Stars</option>
              <option value="velocity">Stars / Day</option>
              <option value="forks">Most Forks</option>
              <option value="updated">Recently Updated</option>
              <option value="help-wanted-issues">Help Wanted</option>
            </select>
          )}

          {hasFilters && (
            <button
              onClick={() => { setLicense(""); setLanguage(""); setCategory(""); }}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear filters
            </button>
          )}

          <span className="ml-auto text-xs text-gray-600">
            {displayRepos.length > 0 && `${displayRepos.length} repos`}
          </span>
        </div>
      )}

      {/* Grid */}
      <main className="p-6">
        {(loading || (tab === "ai" && aiLoading)) ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-600">
            <div className={`w-6 h-6 border-2 ${tab === "ai" ? "border-violet-500" : "border-indigo-500"} border-t-transparent rounded-full animate-spin`} />
            <span className="text-sm">{tab === "ai" ? "AI is searching..." : "Fetching repos..."}</span>
          </div>
        ) : error && tab !== "ai" ? (
          <div className="max-w-md mx-auto bg-red-950/40 border border-red-900/50 rounded-xl p-4 text-sm text-red-300">
            <div className="font-medium mb-1">Couldn&apos;t load repos</div>
            <div className="text-red-400/80">{error}</div>
            {error.toLowerCase().includes("rate limit") && (
              <div className="text-xs text-red-400/60 mt-2">
                Tip: add a <code className="bg-red-950 px-1 py-0.5 rounded">GITHUB_TOKEN</code> env var in Vercel to get 5000 req/hour.
              </div>
            )}
          </div>
        ) : tab === "saved" && saved.length === 0 ? (
          <div className="text-center text-gray-600 py-20 text-sm">
            No saved repos yet. Hit the bookmark icon on any card.
          </div>
        ) : tab === "ai" && !aiQuery ? (
          <div className="text-center text-gray-600 py-20 text-sm max-w-md mx-auto">
            Enter a query above. Smart Search uses Grok 4 Fast to interpret what you mean and rank the best matches.
          </div>
        ) : displayRepos.length === 0 ? (
          <div className="text-center text-gray-600 py-20 text-sm">
            No repos found. Try adjusting your search or filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayRepos.map((repo) => (
              <RepoCard
                key={repo.id}
                repo={repo}
                isTrending={tab === "trending"}
                isSaved={savedIds.has(repo.id)}
                aiReason={tab === "ai" ? aiReasoning[repo.id] : undefined}
                onSave={() => toggleSave(repo)}
                onSummary={() => setSummaryTarget(repo.full_name)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Summary Modal */}
      {summaryTarget && (
        <SummaryModal
          fullName={summaryTarget}
          onClose={() => setSummaryTarget(null)}
          onFindSimilar={findSimilar}
        />
      )}
    </div>
  );
}
