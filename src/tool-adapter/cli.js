#!/usr/bin/env node
"use strict";

function timestamp() {
  return new Date().toISOString();
}

function printSuccess(tool, data) {
  console.log(JSON.stringify({ ok: true, tool, timestamp: timestamp(), data }, null, 2));
}

function printError(tool, code, message, options) {
  const detail = options || {};
  console.error(JSON.stringify({
    ok: false,
    tool,
    timestamp: timestamp(),
    error: {
      code,
      message,
      retryable: Boolean(detail.retryable),
      severity: detail.severity || "error"
    }
  }, null, 2));
  process.exitCode = 1;
}

function usage() {
  return [
    "Usage: node src/tool-adapter/cli.js <command>",
    "",
    "Commands:",
    "  status   Return project.status JSON.",
    "  health   Return project.health JSON."
  ].join("\n");
}

function main(argv) {
  const command = argv[2];
  if (command === "status") {
    printSuccess("project.status", { status: "ready" });
    return;
  }
  if (command === "health") {
    printSuccess("project.health", { status: "unknown", checks: [] });
    return;
  }
  printError("project.tool_adapter", "UNKNOWN_COMMAND", usage(), { severity: "warning" });
}

main(process.argv);
