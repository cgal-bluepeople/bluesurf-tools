import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSpec } from "../src/spawn-command.js";

describe("spawnSpec", () => {
  it("does not launch bare npm on Windows, which fails with spawn npm ENOENT when only npm.cmd exists", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "npm-cmd-"));
    await writeFile(path.join(dir, "npm.cmd"), "@echo off\r\n");
    const symptom = await new Promise((resolve) => {
      const child = spawn("npm", ["install"], { env: { PATH: dir }, stdio: "pipe" });
      child.on("error", (error) => resolve(error.message));
      child.on("close", () => resolve("started"));
    });
    assert.equal(symptom, "spawn npm ENOENT");

    const spec = spawnSpec("npm", ["install"], {
      platform: "win32",
      comSpec: "C:\\Windows\\System32\\cmd.exe",
    });
    assert.equal(spec.command, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(spec.args, ["/d", "/s", "/c", '"npm install"']);
    assert.equal(spec.options.windowsVerbatimArguments, true);
  });

  it("quotes the skill glob so cmd.exe does not expand it", () => {
    const spec = spawnSpec(
      "npx",
      ["--yes", "skills@latest", "add", "mattpocock/skills", "-g", "-y", "--skill", "*", "-a", "claude-code"],
      { platform: "win32", comSpec: "cmd.exe" },
    );
    assert.equal(
      spec.args[3],
      '"npx --yes skills@latest add mattpocock/skills -g -y --skill "*" -a claude-code"',
    );
  });

  it("launches npm directly on macOS and Linux", () => {
    const spec = spawnSpec("npm", ["install"], { platform: "darwin" });
    assert.equal(spec.command, "npm");
    assert.deepEqual(spec.args, ["install"]);
    assert.equal(spec.options.windowsVerbatimArguments, undefined);
  });

  it("starts the npm installed on this machine", async () => {
    const spec = spawnSpec("npm", ["--version"]);
    const result = await new Promise((resolve) => {
      const child = spawn(spec.command, spec.args, { stdio: "pipe", ...spec.options });
      let out = "";
      child.stdout?.on("data", (chunk) => {
        out += chunk;
      });
      child.on("error", (error) => resolve({ code: 1, out: error.message }));
      child.on("close", (code) => resolve({ code, out }));
    });
    assert.equal(result.code, 0);
    assert.match(result.out, /\d+\.\d+\.\d+/);
  });
});
