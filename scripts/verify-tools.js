import fs from "fs";
import path from "path";

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, "docs/tool-manifest.yaml");
const cliPath = path.join(projectRoot, "src/cli/cli.ts");
const routesPath = path.join(projectRoot, "src/server/routes.ts");

console.log("Verifying Phase 2 tool contracts...");

if (!fs.existsSync(manifestPath)) {
  console.error("FAIL: docs/tool-manifest.yaml not found.");
  process.exit(1);
}
const manifestContent = fs.readFileSync(manifestPath, "utf8");

const expectedTools = [
  "project.status",
  "project.health",
  "project.recent_events",
  "project.recent_errors",
  "project.tail_logs",
  "project.watch_history",
  "project.watch_summary",
  "project.viewing_sessions",
  "project.cowatching",
  "project.audiobook_backfill"
];

for (const tool of expectedTools) {
  if (!manifestContent.includes(tool)) {
    console.error(`FAIL: Tool "${tool}" not declared in docs/tool-manifest.yaml`);
    process.exit(1);
  }
}
console.log("ok - All expected tools declared in manifest.");

if (!fs.existsSync(cliPath)) {
  console.error("FAIL: src/cli/cli.ts not found.");
  process.exit(1);
}
const cliContent = fs.readFileSync(cliPath, "utf8");

const expectedCliCommands = [
  "watch-history",
  "watch-summary",
  "viewing-sessions",
  "cowatching",
  "audiobook-backfill"
];

for (const cmd of expectedCliCommands) {
  if (!cliContent.includes(`case "${cmd}":`)) {
    console.error(`FAIL: CLI subcommand "${cmd}" not implemented in src/cli/cli.ts`);
    process.exit(1);
  }
}
console.log("ok - All expected CLI subcommands implemented.");

if (!fs.existsSync(routesPath)) {
  console.error("FAIL: src/server/routes.ts not found.");
  process.exit(1);
}
const routesContent = fs.readFileSync(routesPath, "utf8");

const expectedRoutes = [
  "/api/watch-history",
  "/api/watch-summary",
  "/api/viewing-sessions",
  "/api/cowatching"
];

for (const route of expectedRoutes) {
  if (!routesContent.includes(`"${route}"`) && !routesContent.includes(`'${route}'`)) {
    console.error(`FAIL: HTTP route "${route}" not declared in src/server/routes.ts`);
    process.exit(1);
  }
}
console.log("ok - All expected HTTP routes registered.");

console.log("All tool contract verifications PASSED.");
