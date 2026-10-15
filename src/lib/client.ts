import { Mnemo } from "getmnemo";
import { PersonalApi } from "./personal-api.js";
import {
  readConfig,
  resolveApiKey,
  resolveApiUrl,
  resolveContainerTag,
  resolveWorkspaceId,
  type CliConfig,
} from "./config.js";

export interface ClientContext {
  client: Mnemo;
  /** Transport for people/reminders/brief/timeline/meetings/merge. */
  api: PersonalApi;
  apiKey: string;
  /**
   * Optional and deprecated: workspace identity comes from the API key. Kept
   * only so configs that still set it keep working; getmnemo 0.6 ignores it.
   */
  workspaceId?: string;
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
  // No workspace check: the API key carries workspace identity. A configured
  // workspaceId is still passed through (getmnemo 0.6 ignores it) so existing
  // configs keep working unchanged.

  // Backstop only: every current command resolves its container per call
  // (flag > env > config) and passes it explicitly, so this seed is not
  // consulted today. It exists so any future SDK call that omits a per-call
  // container falls back to the user's documented env/config default instead
  // of an SDK error. Per-call values always win over this.
  const client = new Mnemo({
    apiKey,
    ...(workspaceId ? { workspaceId } : {}),
    baseUrl,
    defaultContainerTag: resolveContainerTag(cfg),
  });
  const api = new PersonalApi({ apiKey, baseUrl });
  return { client, api, apiKey, workspaceId, baseUrl, cfg };
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
