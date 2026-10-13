// On Windows, npm and npx are npm.cmd / npx.cmd. spawn("npm") looks for npm.exe
// and fails with "spawn npm ENOENT". cmd.exe resolves the .cmd shim. The
// skill selector "*" must stay quoted or cmd.exe expands it to filenames.
export function spawnSpec(command, args, { platform = process.platform, comSpec = process.env.ComSpec } = {}) {
  if (platform !== "win32") {
    return { command, args, options: {} };
  }
  const line = [command, ...args].map(quoteCmdArg).join(" ");
  return {
    command: comSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    options: { windowsVerbatimArguments: true },
  };
}

function quoteCmdArg(arg) {
  if (/^[\w@./:+-]+$/.test(arg)) return arg;
  return `"${String(arg).replaceAll('"', '""')}"`;
}
