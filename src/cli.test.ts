import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prompts from "prompts";
import { buildCli } from "./cli.js";

describe("Mnemo CLI", () => {
  let stdout: string;
  let stderr: string;
  let writeStdout: typeof process.stdout.write;
  let writeStderr: typeof process.stderr.write;

  beforeEach(() => {
    stdout = "";
    stderr = "";
    writeStdout = process.stdout.write.bind(process.stdout);
    writeStderr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString();
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stdout.write = writeStdout;
    process.stderr.write = writeStderr;
    vi.restoreAllMocks();
  });

  it("renders --help with all top-level commands", async () => {
    const program = buildCli();
    program.exitOverride();
    try {
      await program.parseAsync(["node", "getmnemo", "--help"]);
    } catch {
      // commander throws on help by design
    }
    expect(stdout).toMatch(/Usage: getmnemo/);
    expect(stdout).toMatch(/login/);
    expect(stdout).toMatch(/logout/);
    expect(stdout).toMatch(/whoami/);
    expect(stdout).toMatch(/add/);
    expect(stdout).toMatch(/search/);
    expect(stdout).toMatch(/get/);
    expect(stdout).toMatch(/rm/);
    expect(stdout).toMatch(/list/);
    expect(stdout).toMatch(/workspace/);
    expect(stdout).toMatch(/mcp/);
    expect(stdout).toMatch(/doctor/);
  });

  it("doctor reports failure when API is unreachable (mocked)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("__exit__");
    }) as never);

    const program = buildCli();
    program.exitOverride();
    try {
      await program.parseAsync(["node", "getmnemo", "--json", "doctor"]);
    } catch (err) {
      expect((err as Error).message).toBe("__exit__");
    }

    expect(fetchMock).toHaveBeenCalled();
    expect(stdout).toMatch(/"ok":\s*false/);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("returns exit code 2 for unknown command", async () => {
    const program = buildCli();
    let caught: unknown;
    program.exitOverride((err) => {
      caught = err;
      throw err;
    });
    try {
      await program.parseAsync(["node", "getmnemo", "totally-not-a-command"]);
    } catch {
      // expected
    }
    expect(caught).toBeDefined();
    expect((caught as { code?: string }).code).toBe("commander.unknownCommand");
  });

  describe("container scope on by-id memory commands", () => {
    function jsonResponse(body: unknown): Response {
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    function firstCall(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit] {
      const call = fetchMock.mock.calls[0];
      if (!call) throw new Error("fetch was never called");
      return [String(call[0]), call[1] as RequestInit];
    }

    beforeEach(() => {
      // Point HOME at a nonexistent dir so a real ~/.getmnemo/config.json
      // (e.g. a developer's defaultContainerTag) can't leak into assertions.
      vi.stubEnv("HOME", join(tmpdir(), "getmnemo-cli-test-home-nonexistent"));
      vi.stubEnv("GETMNEMO_API_KEY", "mk_test_key");
      vi.stubEnv("GETMNEMO_WORKSPACE_ID", "ws_test");
      vi.stubEnv("GETMNEMO_API_URL", "https://api.test.invalid");
      vi.stubEnv("GETMNEMO_CONTAINER", undefined);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    });

    it("get sends the --container tag as a containerTag query param", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: "mem_1", content: "hello" }));
      vi.stubGlobal("fetch", fetchMock);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync([
        "node", "getmnemo", "--json", "get", "mem_1", "--container", "user:jane",
      ]);

      const [url] = firstCall(fetchMock);
      expect(url).toBe(
        "https://api.test.invalid/v1/memories/mem_1?containerTag=user%3Ajane",
      );
      expect(stdout).toMatch(/mem_1/);
    });

    it("get --container flag wins over GETMNEMO_CONTAINER", async () => {
      vi.stubEnv("GETMNEMO_CONTAINER", "env:fallback");
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: "mem_1", content: "hello" }));
      vi.stubGlobal("fetch", fetchMock);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync([
        "node", "getmnemo", "--json", "get", "mem_1", "--container", "user:jane",
      ]);

      const [url] = firstCall(fetchMock);
      expect(url).toContain("containerTag=user%3Ajane");
      expect(url).not.toContain("env%3Afallback");
    });

    it("get falls back to GETMNEMO_CONTAINER when no flag is given", async () => {
      vi.stubEnv("GETMNEMO_CONTAINER", "user:env");
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: "mem_1", content: "hello" }));
      vi.stubGlobal("fetch", fetchMock);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync(["node", "getmnemo", "--json", "get", "mem_1"]);

      const [url] = firstCall(fetchMock);
      expect(url).toContain("containerTag=user%3Aenv");
    });

    it("get exits 2 with the container-required error when nothing resolves", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("__exit__");
      }) as never);

      const program = buildCli();
      program.exitOverride();
      await expect(
        program.parseAsync(["node", "getmnemo", "get", "mem_1"]),
      ).rejects.toThrow("__exit__");

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(stderr).toMatch(/A container is required/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("get --json emits a machine-readable container_required error", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("__exit__");
      }) as never);

      const program = buildCli();
      program.exitOverride();
      await expect(
        program.parseAsync(["node", "getmnemo", "--json", "get", "mem_1"]),
      ).rejects.toThrow("__exit__");

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(stdout).toMatch(/"error": "container_required"/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rm --yes sends the container tag on the DELETE and reports the recovery window", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({
          id: "mem_9",
          deleted: true,
          receipt: {
            id: "mem_9",
            eventId: "evt_1",
            status: "restorable",
            completedAt: "2026-08-19T00:00:00Z",
            purged: {},
            recoveryId: "rec_1",
            restorableUntil: "2026-09-01T00:00:00Z",
          },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync([
        "node", "getmnemo", "rm", "mem_9", "--yes", "--container", "user:jane",
      ]);

      const [url, init] = firstCall(fetchMock);
      expect(init.method).toBe("DELETE");
      expect(url).toBe(
        "https://api.test.invalid/v1/memories/mem_9?containerTag=user%3Ajane",
      );
      expect(stdout).toMatch(/Deleted mem_9 \(restorable until 2026-09-01T00:00:00Z\)/);
    });

    it("rm --permanent sends permanent=true alongside the container tag", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: "mem_9", deleted: true }));
      vi.stubGlobal("fetch", fetchMock);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync([
        "node", "getmnemo", "rm", "mem_9", "--yes", "--permanent", "--container", "user:jane",
      ]);

      const [url] = firstCall(fetchMock);
      expect(url).toBe(
        "https://api.test.invalid/v1/memories/mem_9?permanent=true&containerTag=user%3Ajane",
      );
      expect(stdout).toMatch(/Deleted mem_9/);
    });

    it("rm exits 2 without a container before sending any request", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("__exit__");
      }) as never);

      const program = buildCli();
      program.exitOverride();
      await expect(
        program.parseAsync(["node", "getmnemo", "rm", "mem_9", "--yes"]),
      ).rejects.toThrow("__exit__");

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(stderr).toMatch(/A container is required/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("list sends the resolved container tag as a query param", async () => {
      vi.stubEnv("GETMNEMO_CONTAINER", "user:env");
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));
      vi.stubGlobal("fetch", fetchMock);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync(["node", "getmnemo", "--json", "list"]);

      const [url] = firstCall(fetchMock);
      expect(url).toBe(
        "https://api.test.invalid/v1/memories?limit=20&containerTag=user%3Aenv",
      );
    });

    it("list exits 2 with the CLI's container-required message when nothing resolves", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
        throw new Error("__exit__");
      }) as never);

      const program = buildCli();
      program.exitOverride();
      await expect(
        program.parseAsync(["node", "getmnemo", "list"]),
      ).rejects.toThrow("__exit__");

      expect(exitSpy).toHaveBeenCalledWith(2);
      expect(stderr).toMatch(/A container is required/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("login verifies credentials with a synthetic probe container", async () => {
      // Own HOME so the config write cannot leak into the shared stub path.
      vi.stubEnv(
        "HOME",
        join(tmpdir(), `getmnemo-cli-test-home-login-${process.pid}`),
      );
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));
      vi.stubGlobal("fetch", fetchMock);
      // login prompts for the API URL (the key/workspace prompts are skipped
      // by the flags); inject the answer so the test never blocks on stdin.
      prompts.inject(["https://api.test.invalid"]);

      const program = buildCli();
      program.exitOverride();
      await program.parseAsync([
        "node", "getmnemo", "--json", "login",
        "--api-key", "mk_login_test", "--workspace-id", "ws_login",
      ]);

      const [url] = firstCall(fetchMock);
      expect(url).toBe(
        "https://api.test.invalid/v1/memories?limit=1&containerTag=cli%3Alogin-probe",
      );
      expect(stdout).toMatch(/"ok": true/);
    });
  });
});
