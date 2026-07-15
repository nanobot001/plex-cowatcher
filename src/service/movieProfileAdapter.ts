import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import type {
  DashboardMovieProfile,
  DashboardMovieProfileReadResult,
  DashboardMovieProfileUnavailableReason
} from "../types/api.js";

const STDOUT_LIMIT = 64 * 1024;
const STDERR_LIMIT = 8 * 1024;
const DEFAULT_TIMEOUT_MS = 1_500;
const MAX_LIST_ITEMS = 16;

export interface MovieProfileLookupInput {
  ratingKey: string;
  imdbId?: string;
  tmdbId?: number;
  title?: string;
  year?: number;
}

type SpawnLike = (
  executable: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

type KillTree = (child: ChildProcessWithoutNullStreams) => void;

export interface MovieProfileAdapterLike {
  fetchProfile(input: MovieProfileLookupInput): Promise<DashboardMovieProfileReadResult>;
}

export interface MovieProfileAdapterOptions {
  executablePath: string;
  projectRoot: string;
  pythonVersion?: string;
  timeoutMs?: number;
  spawnProcess?: SpawnLike;
  killProcessTree?: KillTree;
}

class SafeMovieProfileError extends Error {
  constructor(readonly reason: DashboardMovieProfileUnavailableReason) {
    super(reason);
  }
}

export class MovieProfileAdapter implements MovieProfileAdapterLike {
  private readonly executablePath: string;
  private readonly projectRoot: string;
  private readonly pythonVersion: string;
  private readonly timeoutMs: number;
  private readonly spawnProcess: SpawnLike;
  private readonly killProcessTree: KillTree;

  constructor(options: MovieProfileAdapterOptions) {
    this.executablePath = options.executablePath.trim();
    this.projectRoot = options.projectRoot.trim() ? path.resolve(options.projectRoot) : "";
    this.pythonVersion = options.pythonVersion?.trim() || "3.12";
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.spawnProcess = options.spawnProcess ?? ((executable, args, spawnOptions) => spawn(executable, args, spawnOptions));
    this.killProcessTree = options.killProcessTree ?? terminateProcessTree;
  }

  async fetchProfile(input: MovieProfileLookupInput): Promise<DashboardMovieProfileReadResult> {
    if (!this.executablePath || !this.projectRoot) return unavailable("not_configured");
    if (!isSafeRatingKey(input.ratingKey)) return unavailable("invalid_response");

    const args = [
      ...(path.basename(this.executablePath).toLowerCase() === "py.exe" || path.basename(this.executablePath).toLowerCase() === "py" ? [`-${this.pythonVersion}`] : []),
      "-m",
      "moviebot.cli.tool_cli",
      "exact-profile",
      "--rating-key",
      input.ratingKey
    ];
    if (input.imdbId && /^tt\d{5,12}$/i.test(input.imdbId)) args.push("--imdb-id", input.imdbId);
    if (Number.isInteger(input.tmdbId) && Number(input.tmdbId) > 0) args.push("--tmdb-id", String(input.tmdbId));
    if (input.title && input.title.length <= 200 && Number.isInteger(input.year)) {
      args.push("--title", input.title, "--year", String(input.year));
    }
    args.push("--json");

    try {
      const envelope = await this.run(args);
      return normalizeEnvelope(envelope);
    } catch (error) {
      return unavailable(error instanceof SafeMovieProfileError ? error.reason : "upstream_unavailable");
    }
  }

  private run(args: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(this.executablePath, args, {
        cwd: this.projectRoot,
        env: { ...process.env, PYTHONPATH: path.join(this.projectRoot, "src") },
        shell: false,
        windowsHide: true,
        stdio: "pipe"
      });
      const stdout: Buffer[] = [];
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let settled = false;
      let timer: NodeJS.Timeout;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback();
      };
      const rejectSafe = (reason: DashboardMovieProfileUnavailableReason, kill = false) => finish(() => {
        if (kill) this.killProcessTree(child);
        reject(new SafeMovieProfileError(reason));
      });
      child.stdout.on("data", (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdoutBytes += value.length;
        if (stdoutBytes > STDOUT_LIMIT) return rejectSafe("invalid_response", true);
        stdout.push(value);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderrBytes += Buffer.byteLength(chunk);
        if (stderrBytes > STDERR_LIMIT) rejectSafe("invalid_response", true);
      });
      child.on("error", () => rejectSafe("upstream_unavailable"));
      child.on("close", (code) => finish(() => {
        if (code !== 0) return reject(new SafeMovieProfileError("upstream_unavailable"));
        try {
          resolve(JSON.parse(Buffer.concat(stdout).toString("utf8")));
        } catch {
          reject(new SafeMovieProfileError("invalid_response"));
        }
      }));
      timer = setTimeout(() => rejectSafe("timeout", true), this.timeoutMs);
    });
  }
}

function normalizeEnvelope(value: unknown): DashboardMovieProfileReadResult {
  const envelope = requireObject(value);
  if (envelope.ok !== true) throw new SafeMovieProfileError("upstream_unavailable");
  const data = requireObject(envelope.data);
  if (data.schema_version !== 1 && data.schema_version !== "1") throw new SafeMovieProfileError("invalid_response");
  if (data.status === "not_found") return unavailable("not_found");
  if (data.status === "ambiguous") return unavailable("ambiguous");
  if (data.status !== "available") throw new SafeMovieProfileError("invalid_response");
  const raw = requireObject(data.profile);
  const title = safeString(raw.title, 300);
  if (!title) throw new SafeMovieProfileError("invalid_response");
  const profile: DashboardMovieProfile = {
    schemaVersion: 1,
    title,
    releaseYear: optionalInteger(raw.release_year, 1800, 3000),
    releaseDate: optionalString(raw.release_date, 40),
    runtimeMinutes: optionalInteger(raw.runtime_minutes, 1, 24 * 60),
    genres: safeStringList(raw.genres, MAX_LIST_ITEMS, 80),
    directors: safeStringList(raw.directors, 8, 120),
    cast: safeStringList(raw.cast, 12, 120),
    studios: safeStringList(raw.studios, 8, 160),
    countries: safeStringList(raw.countries, 8, 100),
    contentRating: optionalString(raw.content_rating, 40),
    tagline: optionalString(raw.tagline, 300),
    synopsis: optionalString(raw.synopsis, 4_000),
    imdbId: typeof raw.imdb_id === "string" && /^tt\d{5,12}$/i.test(raw.imdb_id) ? raw.imdb_id : null,
    tmdbId: optionalInteger(raw.tmdb_id, 1, Number.MAX_SAFE_INTEGER),
    brandTags: safeStringList(raw.brand_tags, MAX_LIST_ITEMS, 120),
    franchiseTags: safeStringList(raw.franchise_tags, MAX_LIST_ITEMS, 120),
    universeTags: safeStringList(raw.universe_tags, MAX_LIST_ITEMS, 120),
    sourcePropertyTags: safeStringList(raw.source_property_tags, MAX_LIST_ITEMS, 120),
    source: "media-bot",
    refreshedAt: optionalString(raw.refreshed_at, 80)
  };
  return { status: "available", profile, cached: false };
}

function unavailable(reason: DashboardMovieProfileUnavailableReason): DashboardMovieProfileReadResult {
  return { status: "unavailable", reason };
}

function requireObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafeMovieProfileError("invalid_response");
  return value as Record<string, any>;
}

function safeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function optionalString(value: unknown, maxLength: number): string | null {
  return safeString(value, maxLength) || null;
}

function safeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > maxItems) throw new SafeMovieProfileError("invalid_response");
  const result: string[] = [];
  for (const raw of value) {
    const item = safeString(raw, maxLength);
    if (!item) throw new SafeMovieProfileError("invalid_response");
    if (!result.includes(item)) result.push(item);
  }
  return result;
}

function optionalInteger(value: unknown, min: number, max: number): number | null {
  if (value == null) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function isSafeRatingKey(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,200}$/.test(value);
}

function terminateProcessTree(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) {
    child.kill("SIGKILL");
    return;
  }
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("error", () => child.kill("SIGKILL"));
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}
