import { runCli } from "./codex/cli.js";

runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
