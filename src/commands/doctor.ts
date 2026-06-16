import { Command } from "commander";
import kleur from "kleur";
import { readConfig, resolveApiKey, resolveApiUrl, resolveWorkspaceId } from "../lib/config.js";
import { printError, printJson, printSuccess, rootJsonFlag } from "../lib/output.js";

interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("verify auth + API connectivity")
    .action(async (_opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const apiKey = resolveApiKey(cfg);
      const workspaceId = resolveWorkspaceId(cfg);
      const baseUrl = resolveApiUrl(cfg);
      const checks: CheckResult[] = [];

      checks.push({ name: "config file present", ok: Boolean(cfg.updatedAt), detail: cfg.updatedAt });
      checks.push({ name: "API key configured", ok: Boolean(apiKey) });
      checks.push({ name: "workspace configured", ok: Boolean(workspaceId), detail: workspaceId });

      let healthOk = false;
      let healthDetail = "";
      let healthUrl: URL | null = null;
      try {
        healthUrl = new URL("/health", baseUrl);
      } catch {
        healthDetail = `Invalid API URL: "${baseUrl}". Did you forget the scheme (e.g. https://)?`;
      }
      if (healthUrl) {
        try {
          const res = await fetch(healthUrl, {
            method: "GET",
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
          });
          healthOk = res.ok;
          healthDetail = `HTTP ${res.status}`;
        } catch (err) {
          healthDetail = err instanceof Error ? err.message : String(err);
        }
      }
      checks.push({ name: `API reachable (${baseUrl}/health)`, ok: healthOk, detail: healthDetail });

      const allOk = checks.every((c) => c.ok);

      if (json) {
        printJson({ ok: allOk, baseUrl, workspaceId: workspaceId ?? null, checks });
        process.exit(allOk ? 0 : 1);
      }

      for (const c of checks) {
        const mark = c.ok ? kleur.green("✓") : kleur.red("✗");
        const detail = c.detail ? kleur.dim(` (${c.detail})`) : "";
        process.stdout.write(`${mark} ${c.name}${detail}\n`);
      }

      if (allOk) {
        printSuccess("All checks passed.");
        process.exit(0);
      } else {
        printError("Some checks failed.");
        process.exit(1);
      }
    });
}
