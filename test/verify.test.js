import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  buildVerifyPlan,
  discoverRunLayout,
  emitCli,
  formatVerifyPlan,
  inferCheck,
  mergeChecks,
  parseCheckList,
  parseProbeList,
  parseVerifyArgs,
  resolveRunMode,
  resolveWorkspace,
  runVerifyPlan,
  stackReport,
  upsertEnvAssignments,
} from "../src/verify.js";

const workspace = "/work/rland-new";

function tools(overrides = {}) {
  return { nodeVersion: "v22.14.0", pnpm: true, go: true, ...overrides };
}

describe("parseVerifyArgs", () => {
  it("reads flags and repo names", () => {
    assert.deepEqual(parseVerifyArgs(["--json", "--yes", "--root", "/work/rland-new", "rland-ui"]), {
      yes: true,
      json: true,
      save: false,
      playwright: false,
      root: "/work/rland-new",
      mode: null,
      runner: null,
      ticket: null,
      repos: ["rland-ui"],
    });
    assert.equal(parseVerifyArgs(["--playwright", "--ticket", "PRY-12"]).ticket, "PRY-12");
    assert.equal(parseVerifyArgs(["--playwright"]).playwright, true);
  });

  it("accepts a repo name that is not in the built-in catalog", () => {
    assert.deepEqual(parseVerifyArgs(["billing-api"]).repos, ["billing-api"]);
    assert.throws(() => parseVerifyArgs(["--root"]), /Usage:/);
    assert.throws(() => parseVerifyArgs(["--stack"]), /Unknown flag --stack/);
  });
});

describe("resolveWorkspace", () => {
  it("uses RLAND_ROOT when that directory exists", () => {
    const found = resolveWorkspace({
      repoRoot: "/tools",
      env: { RLAND_ROOT: workspace },
      exists: (target) => target === workspace,
    });
    assert.equal(found, workspace);
  });

  it("finds a sibling rland-new that contains rland-ui", () => {
    const sibling = "/work/bluepeople/rland-new";
    const found = resolveWorkspace({
      repoRoot: "/work/bluepeople/bluesurf-tools",
      env: {},
      exists: (target) => target === path.join(sibling, "rland-ui"),
    });
    assert.equal(found, sibling);
  });

  it("returns null when nothing matches, and throws when RLAND_ROOT is missing", () => {
    assert.equal(resolveWorkspace({ repoRoot: "/tools", env: {}, exists: () => false }), null);
    assert.throws(
      () => resolveWorkspace({ repoRoot: "/tools", env: { RLAND_ROOT: "/missing" }, exists: () => false }),
      /RLAND_ROOT does not exist/,
    );
  });

  it("accepts RLAND_ROOT without rland-ui, and a sibling marked .bluesurf-workspace", () => {
    const other = "/work/other";
    assert.equal(resolveWorkspace({
      repoRoot: "/tools",
      env: { RLAND_ROOT: other },
      exists: (target) => target === other,
    }), other);
    const sibling = "/work/bluepeople/billing";
    const found = resolveWorkspace({
      repoRoot: "/work/bluepeople/bluesurf-tools",
      env: {},
      siblingNames: ["billing", "rland-new"],
      exists: (target) => target === path.join(sibling, ".bluesurf-workspace"),
    });
    assert.equal(found, sibling);
  });
});

describe("buildVerifyPlan", () => {
  const files = [
    "rland-ui/playwright.config.ts",
    "rland-core/Makefile",
    "rland-auth/Makefile",
  ];
  const stack = stackReport([
    { id: "proxy", up: true },
    { id: "rland-web", up: true },
    { id: "auth", up: false },
    { id: "core", up: true },
  ]);

  it("plans dirty repos and blocks Playwright when Node is below 22", () => {
    const plan = buildVerifyPlan({
      workspace,
      dirty: ["rland-ui", "rland-core"],
      existingRepos: ["rland-ui", "rland-core", "rland-auth"],
      existingFiles: files,
      tools: tools({ nodeVersion: "v20.19.0" }),
      stack,
    });
    assert.equal(plan.stack.ready, false);
    assert.equal(plan.checks.find((check) => check.repo === "rland-ui").canRun, false);
    assert.match(plan.checks.find((check) => check.repo === "rland-ui").reason, /below 22/);
    const core = plan.checks.find((check) => check.repo === "rland-core");
    assert.equal(core.canRun, true);
    assert.equal(core.command, "make test");
    assert.equal(core.flow.canRun, false);
    assert.match(core.flow.reason, /auth/);
    assert.equal(plan.checks.find((check) => check.repo === "rland-ui").flow.canRun, true);
    assert.equal(plan.checks.some((check) => check.repo === "rland-auth"), false);
  });

  it("lets a named clean repo run, and reports a missing go toolchain", () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-ui", "rland-core"],
      dirty: [],
      existingRepos: ["rland-ui", "rland-core"],
      existingFiles: files,
      tools: tools({ go: false }),
      stack: stackReport([{ id: "proxy", up: true }, { id: "rland-web", up: true }, { id: "auth", up: true }, { id: "core", up: true }]),
    });
    assert.equal(plan.stack.ready, true);
    const ui = plan.checks.find((check) => check.repo === "rland-ui");
    assert.equal(ui.canRun, true);
    assert.equal(ui.command, "pnpm test:e2e");
    assert.equal(ui.why, "named");
    assert.equal(plan.checks.find((check) => check.repo === "rland-core").reason, "go is not on PATH");
    assert.equal(plan.checks.find((check) => check.repo === "rland-core").flow.canRun, true);
    assert.deepEqual(plan.checks.find((check) => check.repo === "rland-core").flow.services, ["proxy", "auth", "core"]);
  });

  it("keeps a repo flow runnable when another service in the stack is down", () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-core"],
      existingRepos: ["rland-core"],
      existingFiles: ["rland-core/Makefile"],
      tools: tools(),
      stack: stackReport([
        { id: "proxy", up: true },
        { id: "rland-web", up: false },
        { id: "auth", up: true },
        { id: "core", up: true },
      ]),
    });
    assert.equal(plan.stack.ready, false);
    assert.equal(plan.checks[0].flow.via, "rland-infra");
    assert.equal(plan.checks[0].flow.canRun, true);
    assert.match(formatVerifyPlan(plan), /flow via rland-infra\s+can run\s+proxy, auth, core/);
  });

  it("has nothing to run when every repo is clean", () => {
    const plan = buildVerifyPlan({
      workspace,
      dirty: [],
      existingRepos: ["rland-ui"],
      existingFiles: files,
      tools: tools(),
      stack: stackReport([]),
    });
    assert.deepEqual(plan.checks, []);
    assert.match(formatVerifyPlan(plan), /No dirty repos/);
    assert.match(formatVerifyPlan(plan), /Real flow against localhost: not ready/);
  });

  it("treats rland-infra as the stack runner, not a test suite", () => {
    const down = buildVerifyPlan({
      workspace,
      repoNames: ["rland-infra"],
      existingRepos: ["rland-infra"],
      tools: tools(),
      stack: stackReport([]),
    });
    assert.equal(down.checks[0].command, null);
    assert.equal(down.checks[0].canRun, false);
    assert.match(down.checks[0].reason, /make local-up-detached/);

    const up = buildVerifyPlan({
      workspace,
      repoNames: ["rland-infra"],
      existingRepos: ["rland-infra"],
      tools: tools(),
      stack: stackReport([
        { id: "proxy", up: true },
        { id: "rland-web", up: true },
        { id: "auth", up: true },
        { id: "core", up: true },
      ]),
    });
    assert.equal(up.checks[0].canRun, true);
    assert.equal(up.checks[0].flow.canRun, true);
  });
});

describe("discoverRunLayout", () => {
  const files = [
    { path: "rland-infra/Makefile", text: "local-up-detached:\n\tcompose up\n" },
    {
      path: "rland-infra/deploy/docker-compose.local.yml",
      text: "context: ../../rland-ui\ncontext: ../../rland-core\ncontext: ../../rland-auth\n",
    },
    { path: "rland-core/Makefile", text: "test:\n\tgo test\nrun:\n\tgo run\n" },
    { path: "rland-ui/package.json", text: '{"scripts":{"dev":"turbo run dev"}}\n' },
    { path: "rland-ngam/Makefile", text: "dev:\n\tfastapi dev\nrun:\n\tuvicorn\n" },
  ];

  it("finds a compose runner and each repo's own command", () => {
    const layout = discoverRunLayout(files);
    assert.deepEqual(layout.runners, [{
      repo: "rland-infra",
      command: "make local-up-detached",
      serves: ["rland-auth", "rland-core", "rland-ui"],
    }]);
    assert.deepEqual(layout.individual, [
      { repo: "rland-core", command: "make run" },
      { repo: "rland-ngam", command: "make dev" },
      { repo: "rland-ui", command: "pnpm dev" },
    ]);
  });

  it("asks when both shapes exist and nothing is configured", () => {
    const discovery = discoverRunLayout(files);
    const pending = resolveRunMode({ discovery });
    assert.equal(pending.needsChoice, true);
    assert.equal(pending.mode, null);

    const saved = resolveRunMode({ discovery, env: { RLAND_RUN_MODE: "stack", RLAND_RUNNER: "rland-infra" } });
    assert.equal(saved.needsChoice, false);
    assert.equal(saved.mode, "stack");
    assert.equal(saved.runner, "rland-infra");
    assert.equal(saved.source, "config");
  });

  it("uses an individual flow when that mode is selected", () => {
    const discovery = discoverRunLayout(files);
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-core"],
      existingRepos: ["rland-core"],
      existingFiles: ["rland-core/Makefile"],
      tools: tools(),
      stack: stackReport([]),
      run: resolveRunMode({ discovery, mode: "individual" }),
    });
    assert.equal(plan.checks[0].flow.via, null);
    assert.equal(plan.checks[0].flow.canRun, true);
    assert.equal(plan.checks[0].flow.command, "make run");
    assert.match(formatVerifyPlan(plan), /Run mode: individual/);
  });

  it("does not run suites until the run mode is chosen", async () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-core"],
      existingRepos: ["rland-core"],
      existingFiles: ["rland-core/Makefile"],
      tools: tools(),
      run: resolveRunMode({ discovery: discoverRunLayout(files) }),
    });
    let called = false;
    const outcome = await runVerifyPlan(plan, async () => {
      called = true;
      return 0;
    });
    assert.equal(called, false);
    assert.equal(outcome.ok, false);
    assert.match(plan.checks[0].flow.reason, /not chosen/);
  });

  it("writes the chosen mode into env text", () => {
    const next = upsertEnvAssignments("BLUESURF_ORIGIN=https://surf.example\n", {
      RLAND_RUN_MODE: "stack",
      RLAND_RUNNER: "rland-infra",
    });
    assert.match(next, /BLUESURF_ORIGIN=https:\/\/surf\.example/);
    assert.match(next, /RLAND_RUN_MODE=stack/);
    assert.match(next, /RLAND_RUNNER=rland-infra/);
    const replaced = upsertEnvAssignments(next, { RLAND_RUN_MODE: "individual", RLAND_RUNNER: "" });
    assert.match(replaced, /RLAND_RUN_MODE=individual/);
    assert.equal(replaced.match(/RLAND_RUN_MODE/g).length, 1);
  });
});

describe("runVerifyPlan", () => {
  it("runs only checks that can, then fails when another was blocked", async () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-ui", "rland-core"],
      existingRepos: ["rland-ui", "rland-core"],
      existingFiles: ["rland-ui/playwright.config.ts", "rland-core/Makefile"],
      tools: tools({ go: false }),
      stack: stackReport([]),
    });
    const calls = [];
    const outcome = await runVerifyPlan(plan, async (spec) => {
      calls.push(spec);
      return 0;
    });
    assert.deepEqual(calls, [{
      command: "pnpm",
      args: ["test:e2e"],
      cwd: path.join(workspace, "rland-ui"),
    }]);
    assert.equal(outcome.ok, false);
    assert.deepEqual(outcome.blocked, ["rland-core"]);
  });

  it("accepts an infra flow when the stack is up and does not spawn a suite", async () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-infra"],
      existingRepos: ["rland-infra"],
      tools: tools(),
      stack: stackReport([
        { id: "proxy", up: true },
        { id: "rland-web", up: true },
        { id: "auth", up: true },
        { id: "core", up: true },
      ]),
    });
    let called = false;
    const outcome = await runVerifyPlan(plan, async () => {
      called = true;
      return 0;
    });
    assert.equal(called, false);
    assert.equal(outcome.ok, true);
    assert.deepEqual(outcome.results, [{ repo: "rland-infra", kind: "flow", code: 0 }]);
  });

  it("is not ok when the only selection has no command", async () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-sql"],
      existingRepos: ["rland-sql"],
      tools: tools(),
      stack: stackReport([]),
    });
    const outcome = await runVerifyPlan(plan, async () => 0);
    assert.equal(outcome.ok, false);
    assert.deepEqual(outcome.results, []);
  });
});

describe("catalog", () => {
  it("plans rland-mcp from vitest and the optional :8082 probe", () => {
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["rland-mcp"],
      existingRepos: ["rland-mcp"],
      existingFiles: ["rland-mcp/package.json"],
      tools: tools(),
      stack: stackReport([{ id: "mcp", up: true }]),
    });
    const mcp = plan.checks[0];
    assert.equal(mcp.command, "pnpm test");
    assert.equal(mcp.canRun, true);
    assert.equal(mcp.flow.canRun, true);
    assert.deepEqual(mcp.flow.services, ["mcp"]);
  });

  it("overrides a built-in check and adds a repo from RLAND_CHECKS", () => {
    const catalog = mergeChecks(
      [{ repo: "rland-ui", kind: "playwright", command: "pnpm", args: ["test:e2e"], summary: "", flowServices: ["proxy"] }],
      parseCheckList("rland-ui|pnpm test|;billing-api|npm test|api"),
    );
    assert.equal(catalog.find((check) => check.repo === "rland-ui").args.join(" "), "test");
    const probes = parseProbeList("api|http://127.0.0.1:9090/health|required");
    const stack = stackReport([{ id: "api", up: true }], probes);
    assert.equal(stack.ready, true);
    assert.equal(stack.checks.length, 1);
    const plan = buildVerifyPlan({
      workspace,
      catalog,
      repoNames: ["billing-api"],
      existingRepos: ["billing-api"],
      existingFiles: ["billing-api/package.json"],
      tools: tools({ npm: true }),
      stack,
    });
    assert.equal(plan.checks[0].command, "npm test");
    assert.equal(plan.checks[0].canRun, true);
    assert.equal(plan.checks[0].flow.canRun, true);
  });

  it("infers a suite from package.json and marks a name that is not on disk", () => {
    const inferred = inferCheck({
      repo: "billing-api",
      packageJson: '{"packageManager":"npm@10.0.0","scripts":{"test":"node --test"}}\n',
      makefile: "test:\n\tgo test\n",
    });
    assert.equal(inferred.kind, "node");
    assert.equal(inferred.command, "npm");
    const plan = buildVerifyPlan({
      workspace,
      repoNames: ["nope"],
      existingRepos: [],
      tools: tools(),
      stack: stackReport([]),
    });
    assert.equal(plan.checks[0].canRun, false);
    assert.match(plan.checks[0].reason, /unknown repo nope/);
  });

  it("rejects a malformed check or probe entry", () => {
    assert.throws(() => parseCheckList("billing-api"), /RLAND_CHECKS/);
    assert.throws(() => parseProbeList("api"), /RLAND_PROBES/);
    assert.equal(parseProbeList("  "), null);
  });

  it("prints JSON only on stdout and notes on stderr", () => {
    const out = [];
    const err = [];
    emitCli({
      json: true,
      payload: { run: { mode: "stack" } },
      notes: ["Nothing ran. Re-run with --yes to run the checks that can."],
    }, {
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    assert.deepEqual(JSON.parse(out.join("\n")), { run: { mode: "stack" } });
    assert.equal(out.length, 1);
    assert.match(err.join("\n"), /Nothing ran/);
  });
});
