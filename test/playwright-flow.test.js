import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
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
  it("opens the running app when testing a change", () => {
    const plan = planPlaywright({ baseUrl: "http://127.0.0.1/" });
    assert.equal(plan.canRun, true);
    assert.equal(plan.ticket, null);
    assert.equal(plan.steps[0].path, "/");
  });

  it("refuses a ticket without executable checks or a live app", () => {
    const down = planPlaywright({ ticket: "PRY-12", markdown: note, baseUrl: null });
    assert.equal(down.canRun, false);
    assert.match(down.reason, /app URL is down/);
    const prose = planPlaywright({
      ticket: "PRY-12",
      baseUrl: "http://127.0.0.1/",
      markdown: "## Functional checks\n- user exports a csv\n",
    });
    assert.equal(prose.canRun, false);
    assert.match(prose.reason, /no executable/);
  });

  it("uses the proxy when it is up, otherwise the web health URL", () => {
    const stack = stackReport([
      { id: "proxy", up: false },
      { id: "rland-web", up: true },
    ]);
    assert.equal(resolveAppUrl({ stack }), "http://127.0.0.1:3000/");
    assert.equal(resolveAppUrl({ env: { RLAND_APP_URL: "http://app.test" }, stack }), "http://app.test/");
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
