import fs from "node:fs";
import path from "node:path";
import { nowIso } from "./time.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogPayload {
  action?: string;
  message: string;
  [key: string]: unknown;
}

function redact(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (value.length < 12) return value;
  return value.replace(/([A-Za-z0-9_-]{8})[A-Za-z0-9_.-]+/g, "$1...[redacted]");
}

export function log(level: LogLevel, payload: LogPayload): void {
  const entry = {
    timestamp: nowIso(),
    level,
    service: "plex-cowatch-service",
    ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, redact(value)]))
  };

  const line = `${JSON.stringify(entry)}\n`;
  const logDir = path.resolve("logs");
  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, level === "error" ? "error.log" : "app.log"), line);

  if (level === "error") {
    console.error(line.trim());
  } else {
    console.log(line.trim());
  }
}
