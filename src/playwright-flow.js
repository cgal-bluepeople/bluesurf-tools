import { parseTicketKey } from "./model.js";

/** Lines under `## Functional checks`. `open`, `see`, and `url` run in the browser. Other bullets do not. */
export function parseFunctionalChecks(markdown) {
  const checks = [];
  let inSection = false;
  for (const line of String(markdown ?? "").split("\n")) {
    const trimmed = line.trim();
    if (/^##\s+functional checks\s*$/i.test(trimmed)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(trimmed)) break;
    if (!inSection) continue;
    const bullet = trimmed.match(/^[-*]\s+(?:\[.\]\s+)?(.+)$/);
    if (!bullet) continue;
    checks.push(parseCheckLine(bullet[1].trim()));
  }
  return checks;
}

function parseCheckLine(source) {
  const open = source.match(/^open\s+(\S+)$/i);
  if (open) return { op: "open", path: open[1], source };
  const see = source.match(/^see\s+(?:"([^"]+)"|'([^']+)'|(.+))$/i);
  if (see) return { op: "see", text: see[1] || see[2] || see[3], source };
  const url = source.match(/^url\s+(\S+)$/i);
  if (url) return { op: "url", fragment: url[1], source };
  return { op: "manual", source };
}

const API_PROBES = new Set(["auth", "core", "collab", "mock-oidc", "mcp"]);

export function resolveAppUrl({ env = {}, stack } = {}) {
  if (env.RLAND_APP_URL) return withSlash(env.RLAND_APP_URL);
  const pages = discoverAppUrls(stack);
  return pages[0]?.url ?? null;
}

/** Pages that are up. API health checks are not places to open in the browser. */
export function discoverAppUrls(stack) {
  const pages = [];
  for (const check of stack?.checks ?? []) {
    if (!check.up || !check.url || API_PROBES.has(check.id)) continue;
    const url = pageUrl(check);
    if (url) pages.push({ id: check.id, url });
  }
  return pages;
}

function pageUrl(check) {
  if (check.id === "loader-web") return "http://127.0.0.1:3001/loader/";
  return withSlash(String(check.url).replace(/\/health\/?$/, "/"));
}

function withSlash(url) {
  const trimmed = String(url).trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function planPlaywright({
  baseUrl = null,
  candidates = [],
  repos = [],
  urlSource = "ask",
  repoSource = "ask",
  ticket = null,
  markdown = "",
} = {}) {
  if (ticket) parseTicketKey(ticket);
  const fromNote = parseFunctionalChecks(markdown);
  const steps = ticket ? fromNote : [{ op: "open", path: "/", source: "open /" }];
  const executable = steps.filter((step) => step.op !== "manual");
  const needsChoice = !baseUrl;
  const needsRepos = !ticket && repos.length === 0;
  const needsSave = urlSource === "flag" || repoSource === "flag";
  const base = { baseUrl, ticket, steps, candidates, repos, needsChoice, needsRepos, needsSave, urlSource, repoSource };
  if (needsChoice) {
    const reason = candidates.length > 0
      ? "app URL is not saved. Ask which running system to open, then --save --app-url."
      : "no running UI to open. Start the app or set RLAND_APP_URL.";
    return { ...base, canRun: false, reason };
  }
  if (needsRepos) {
    return {
      ...base,
      canRun: false,
      reason: "playwright repos are not saved. Ask which systems to validate, then --save with those repo names.",
    };
  }
  if (ticket && executable.length === 0) {
    return {
      ...base,
      canRun: false,
      reason: "no executable functional checks. Write open, see, or url lines under ## Functional checks, or in validation/checks.md.",
    };
  }
  return { ...base, canRun: true, reason: null };
}

export async function runPlaywrightSteps({ baseUrl, steps, page }) {
  const results = [];
  for (const step of steps) {
    if (step.op === "manual") {
      results.push({ ...step, ok: false, detail: "not executable. Use open, see, or url." });
      continue;
    }
    try {
      if (step.op === "open") {
        const url = new URL(step.path, baseUrl).toString();
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
        const status = typeof response?.status === "function" ? response.status() : (response?.status ?? 0);
        const screenshot = await page.screenshot({ fullPage: true });
        results.push({
          ...step,
          ok: status > 0 && status < 500,
          status,
          url,
          screenshot,
          detail: `HTTP ${status}`,
        });
        continue;
      }
      if (step.op === "see") {
        const found = await page.see(step.text);
        const screenshot = await page.screenshot({ fullPage: true });
        results.push({
          ...step,
          ok: Boolean(found),
          screenshot,
          detail: found ? `saw ${step.text}` : `missing ${step.text}`,
        });
        continue;
      }
      const current = page.url();
      const screenshot = await page.screenshot({ fullPage: true });
      results.push({
        ...step,
        ok: String(current).includes(step.fragment),
        url: current,
        screenshot,
        detail: current,
      });
    } catch (error) {
      results.push({ ...step, ok: false, detail: error.message });
    }
  }
  return { ok: results.length > 0 && results.every((result) => result.ok), results };
}

export function formatPlaywrightReport({ ticket, baseUrl, results }) {
  const passed = results.length > 0 && results.every((result) => result.ok);
  const lines = [
    ticket ? `# ${ticket} validation` : "# Change check",
    "",
    `Base: ${baseUrl || "(none)"}`,
    `Result: ${passed ? "pass" : "fail"}`,
    "",
    "| Check | Result | Detail |",
    "| --- | --- | --- |",
  ];
  for (const result of results) {
    const label = String(result.source || result.op).replace(/\|/g, "/");
    const detail = String(result.detail || "").replace(/\|/g, "/");
    lines.push(`| ${label} | ${result.ok ? "pass" : "fail"} | ${detail} |`);
  }
  lines.push("");
  return lines.join("\n");
}

export function playwrightForJson(playwright) {
  if (!playwright) return playwright;
  const { results, ...rest } = playwright;
  if (!results) return playwright;
  return {
    ...rest,
    results: results.map(({ screenshot, ...result }) => result),
  };
}
