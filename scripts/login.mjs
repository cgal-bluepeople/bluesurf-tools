import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { cookieJarPath, profileDir, saveCookieJar } from "../src/session.js";

const userDataDir = profileDir();
const origin = process.env.BLUESURF_ORIGIN ?? "https://surf.bluepeople.com";
const timeoutMs = 5 * 60_000;

await mkdir(userDataDir, { recursive: true });

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  viewport: { width: 1400, height: 900 },
  title: "Blue Surf agent",
});

let closed = false;
context.on("close", () => {
  closed = true;
});

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(origin, { waitUntil: "domcontentloaded" });

console.log(`
Profile: ${userDataDir}
Origin:  ${origin}

Complete SSO in the window that just opened. It saves the session and
closes by itself once you are signed in (waits up to 5 minutes).
`);

async function signedIn() {
  const response = await context.request.get(`${origin}/api/instance/currentUser`, {
    headers: { Accept: "application/json" },
  });
  return response.ok();
}

const deadline = Date.now() + timeoutMs;
while (!closed && Date.now() < deadline) {
  if (await signedIn().catch(() => false)) {
    await saveCookieJar(context);
    await context.close();
    console.log(`Signed in. Session saved to ${cookieJarPath()}.`);
    console.log("Next: npm run sprint, or npm run ticket -- PRY-XXX");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

if (!closed) await context.close();
console.error(
  closed
    ? "The window was closed before sign-in finished. Run npm run login again."
    : "Timed out waiting for sign-in. Run npm run login again.",
);
process.exit(1);
