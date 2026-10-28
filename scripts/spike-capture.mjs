import { chromium } from "playwright";
import { access, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const userDataDir = path.join(root, ".chrome-profile");
const scratchDir = path.join(root, ".scratch");
const origin = process.env.BLUESURF_ORIGIN ?? "https://surf.bluepeople.com";
const ticketKey = process.argv[2];

await mkdir(scratchDir, { recursive: true });

const calls = [];

const skipTypes = new Set(["stylesheet", "script", "font"]);

function looksLikeFileUrl(url) {
  return /file|attach|document|upload|blob|media|download|sprint/i.test(url);
}

function looksLikeApi(url) {
  return (
    url.includes("/api") ||
    url.includes("/graphql") ||
    url.includes("ticket") ||
    url.includes("sprint") ||
    url.includes("task") ||
    url.includes("issue") ||
    url.includes(".json") ||
    url.includes("/v1") ||
    url.includes("/v2") ||
    looksLikeFileUrl(url)
  );
}

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|map)(\?|$)/i.test(url);
}

function shouldRecord(url, resourceType, headers) {
  if (isStaticAsset(url) && !looksLikeFileUrl(url)) return false;
  if (skipTypes.has(resourceType) && !looksLikeFileUrl(url)) return false;
  const disposition = headers["content-disposition"] ?? "";
  if (/attachment|filename=/i.test(disposition)) return true;
  if (url.startsWith(origin)) return true;
  return looksLikeApi(url);
}

function redact(body) {
  if (typeof body !== "string") return body;
  return body
    .replace(/"(access_token|refresh_token|id_token|token|authorization|password)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .replace(/"1\/\/[A-Za-z0-9\-_]+"/g, '"[redacted]"')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, "[redacted]")
    .slice(0, 4000);
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1400, height: 900 },
});

context.on("response", async (response) => {
  const url = response.url();
  const request = response.request();
  const headers = response.headers();
  if (!shouldRecord(url, request.resourceType(), headers)) return;

  const contentType = headers["content-type"] ?? "";
  let body = "";
  if (/json|text|xml|html|javascript/i.test(contentType)) {
    try {
      body = await response.text();
    } catch {
      body = "";
    }
  } else {
    body = `[binary ${contentType} ${headers["content-disposition"] ?? ""}]`.trim();
  }

  calls.push({
    method: request.method(),
    url,
    status: response.status(),
    resourceType: request.resourceType(),
    requestHeaders: {
      accept: request.headers()["accept"],
      contentType: request.headers()["content-type"],
    },
    responseHeaders: {
      contentType,
      contentDisposition: headers["content-disposition"] ?? "",
    },
    postData: redact(request.postData() ?? ""),
    responsePreview: redact(body),
  });
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(origin, { waitUntil: "domcontentloaded" });

const doneFile = path.join(scratchDir, "spike-done");
await unlink(doneFile).catch(() => {});

console.log(`
Spike capture is recording API and file requests against ${origin}.

In the browser:
  1. Confirm you are logged in.
  2. Open a ticket that has file attachments. Some tickets have none — pick another.
  3. Click or preview at least one attachment so the download request fires.
  4. Open the sprint dropdown / filter on the board.

When finished, either press Enter here or run:
  touch ${doneFile}
`);

await new Promise((resolve) => {
  process.stdin.resume();
  process.stdin.once("data", resolve);
  const timer = setInterval(() => {
    access(doneFile)
      .then(() => {
        clearInterval(timer);
        resolve();
      })
      .catch(() => {});
  }, 500);
});

const out = path.join(scratchDir, "network.json");
await writeFile(
  out,
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      origin,
      ticketKey,
      callCount: calls.length,
      calls,
    },
    null,
    2,
  ),
);

await context.close();
console.log(`Wrote ${calls.length} calls to ${out}`);
if (calls.length === 0) {
  console.log("No XHR/fetch captured. The SPA may use websockets or a different host — we will inspect next.");
}
