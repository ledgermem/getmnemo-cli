import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClientAuthError, getClient } from "./client.js";

describe("getClient", () => {
  beforeEach(() => {
    // Nonexistent HOME so a real ~/.getmnemo/config.json can't leak in.
    vi.stubEnv("HOME", join(tmpdir(), "getmnemo-cli-client-test-nonexistent"));
    vi.stubEnv("GETMNEMO_WORKSPACE_ID", undefined);
    vi.stubEnv("GETMNEMO_API_URL", "https://api.test.invalid");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a client from an API key alone (workspace comes from the key)", async () => {
    vi.stubEnv("GETMNEMO_API_KEY", "mk_test_key");
    const ctx = await getClient();
    expect(ctx.apiKey).toBe("mk_test_key");
    expect(ctx.workspaceId).toBeUndefined();
    expect(ctx.client).toBeDefined();
  });

  it("still accepts a configured (deprecated) workspace id", async () => {
    vi.stubEnv("GETMNEMO_API_KEY", "mk_test_key");
    vi.stubEnv("GETMNEMO_WORKSPACE_ID", "ws_legacy");
    const ctx = await getClient();
    expect(ctx.workspaceId).toBe("ws_legacy");
  });

  it("still requires an API key", async () => {
    vi.stubEnv("GETMNEMO_API_KEY", undefined);
    await expect(getClient()).rejects.toBeInstanceOf(ClientAuthError);
  });
});
