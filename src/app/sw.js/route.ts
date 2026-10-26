import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cssChunkUrls, serviceWorkerSource, shellUrlsFromBuildManifest } from "@/pwa/service-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildId(): string {
  try {
    return readFileSync(join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim() || "dev";
  } catch {
    return "dev";
  }
}

function shellUrls(): string[] {
  const urls = new Set<string>();
  for (const file of ["build-manifest.json", "app-build-manifest.json"]) {
    try {
      const manifest = JSON.parse(readFileSync(join(process.cwd(), ".next", file), "utf8"));
      for (const url of shellUrlsFromBuildManifest(manifest)) urls.add(url);
    } catch {
      // A missing manifest just means the shell is cached at runtime instead.
    }
  }
  try {
    for (const url of cssChunkUrls(readdirSync(join(process.cwd(), ".next", "static", "chunks")))) urls.add(url);
  } catch {
    // CSS is still cached on the first visit via the static-asset strategy.
  }
  return [...urls];
}

export function GET() {
  return new Response(serviceWorkerSource(buildId(), shellUrls()), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
