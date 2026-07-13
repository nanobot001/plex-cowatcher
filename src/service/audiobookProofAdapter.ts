import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import type { ChapterActivationInput, ChapterActivationItem } from "./audiobookChapterActivationService.js";

const STDOUT_LIMIT = 2 * 1024 * 1024;
const STDERR_LIMIT = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_CHAPTERS = 5_000;
const MAX_TITLE_LENGTH = 500;
const MAX_WARNING_COUNT = 50;
const DURATION_TOLERANCE_MS = 10_000;
const EMBEDDED_STARTS_INVALID_WARNING = "EMBEDDED_STARTS_INVALID";
const EMBEDDED_VALIDATION_REJECTED_WARNING = "EMBEDDED_VALIDATION_REJECTED";

export type AudiobookProofSafeCode =
  | "PROOF_NOT_CONFIGURED"
  | "INVALID_ASIN"
  | "EXTERNAL_INSPECT_FAILED"
  | "EXTERNAL_VALIDATE_FAILED"
  | "EXTERNAL_RESOLVE_FAILED"
  | "EXTERNAL_ERROR_ENVELOPE"
  | "UNSUPPORTED_CONTRACT_VERSION"
  | "MALFORMED_EXTERNAL_OUTPUT"
  | "EXTERNAL_OUTPUT_LIMIT"
  | "EXTERNAL_TIMEOUT"
  | "EXTERNAL_FILE_UNAVAILABLE"
  | "INVALID_CHAPTERS"
  | "DURATION_MISMATCH"
  | "LOW_CONFIDENCE";

export interface AudiobookProofCandidate {
  chapters: ChapterActivationItem[];
  sourceType: "embedded" | "audnexus" | "whisper_verified";
  confidence: number;
  contractVersion: 1;
  warnings: string[];
}

export interface AudiobookProofDiagnostic {
  source: "audnexus" | "silence_detection" | "unknown";
  confidence: "medium" | "low" | "mixed";
  chapterCount: number;
  warnings: string[];
}

export type AudiobookProofResult =
  | { status: "activatable"; candidate: AudiobookProofCandidate; commands: CommandName[] }
  | { status: "diagnostic"; code: "LOW_CONFIDENCE"; retryable: false; diagnostic: AudiobookProofDiagnostic; commands: CommandName[] }
  | { status: "failed"; code: AudiobookProofSafeCode; retryable: boolean; commands: CommandName[] };

export interface AudiobookProofInput {
  privateFilePath: string;
  durationMs: number;
  asin?: string;
  whisper?: boolean;
}

type SpawnLike = (
  executable: string,
  args: readonly string[],
  options: SpawnOptionsWithoutStdio
) => ChildProcessWithoutNullStreams;

type KillTree = (child: ChildProcessWithoutNullStreams) => void;

export interface AudiobookProofAdapterOptions {
  executablePath: string;
  scriptPath: string;
  whisperEnabled?: boolean;
  timeoutMs?: number;
  spawnProcess?: SpawnLike;
  killProcessTree?: KillTree;
}

type CommandName = "inspect" | "validate" | "resolve";

class SafeProofError extends Error {
  constructor(readonly code: AudiobookProofSafeCode, readonly retryable = false) {
    super(code);
  }
}

export class AudiobookProofAdapter {
  private readonly executablePath: string;
  private readonly scriptPath: string;
  private readonly workingDirectory: string;
  private readonly whisperEnabled: boolean;
  private readonly timeoutMs: number;
  private readonly spawnProcess: SpawnLike;
  private readonly killProcessTree: KillTree;

  constructor(options: AudiobookProofAdapterOptions) {
    this.executablePath = options.executablePath.trim();
    this.scriptPath = options.scriptPath.trim() ? path.resolve(options.scriptPath) : "";
    this.workingDirectory = this.scriptPath ? path.dirname(this.scriptPath) : process.cwd();
    this.whisperEnabled = options.whisperEnabled ?? false;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.spawnProcess = options.spawnProcess ?? ((executable, args, spawnOptions) =>
      spawn(executable, args, spawnOptions));
    this.killProcessTree = options.killProcessTree ?? terminateProcessTree;
  }

  async prove(input: AudiobookProofInput): Promise<AudiobookProofResult> {
    const commands: CommandName[] = [];
    if (!this.executablePath || !this.scriptPath) {
      return failed("PROOF_NOT_CONFIGURED", false, commands);
    }
    const asin = input.asin?.trim().toUpperCase();
    if (asin && !/^[A-Z0-9]{10}$/.test(asin)) {
      return failed("INVALID_ASIN", false, commands);
    }
    if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
      return failed("INVALID_CHAPTERS", false, commands);
    }

    try {
      commands.push("inspect");
      const inspect = await this.runCommand("inspect", input.privateFilePath);
      const inspectData = requireObject(inspect.data);
      const inspectedDuration = Math.round(finiteNumber(inspectData.duration_s) * 1_000);
      if (!Number.isInteger(inspectData.chapter_count) || inspectData.chapter_count < 0 ||
          !Number.isFinite(inspectedDuration) || inspectedDuration <= 0) {
        throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
      }
      if (!Array.isArray(inspectData.chapters) || inspectData.chapters.length > MAX_CHAPTERS ||
          inspectData.chapter_count !== inspectData.chapters.length) {
        throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
      }
      if (Math.abs(inspectedDuration - input.durationMs) > DURATION_TOLERANCE_MS) {
        throw new SafeProofError("DURATION_MISMATCH");
      }

      let embeddedRejectionWarning: string | undefined;
      if (inspectData.chapters.length >= 2) {
        commands.push("validate");
        const validation = await this.runCommand("validate", input.privateFilePath);
        const validationData = requireObject(validation.data);
        validateValidationContract(validationData);
        if (validationData.has_chapters === true && validationData.chapter_count === inspectData.chapter_count) {
          try {
            const embedded = normalizeEmbeddedChapters(inspectData.chapters, inspectedDuration);
            validateChapterTimeline(embedded, inspectedDuration);
            return {
              status: "activatable",
              candidate: {
                chapters: embedded,
                sourceType: "embedded",
                confidence: 1,
                contractVersion: 1,
                warnings: []
              },
              commands
            };
          } catch (error) {
            if (!(error instanceof SafeProofError) || error.code !== "INVALID_CHAPTERS") throw error;
            embeddedRejectionWarning = EMBEDDED_STARTS_INVALID_WARNING;
          }
        } else {
          embeddedRejectionWarning = EMBEDDED_VALIDATION_REJECTED_WARNING;
        }
      }

      commands.push("resolve");
      const resolveArgs = asin ? ["--asin", asin] : [];
      const useWhisper = Boolean(input.whisper && this.whisperEnabled);
      if (useWhisper) resolveArgs.push("--whisper");
      const resolved = await this.runCommand("resolve", input.privateFilePath, resolveArgs);
      const resolveData = requireObject(resolved.data);
      const resolvedDuration = finiteNumber(resolveData.total_duration_ms);
      if (!Number.isFinite(resolvedDuration) || resolvedDuration <= 0 ||
          typeof resolveData.source !== "string" || typeof resolveData.whisper_verified !== "boolean" ||
          typeof resolveData.whisper_available !== "boolean" || !Array.isArray(resolveData.warnings)) {
        throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
      }
      if (Math.abs(resolvedDuration - input.durationMs) > DURATION_TOLERANCE_MS) {
        throw new SafeProofError("DURATION_MISMATCH");
      }
      const chapters = parseChapters(resolveData.chapters, true);
      validateChapterTimeline(chapters, input.durationMs);
      const warnings = mergeWarnings(boundedWarnings(resolveData.warnings), embeddedRejectionWarning);
      const source = typeof resolveData.source === "string" ? resolveData.source.toLowerCase() : "";
      const whisperVerified = resolveData.whisper_verified === true;
      const allHighConfidence = chapters.every((chapter) =>
        chapter.__confidence === "high" && chapter.__source === "audnexus"
      );
      const sanitizedChapters = chapters.map(({ index, title, start_offset_ms, end_offset_ms }) => ({
        index, title, start_offset_ms, end_offset_ms
      }));

      if (source === "audnexus" && allHighConfidence) {
        return {
          status: "activatable",
          candidate: { chapters: sanitizedChapters, sourceType: "audnexus", confidence: 0.95, contractVersion: 1, warnings },
          commands
        };
      }
      if (whisperVerified && useWhisper) {
        return {
          status: "activatable",
          candidate: { chapters: sanitizedChapters, sourceType: "whisper_verified", confidence: 0.9, contractVersion: 1, warnings },
          commands
        };
      }
      const confidenceLevels = new Set(chapters.map((chapter) => chapter.__confidence));
      const diagnosticConfidence = confidenceLevels.size === 1 && confidenceLevels.has("medium")
        ? "medium"
        : confidenceLevels.size === 1 && confidenceLevels.has("low")
          ? "low"
          : "mixed";
      return {
        status: "diagnostic",
        code: "LOW_CONFIDENCE",
        retryable: false,
        diagnostic: {
          source: source === "audnexus" || source === "silence_detection" ? source : "unknown",
          confidence: diagnosticConfidence,
          chapterCount: chapters.length,
          warnings
        },
        commands
      };
    } catch (error) {
      const safe = error instanceof SafeProofError ? error : new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
      return failed(safe.code, safe.retryable, commands);
    }
  }

  async proveAndActivate(
    input: AudiobookProofInput,
    activationBase: Pick<ChapterActivationInput, "audiobookId" | "mediaRevision" | "activatedAt">,
    activate: (input: ChapterActivationInput) => unknown
  ): Promise<AudiobookProofResult> {
    const result = await this.prove(input);
    if (result.status !== "activatable") return result;
    activate({
      ...activationBase,
      chapters: result.candidate.chapters,
      sourceType: result.candidate.sourceType,
      sourceStatus: "active",
      confidence: result.candidate.confidence,
      contractVersion: result.candidate.contractVersion,
      warnings: result.candidate.warnings
    });
    return result;
  }

  private runCommand(command: CommandName, privateFilePath: string, extraArgs: string[] = []): Promise<any> {
    const args = [this.scriptPath, command, "--file", privateFilePath, ...extraArgs, "--json"];
    return new Promise((resolve, reject) => {
      const child = this.spawnProcess(this.executablePath, args, {
        cwd: this.workingDirectory,
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
      const rejectSafe = (error: SafeProofError) => finish(() => {
        try {
          this.killProcessTree(child);
        } finally {
          reject(error);
        }
      });
      child.stdout.on("data", (chunk: Buffer | string) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        stdoutBytes += value.length;
        if (stdoutBytes > STDOUT_LIMIT) return rejectSafe(new SafeProofError("EXTERNAL_OUTPUT_LIMIT"));
        stdout.push(value);
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderrBytes += Buffer.byteLength(chunk);
        if (stderrBytes > STDERR_LIMIT) rejectSafe(new SafeProofError("EXTERNAL_OUTPUT_LIMIT"));
      });
      child.on("error", () => finish(() => reject(new SafeProofError(commandFailureCode(command), true))));
      child.on("close", () => finish(() => {
        try {
          const envelope = JSON.parse(Buffer.concat(stdout).toString("utf8"));
          validateEnvelope(envelope);
          if (envelope.ok !== true) {
            if (envelope?.error?.code === "FILE_NOT_FOUND") {
              throw new SafeProofError("EXTERNAL_FILE_UNAVAILABLE", true);
            }
            throw new SafeProofError("EXTERNAL_ERROR_ENVELOPE", isTransientEnvelope(envelope));
          }
          resolve(envelope);
        } catch (error) {
          reject(error instanceof SafeProofError ? error : new SafeProofError("MALFORMED_EXTERNAL_OUTPUT"));
        }
      }));
      timer = setTimeout(() => rejectSafe(new SafeProofError("EXTERNAL_TIMEOUT", true)), this.timeoutMs);
    });
  }
}

function validateEnvelope(envelope: any): void {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope) || typeof envelope.ok !== "boolean") {
    throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
  }
  const explicitVersion = envelope.contract_version ?? envelope.version;
  if (explicitVersion !== undefined && explicitVersion !== 1 && explicitVersion !== "1") {
    throw new SafeProofError("UNSUPPORTED_CONTRACT_VERSION");
  }
  if (envelope.ok === true && (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data))) {
    throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
  }
}

function parseChapters(
  value: unknown,
  includeConfidence: boolean
): Array<ChapterActivationItem & { __confidence?: string; __source?: string }> {
  if (!Array.isArray(value) || value.length > MAX_CHAPTERS) throw new SafeProofError("INVALID_CHAPTERS");
  return value.map((raw, offset) => {
    const chapter = requireObject(raw);
    const title = typeof chapter.title === "string" ? chapter.title.trim() : "";
    const start = finiteNumber(chapter.start_ms);
    const end = finiteNumber(chapter.end_ms);
    if (!title || title.length > MAX_TITLE_LENGTH || !Number.isInteger(start) || !Number.isInteger(end)) {
      throw new SafeProofError("INVALID_CHAPTERS");
    }
    const confidence = includeConfidence && typeof chapter.confidence === "string"
      ? chapter.confidence.toLowerCase()
      : undefined;
    const source = includeConfidence && typeof chapter.source === "string" ? chapter.source.toLowerCase() : undefined;
    if (includeConfidence && !["high", "medium", "low"].includes(confidence ?? "")) {
      throw new SafeProofError("INVALID_CHAPTERS");
    }
    if (includeConfidence && !["audnexus", "silence_detection"].includes(source ?? "")) {
      throw new SafeProofError("INVALID_CHAPTERS");
    }
    return {
      index: offset + 1,
      title,
      start_offset_ms: start,
      end_offset_ms: end,
      __confidence: confidence,
      __source: source
    };
  });
}

function normalizeEmbeddedChapters(value: unknown, durationMs: number): ChapterActivationItem[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > MAX_CHAPTERS ||
      !Number.isInteger(durationMs) || durationMs <= 0) {
    throw new SafeProofError("INVALID_CHAPTERS");
  }
  const starts = value.map((raw, offset) => {
    const chapter = requireObject(raw);
    const title = typeof chapter.title === "string" ? chapter.title.trim() : "";
    const start = finiteNumber(chapter.start_ms);
    const suppliedEnd = finiteNumber(chapter.end_ms);
    if (!title || title.length > MAX_TITLE_LENGTH || !Number.isInteger(start) || !Number.isInteger(suppliedEnd) ||
        start < 0 || start >= durationMs || (offset > 0 && start <= finiteNumber(requireObject(value[offset - 1]).start_ms))) {
      throw new SafeProofError("INVALID_CHAPTERS");
    }
    return { title, start };
  });
  return starts.map((chapter, offset) => ({
    index: offset + 1,
    title: chapter.title,
    start_offset_ms: chapter.start,
    end_offset_ms: starts[offset + 1]?.start ?? durationMs
  }));
}

function validateChapterTimeline(chapters: ChapterActivationItem[], durationMs: number): void {
  if (chapters.length < 2 || !Number.isFinite(durationMs) || durationMs <= 0) {
    throw new SafeProofError("INVALID_CHAPTERS");
  }
  let priorEnd = -1;
  for (const chapter of chapters) {
    if (chapter.start_offset_ms < 0 || chapter.end_offset_ms <= chapter.start_offset_ms ||
        chapter.start_offset_ms < priorEnd || chapter.end_offset_ms > durationMs) {
      throw new SafeProofError("INVALID_CHAPTERS");
    }
    priorEnd = chapter.end_offset_ms;
  }
  if (Math.abs(priorEnd - durationMs) > DURATION_TOLERANCE_MS) {
    throw new SafeProofError("DURATION_MISMATCH");
  }
}

function validateValidationContract(value: Record<string, unknown>): void {
  const chapterCount = finiteNumber(value.chapter_count);
  if (typeof value.has_chapters !== "boolean" || !Number.isInteger(chapterCount) ||
      chapterCount < 0 ||
      ["overlapping_chapters", "short_chapters", "missing_titles", "duplicate_timestamps", "duplicate_titles"]
        .some((key) => {
          const count = finiteNumber(value[key]);
          return !Number.isInteger(count) || count < 0;
        }) ||
      !Number.isFinite(finiteNumber(value.duration_gap_s)) || finiteNumber(value.duration_gap_s) < 0) {
    throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
  }
}

function mergeWarnings(warnings: string[], embeddedRejectionWarning?: string): string[] {
  return [...new Set([...(embeddedRejectionWarning ? [embeddedRejectionWarning] : []), ...warnings])]
    .slice(0, MAX_WARNING_COUNT);
}

function boundedWarnings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, MAX_WARNING_COUNT)
    .filter((warning): warning is string => typeof warning === "string")
    .map((warning) => {
      const normalized = warning.toLowerCase();
      if (normalized.includes("not be fully accurate")) return "AUDNEXUS_ACCURACY_WARNING";
      if (normalized.includes("duration mismatch")) return "DURATION_WARNING";
      if (normalized.includes("high chapter count")) return "HIGH_CHAPTER_COUNT";
      return "EXTERNAL_WARNING";
    }))];
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function requireObject(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SafeProofError("MALFORMED_EXTERNAL_OUTPUT");
  return value as Record<string, any>;
}

function commandFailureCode(command: CommandName): AudiobookProofSafeCode {
  if (command === "inspect") return "EXTERNAL_INSPECT_FAILED";
  if (command === "validate") return "EXTERNAL_VALIDATE_FAILED";
  return "EXTERNAL_RESOLVE_FAILED";
}

function isTransientEnvelope(envelope: any): boolean {
  const code = typeof envelope?.error?.code === "string" ? envelope.error.code : "";
  return ["PROBE_FAILED", "RESOLVE_FAILED", "UNEXPECTED_ERROR"].includes(code);
}

function failed(code: AudiobookProofSafeCode, retryable: boolean, commands: CommandName[]): AudiobookProofResult {
  return { status: "failed", code, retryable, commands };
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
