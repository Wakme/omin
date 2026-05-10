import { createInterface } from "readline";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "..", "..", "data", "config.json");

const rl = createInterface({ input: process.stdin, output: process.stdout });

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

async function main() {
  console.log("=== Omni Setup ===\n");

  const appId = await question("Feishu App ID: ");
  const appSecret = await question("Feishu App Secret: ");

  const config = {
    feishu: { appId, appSecret },
  };

  const dir = dirname(CONFIG_PATH);
  await mkdir(dir, { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`\nConfig saved to ${CONFIG_PATH}`);
  console.log("\nNext steps:");
  console.log("  1. Create a Feishu group and add your Bot to it");
  console.log("  2. Run: npm run cli start");
  console.log("  3. Send a message in the Feishu group");
  console.log("  4. Run: npm run cli status  (see conversations)");

  rl.close();
}

main().catch(console.error);
