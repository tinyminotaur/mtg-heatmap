import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron (GET) or manual curl: triggers GitHub Actions via repository_dispatch
 * so the heavy Scryfall job runs on GitHub runners, not inside this serverless function.
 *
 * Vercel: set CRON_SECRET (Project → Settings → Cron Jobs), GITHUB_REPO_DISPATCH_TOKEN,
 * and CRON_GITHUB_REPO (e.g. tinyminotaur/mtg-heatmap).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const token = process.env.GITHUB_REPO_DISPATCH_TOKEN;
  const repo = process.env.CRON_GITHUB_REPO?.trim();
  if (!token || !repo) {
    return NextResponse.json(
      {
        ok: false,
        message: "Set GITHUB_REPO_DISPATCH_TOKEN and CRON_GITHUB_REPO on Vercel (owner/repo).",
      },
      { status: 503 },
    );
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ event_type: "scryfall-refresh", client_payload: {} }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { ok: false, github: res.status, detail: detail.slice(0, 800) },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, triggered: "repository_dispatch", repo });
}
