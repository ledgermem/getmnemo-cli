import { Mnemo } from "getmnemo";
import {
  readConfig,
  resolveApiKey,
  resolveApiUrl,
  resolveWorkspaceId,
  type CliConfig,
} from "./config.js";

export interface ClientContext {
  client: Mnemo;
  apiKey: string;
  workspaceId: string;
  baseUrl: string;
  cfg: CliConfig;
}

export class ClientAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientAuthError";
  }
}

export async function getClient(): Promise<ClientContext> {
  const cfg = await readConfig();
  const apiKey = resolveApiKey(cfg);
  const workspaceId = resolveWorkspaceId(cfg);
  const baseUrl = resolveApiUrl(cfg);

  if (!apiKey) {
    throw new ClientAuthError(
      "Not authenticated. Run `getmnemo login` or set GETMNEMO_API_KEY.",
    );
  }
  if (!workspaceId) {
    throw new ClientAuthError(
      "No workspace selected. Run `getmnemo login` or set GETMNEMO_WORKSPACE_ID.",
    );
  }

  const client = new Mnemo({ apiKey, workspaceId, baseUrl });
  return { client, apiKey, workspaceId, baseUrl, cfg };
}

export function parseMetadata(pairs: string[] | undefined): Record<string, string> {
  if (!pairs || pairs.length === 0) return {};
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) {
      throw new Error(`Invalid --metadata value "${pair}". Expected key=value.`);
    }
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) {
      throw new Error(`Invalid --metadata key in "${pair}".`);
    }
    out[key] = value;
  }
  return out;
}
