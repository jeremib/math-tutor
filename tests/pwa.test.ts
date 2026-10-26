import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import manifest from "../src/app/manifest.ts";
import {
  appShellUrls,
  cacheDecision,
  cssChunkUrls,
  isRscRequest,
  serviceWorkerSource,
  shellUrlsFromBuildManifest,
  toShellAssetUrl,
  type CacheInput,
} from "../src/pwa/service-worker.ts";

const headers = (values: Record<string, string>) => ({
  get(name: string) {
    const key = Object.keys(values).find((item) => item.toLowerCase() === name.toLowerCase());
    return key ? values[key] : null;
  },
});

const decision = (overrides: Partial<CacheInput> = {}) =>
  cacheDecision({
    method: "GET",
    sameOrigin: true,
    pathname: "/",
    mode: "cors",
    accept: "*/*",
    authorization: false,
    rsc: false,
    ...overrides,
  });

test("manifest is an installable standalone Math Buddy app", () => {
  const web = manifest();
  assert.equal(web.name, "Math Buddy");
  assert.equal(web.short_name, "Math Buddy");
  assert.equal(web.start_url, "/");
  assert.equal(web.scope, "/");
  assert.equal(web.display, "standalone");
  assert.equal(web.theme_color, "#2563eb");
  assert.equal(web.background_color, "#f8fafc");
  assert.equal(web.prefer_related_applications, false);
  const icons = web.icons ?? [];
  for (const size of ["192x192", "512x512"]) {
    assert.ok(icons.some((icon) => icon.sizes === size && icon.purpose === "any" && icon.type === "image/png"));
    assert.ok(icons.some((icon) => icon.sizes === size && icon.purpose === "maskable" && icon.type === "image/png"));
  }
  for (const icon of icons) assert.ok(icon.src?.startsWith("/"));
});

test("caching ignores mutations, API responses, and RSC payloads", () => {
  assert.equal(decision({ method: "POST", pathname: "/student" }), "passthrough");
  assert.equal(decision({ method: "PUT", pathname: "/api/homework" }), "passthrough");
  assert.equal(decision({ pathname: "/api/uploads/photo.png" }), "passthrough");
  assert.equal(decision({ pathname: "/api/drill/1" }), "passthrough");
  assert.equal(decision({ rsc: true, pathname: "/student", mode: "navigate", accept: "text/html" }), "passthrough");
  assert.equal(decision({ authorization: true, pathname: "/student", mode: "navigate" }), "passthrough");
  assert.equal(decision({ sameOrigin: false, pathname: "/icons/icon-192.png" }), "passthrough");
  assert.equal(decision({ pathname: "/_next/static/chunks/app.js" }), "cache-first");
  assert.equal(decision({ pathname: "/icons/icon-512.png" }), "cache-first");
  assert.equal(decision({ pathname: "/offline.html" }), "cache-first");
  assert.equal(decision({ mode: "navigate", pathname: "/student", accept: "text/html" }), "network-first-page");
  assert.equal(decision({ pathname: "/login", accept: "text/html" }), "network-first-page");
  assert.equal(isRscRequest(headers({ RSC: "1", Accept: "*/*" }), ""), true);
  assert.equal(isRscRequest(headers({ Accept: "text/x-component" }), ""), true);
  assert.equal(isRscRequest(headers({}), "?_rsc=abc"), true);
  assert.equal(isRscRequest(headers({ Accept: "text/html" }), ""), false);
});

test("service worker is versioned, claims clients, and embeds the cache rules", () => {
  const source = serviceWorkerSource("build 1", ["/ _next/static/chunks/nope.js", "/_next/static/chunks/app.js", "https://evil.example/a.js"]);
  assert.match(source, /const VERSION = "build 1"/);
  assert.match(source, /math-buddy-precache-/);
  assert.match(source, /math-buddy-pages-/);
  assert.match(source, /skipWaiting\(\)/);
  assert.match(source, /clients\.claim\(\)/);
  assert.match(source, /\/offline\.html/);
  assert.match(source, /\/_next\/static\/chunks\/app\.js/);
  assert.doesNotMatch(source, /evil\.example/);
  assert.doesNotMatch(source, /\/ _next/);
  const dir = mkdtempSync(join(tmpdir(), "math-buddy-sw-"));
  const file = join(dir, "sw.js");
  writeFileSync(file, source);
  const checked = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
});

test("shell urls stay inside hashed Next static files", () => {
  assert.equal(toShellAssetUrl("static/chunks/app.js"), "/_next/static/chunks/app.js");
  assert.equal(toShellAssetUrl("/_next/static/css/app.css"), "/_next/static/css/app.css");
  assert.equal(toShellAssetUrl("../secret.js"), null);
  assert.equal(toShellAssetUrl("/api/uploads/a.png"), null);
  assert.deepEqual(
    appShellUrls({
      pages: {
        "/layout": ["static/chunks/webpack.js", "static/css/app.css", "static/chunks/app.js.map"],
        "/page": ["static/chunks/webpack.js", "static/chunks/app/page.js"],
        "/student/page": ["static/chunks/app/student/page.js"],
      },
    }),
    [
      "/_next/static/chunks/webpack.js",
      "/_next/static/css/app.css",
      "/_next/static/chunks/app/page.js",
    ],
  );
  assert.deepEqual(
    shellUrlsFromBuildManifest({
      rootMainFiles: ["static/chunks/main.js", "static/chunks/main.js.map"],
      polyfillFiles: ["static/chunks/polyfill.js"],
      pages: { "/layout": ["static/css/app.css"] },
    }),
    ["/_next/static/css/app.css", "/_next/static/chunks/main.js", "/_next/static/chunks/polyfill.js"],
  );
  assert.deepEqual(cssChunkUrls(["app.css", "../x.css", "app.js", "a b.css"]), ["/_next/static/chunks/app.css"]);
});

function readPng(path: string) {
  const buf = readFileSync(path);
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  let src = 0;
  for (let y = 0; y < height; y++) {
    assert.equal(raw[src], 0, "png filter");
    src += 1;
    raw.copy(pixels, y * stride, src, src + stride);
    src += stride;
  }
  return { width, height, colorType, pixels };
}

function pixel(image: ReturnType<typeof readPng>, x: number, y: number) {
  const i = (y * image.width + x) * 4;
  return [image.pixels[i], image.pixels[i + 1], image.pixels[i + 2], image.pixels[i + 3]];
}

test("icons match the brand tile and declared sizes", () => {
  const brand = [37, 99, 235, 255];
  const cases = [
    { file: "public/icons/icon-192.png", size: 192, corner: [0, 0, 0, 0] },
    { file: "public/icons/icon-512.png", size: 512, corner: [0, 0, 0, 0] },
    { file: "public/icons/icon-maskable-192.png", size: 192, corner: brand },
    { file: "public/icons/icon-maskable-512.png", size: 512, corner: brand },
    { file: "public/icons/apple-touch-icon.png", size: 180, corner: brand },
    { file: "public/apple-touch-icon.png", size: 180, corner: brand },
  ];
  for (const item of cases) {
    const image = readPng(item.file);
    assert.equal(image.width, item.size, item.file);
    assert.equal(image.height, item.size, item.file);
    assert.equal(image.colorType, 6, item.file);
    assert.deepEqual(pixel(image, 0, 0), item.corner, item.file);
    const center = pixel(image, Math.floor(item.size / 2), Math.floor(item.size / 2));
    assert.ok(center[0] > 240 && center[1] > 240 && center[2] > 240 && center[3] === 255, `${item.file} center`);
    assert.ok(readFileSync(item.file).length < 150_000, item.file);
    // Maskable icons must keep the mark inside the center 80% and bleed the background to the edges.
    if (item.file.includes("maskable")) {
      const margin = Math.floor(item.size * 0.1);
      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const [r, g, b] = pixel(image, x, y);
          if (r === 37 && g === 99 && b === 235) continue;
          assert.ok(
            x >= margin && y >= margin && x < item.size - margin && y < item.size - margin,
            `${item.file} mark spills outside the safe zone at ${x},${y}`,
          );
        }
      }
    }
  }
  const ico = readFileSync("public/favicon.ico");
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico[6], 32);
  assert.equal(ico[7], 32);
});
