import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "preview"].includes(command)) {
  console.error(
    "Usage: node scripts/run-offline.mjs <dev|build|preview> [Vite options]",
  );
  process.exitCode = 1;
} else {
  // Invoke package binaries with the current Node runtime: no shell-specific
  // assignment, executable suffix, or additional dependency is required.
  const env = { ...process.env, VITE_RESOURCE_MODE: "offline" };
  async function run(binary, options) {
    return await new Promise((resolveExit) => {
      const child = spawn(
        process.execPath,
        [resolve(root, binary), ...options],
        {
          cwd: root,
          env,
          stdio: "inherit",
          windowsHide: true,
        },
      );
      const interrupt = () => child.kill("SIGINT");
      const terminate = () => child.kill("SIGTERM");
      process.on("SIGINT", interrupt);
      process.on("SIGTERM", terminate);
      const cleanup = () => {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", terminate);
      };
      child.once("error", (error) => {
        cleanup();
        console.error(error.message);
        resolveExit(1);
      });
      child.once("exit", (code) => {
        cleanup();
        resolveExit(code ?? 1);
      });
    });
  }
  const checked =
    command === "build"
      ? await run("node_modules/typescript/bin/tsc", ["-b"])
      : 0;
  process.exitCode =
    checked ||
    (await run("node_modules/vite/bin/vite.js", [
      ...(command === "dev" ? [] : [command]),
      ...args,
    ]));
}
