/** Last skills CLI release before the package required Node 22.20 (uses fs/promises glob). */
export const SKILLS_CLI_FALLBACK = "skills@1.5.18";

export function skillsCliPackage(nodeVersion = process.version) {
  if (nodeVersionAtLeast(nodeVersion, 22, 20, 0)) return "skills@latest";
  return SKILLS_CLI_FALLBACK;
}

export function nodeVersionAtLeast(nodeVersion, major, minor, patch) {
  const parsed = parseNodeVersion(nodeVersion);
  if (!parsed) return false;
  if (parsed.major !== major) return parsed.major > major;
  if (parsed.minor !== minor) return parsed.minor > minor;
  return parsed.patch >= patch;
}

function parseNodeVersion(nodeVersion) {
  const match = String(nodeVersion).match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}
