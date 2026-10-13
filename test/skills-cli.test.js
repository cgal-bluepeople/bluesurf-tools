import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SKILLS_CLI_FALLBACK, skillsCliPackage } from "../src/skills-cli.js";

describe("skillsCliPackage", () => {
  it("uses skills@latest on Node 22.20 and newer", () => {
    assert.equal(skillsCliPackage("v22.20.0"), "skills@latest");
    assert.equal(skillsCliPackage("v26.7.0"), "skills@latest");
  });

  it("uses the pinned CLI on Node 20, which cannot import glob from fs/promises", () => {
    assert.equal(skillsCliPackage("v20.19.4"), SKILLS_CLI_FALLBACK);
    assert.equal(SKILLS_CLI_FALLBACK, "skills@1.5.18");
  });
});
