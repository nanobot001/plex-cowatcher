import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";
import type { ConfiguredUser } from "../types/index.js";

dotenv.config();

export const usersConfigPath = "config/users.json";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  APP_HOST: z.string().default("127.0.0.1"),
  APP_PORT: z.coerce.number().default(8787),
  APP_BASE_URL: z.string().default("http://localhost:8787"),
  PLEX_BASE_URL: z.string().default("http://127.0.0.1:32400"),
  PLEX_TOKEN: z.string().default(""),
  PLEX_MUTATION_MODE: z.enum(["mock", "live"]).default("mock"),
  TAUTULLI_BASE_URL: z.string().default("http://127.0.0.1:8181"),
  TAUTULLI_API_KEY: z.string().default(""),
  DISCORD_BOT_TOKEN: z.string().default(""),
  DISCORD_CHANNEL_ID: z.string().default(""),
  DISCORD_ENABLED: z
    .preprocess((value) => {
      if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
      return value;
    }, z.boolean())
    .default(false),
  SQLITE_PATH: z.string().default("./data/plex-cowatch-sync.sqlite"),
  POLL_INTERVAL_SECONDS: z.coerce.number().default(60),
  WATCH_COMPLETION_THRESHOLD_PERCENT: z.coerce.number().default(90),
  PROMPT_DELAY_SECONDS: z.coerce.number().default(60)
});

export const appConfig = envSchema.parse(process.env);

export interface UsersConfigSummary {
  exists: boolean;
  sourceUserCount: number;
  typicalCowatcherCount: number;
  enabledUserCount: number;
}

interface UsersConfigFile {
  sourceUsers?: ConfiguredUser[];
  typicalCowatchUsers?: ConfiguredUser[];
}

function readUsersConfig(filePath = usersConfigPath): UsersConfigFile | undefined {
  const absolute = path.resolve(filePath);
  if (!fs.existsSync(absolute)) return undefined;

  return JSON.parse(fs.readFileSync(absolute, "utf8")) as UsersConfigFile;
}

export function readConfiguredUsers(filePath = usersConfigPath): ConfiguredUser[] {
  const parsed = readUsersConfig(filePath);
  if (!parsed) return [];

  const sourceUsers = (parsed.sourceUsers ?? []).map((user) => ({
    ...user,
    isSourceUser: true,
    isTypicalCowatcher: false,
    enabled: user.enabled !== false
  }));

  const typicalUsers = (parsed.typicalCowatchUsers ?? []).map((user) => ({
    ...user,
    isSourceUser: false,
    isTypicalCowatcher: true,
    enabled: user.enabled !== false
  }));

  return [...sourceUsers, ...typicalUsers];
}

export function getUsersConfigSummary(filePath = usersConfigPath): UsersConfigSummary {
  const parsed = readUsersConfig(filePath);
  if (!parsed) {
    return {
      exists: false,
      sourceUserCount: 0,
      typicalCowatcherCount: 0,
      enabledUserCount: 0
    };
  }

  const sourceUsers = parsed.sourceUsers ?? [];
  const typicalCowatchers = parsed.typicalCowatchUsers ?? [];
  const allUsers = [...sourceUsers, ...typicalCowatchers];

  return {
    exists: true,
    sourceUserCount: sourceUsers.filter((user) => user.enabled !== false).length,
    typicalCowatcherCount: typicalCowatchers.filter((user) => user.enabled !== false).length,
    enabledUserCount: allUsers.filter((user) => user.enabled !== false).length
  };
}
