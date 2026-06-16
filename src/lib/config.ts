import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CliConfig {
  apiKey?: string;
  workspaceId?: string;
  baseUrl?: string;
  /**
   * Default container tag (tenant boundary, e.g. "user:jane") applied to
   * add/search/list when no per-command --container flag is given. Only ever
   * set from explicit user input (config/env) — never a hardcoded fallback,
   * so we can't leak across tenants.
   */
  defaultContainerTag?: string;
  workspaces?: Array<{ id: string; name?: string }>;
  updatedAt?: string;
}

const CONFIG_DIR_NAME = ".getmnemo";
const CONFIG_FILE_NAME = "config.json";
const DEFAULT_API_URL = "https://api.mnemohq.com";

export function configDir(): string {
  return join(homedir(), CONFIG_DIR_NAME);
}

export function configPath(): string {
  return join(configDir(), CONFIG_FILE_NAME);
}

export async function readConfig(): Promise<CliConfig> {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as CliConfig;
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

export async function writeConfig(patch: Partial<CliConfig>): Promise<void> {
  const path = configPath();
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const current = await readConfig();
  const merged: CliConfig = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(path, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
}

export async function clearConfig(): Promise<void> {
  try {
    await fs.unlink(configPath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}

export function resolveApiKey(cfg: CliConfig): string | undefined {
  return process.env.GETMNEMO_API_KEY ?? cfg.apiKey;
}

export function resolveWorkspaceId(cfg: CliConfig): string | undefined {
  return process.env.GETMNEMO_WORKSPACE_ID ?? cfg.workspaceId;
}

export function resolveApiUrl(cfg: CliConfig): string {
  return process.env.GETMNEMO_API_URL ?? cfg.baseUrl ?? DEFAULT_API_URL;
}

/**
 * Resolve the container tag (tenant boundary) for a command.
 * Precedence: explicit --container flag > GETMNEMO_CONTAINER env > config
 * defaultContainerTag. Returns undefined when none is set — callers must NOT
 * substitute a fallback that could cross a tenant boundary.
 */
export function resolveContainerTag(
  cfg: CliConfig,
  flag?: string,
): string | undefined {
  return flag ?? process.env.GETMNEMO_CONTAINER ?? cfg.defaultContainerTag;
}
