import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  discoverAppUrls,
  formatPlaywrightReport,
  parseFunctionalChecks,
  planPlaywright,
  resolveAppUrl,
  runPlaywrightSteps,
} from "../src/playwright-flow.js";
import { stackReport } from "../src/verify.js";

const note = `# PRY-12

## Functional checks
- open /agreements
- see "Agreements"
- url /agreements
- the export button downloads a csv

## Comments
- open /ignored
`;

describe("parseFunctionalChecks", () => {
  it("reads only the functional checks section", () => {
    assert.deepEqual(parseFunctionalChecks(note).map((step) => step.op), ["open", "see", "url", "manual"]);
    assert.equal(parseFunctionalChecks(note)[1].text, "Agreements");
  });
});

describe("planPlaywright", () => {
  it("opens the running app when the url and repos are already chosen", () => {
    const plan = planPlaywright({
      baseUrl: "http://127.0.0.1/",
      repos: ["rland-ui"],
      urlSource: "config",
      repoSource: "config",
    });
    assert.equal(plan.canRun, true);
    assert.equal(plan.needsChoice, false);
    assert.equal(plan.needsRepos, false);
    assert.equal(plan.steps[0].path, "/");
  });

  it("asks where to open and which systems until those answers are saved", () => {
    const pending = planPlaywright({
      candidates: [{ id: "proxy", url: "http://127.0.0.1/" }, { id: "rland-web", url: "http://127.0.0.1:3000/" }],
    });
    assert.equal(pending.canRun, false);
    assert.equal(pending.needsChoice, true);
    assert.equal(pending.needsRepos, true);
    const chosen = planPlaywright({
      baseUrl: "http://127.0.0.1/",
      repos: ["rland-ui"],
      urlSource: "flag",
      repoSource: "flag",
    });
    assert.equal(chosen.canRun, true);
    assert.equal(chosen.needsSave, true);
  });

  it("refuses a ticket without executable checks or a live app", () => {
    const down = planPlaywright({ ticket: "PRY-12", markdown: note, baseUrl: null });
    assert.equal(down.canRun, false);
    assert.match(down.reason, /no running UI/);
    const prose = planPlaywright({
      ticket: "PRY-12",
      baseUrl: "http://127.0.0.1/",
      markdown: "## Functional checks\n- user exports a csv\n",
    });
    assert.equal(prose.canRun, false);
    assert.match(prose.reason, /no executable/);
  });

  it("uses the proxy when it is up, otherwise the web health URL", () => {
    const webOnly = stackReport([
      { id: "proxy", up: false },
      { id: "rland-web", up: true },
      { id: "auth", up: true },
    ]);
    assert.equal(resolveAppUrl({ stack: webOnly }), "http://127.0.0.1:3000/");
    assert.deepEqual(discoverAppUrls(webOnly).map((page) => page.id), ["rland-web"]);
    const both = stackReport([{ id: "proxy", up: true }, { id: "rland-web", up: true }]);
    assert.equal(resolveAppUrl({ stack: both }), "http://127.0.0.1/");
    assert.equal(resolveAppUrl({ env: { RLAND_APP_URL: "http://app.test" }, stack: both }), "http://app.test/");
  });
});

describe("runPlaywrightSteps", () => {
  it("fails the ticket when a check is missing or not executable", async () => {
    const seen = [];
    const page = {
      async goto(url) {
        seen.push(url);
        return { status: () => 200 };
      },
      async screenshot() {
        return Buffer.from("png");
      },
      url() {
        return "http://127.0.0.1/agreements";
      },
      async see(text) {
        return text === "Agreements";
      },
    };
    const steps = parseFunctionalChecks(note);
    const outcome = await runPlaywrightSteps({ baseUrl: "http://127.0.0.1/", steps, page });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.results[0].ok, true);
    assert.equal(outcome.results[1].ok, true);
    assert.equal(outcome.results[2].ok, true);
    assert.equal(outcome.results[3].ok, false);
    assert.deepEqual(seen, ["http://127.0.0.1/agreements"]);
    assert.match(formatPlaywrightReport({
      ticket: "PRY-12",
      baseUrl: "http://127.0.0.1/",
      results: outcome.results,
    }), /Result: fail/);
  });
});
