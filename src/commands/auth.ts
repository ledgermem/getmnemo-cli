import { Command } from "commander";
import prompts from "prompts";
import { Mnemo } from "getmnemo";
import {
  clearConfig,
  readConfig,
  resolveApiUrl,
  writeConfig,
} from "../lib/config.js";
import {
  printError,
  printJson,
  printSuccess,
  printInfo,
  rootJsonFlag,
} from "../lib/output.js";

export function registerAuthCommands(program: Command): void {
  program
    .command("login")
    .description("authenticate with Mnemo and save credentials locally")
    .option("--api-key <key>", "API key (skips interactive prompt)")
    .option("--workspace-id <id>", "workspace id (skips interactive prompt)")
    .option("--api-url <url>", "override API base URL")
    .action(async (opts: { apiKey?: string; workspaceId?: string; baseUrl?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const defaultApiUrl = resolveApiUrl(cfg);

      const responses = await prompts(
        [
          {
            type: opts.apiKey ? null : "password",
            name: "apiKey",
            message: "Mnemo API key",
            validate: (val: string) => (val.trim().length > 0 ? true : "API key is required"),
          },
          {
            type: opts.workspaceId ? null : "text",
            name: "workspaceId",
            message: "Workspace ID",
            validate: (val: string) => (val.trim().length > 0 ? true : "Workspace ID is required"),
          },
          {
            type: opts.baseUrl ? null : "text",
            name: "baseUrl",
            message: "API URL",
            initial: defaultApiUrl,
          },
        ],
        {
          onCancel: () => {
            throw new Error("login cancelled");
          },
        },
      );

      const apiKey = opts.apiKey ?? (responses.apiKey as string);
      const workspaceId = opts.workspaceId ?? (responses.workspaceId as string);
      const baseUrl = opts.baseUrl ?? (responses.baseUrl as string) ?? defaultApiUrl;

      // Verify credentials before persisting — a typo should fail loudly,
      // not silently overwrite a previously-working config.
      try {
        const probe = new Mnemo({ apiKey, workspaceId, baseUrl });
        // getmnemo 0.5.1 list() throws client-side without a container, and
        // none is configured yet at login. Probe with a synthetic read-only
        // tag: we only care whether the key authenticates (401 vs 2xx), and
        // listing an empty container is a valid, cheap request.
        await probe.list({ limit: 1, containerTag: "cli:login-probe" });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        const message =
          err instanceof Error ? err.message : "credential verification failed";
        if (json) {
          printJson({ ok: false, error: "verification_failed", status, message });
        } else {
          printError(`Could not verify credentials${status ? ` (HTTP ${status})` : ""}: ${message}`);
          printInfo("Existing config left untouched.");
        }
        process.exit(1);
      }

      await writeConfig({ apiKey, workspaceId, baseUrl });

      if (json) {
        printJson({ ok: true, workspaceId, baseUrl });
        return;
      }
      printSuccess(`Logged in. Workspace: ${workspaceId}`);
    });

  program
    .command("logout")
    .description("remove saved credentials")
    .action(async (_opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      await clearConfig();
      if (json) {
        printJson({ ok: true });
        return;
      }
      printSuccess("Logged out.");
    });

  program
    .command("whoami")
    .description("show the current authenticated workspace")
    .action(async (_opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const apiKey = process.env.GETMNEMO_API_KEY ?? cfg.apiKey;
      const workspaceId = process.env.GETMNEMO_WORKSPACE_ID ?? cfg.workspaceId;
      const baseUrl = resolveApiUrl(cfg);

      const payload = {
        authenticated: Boolean(apiKey && workspaceId),
        workspaceId: workspaceId ?? null,
        baseUrl,
        apiKeyPreview: apiKey ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : null,
      };

      if (json) {
        printJson(payload);
        return;
      }
      if (!payload.authenticated) {
        printInfo("Not logged in. Run `getmnemo login`.");
        return;
      }
      printInfo(`Workspace: ${payload.workspaceId}`);
      printInfo(`API URL:   ${payload.baseUrl}`);
      printInfo(`API key:   ${payload.apiKeyPreview}`);
    });
}
