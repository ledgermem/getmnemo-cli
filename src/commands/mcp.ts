import { Command } from "commander";
import { readConfig, resolveApiKey, resolveApiUrl, resolveWorkspaceId } from "../lib/config.js";
import { printJson, rootJsonFlag } from "../lib/output.js";

export function registerMcpCommand(program: Command): void {
  program
    .command("mcp")
    .description("print an MCP server config snippet for Claude Desktop / Cursor")
    .option("--client <name>", "target MCP client (claude|cursor)", "claude")
    .action(async (opts: { client?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const cfg = await readConfig();
      const apiKey = resolveApiKey(cfg) ?? "<your-getmnemo-api-key>";
      // Deprecated (the API key identifies the workspace); only emitted when
      // the user still has one configured.
      const workspaceId = resolveWorkspaceId(cfg);
      const baseUrl = resolveApiUrl(cfg);

      const snippet = {
        mcpServers: {
          getmnemo: {
            command: "npx",
            // Published package is `getmnemo-mcp` (bin `getmnemo-mcp`); the old
            // `@mnemo/mcp` name was never published.
            args: ["-y", "getmnemo-mcp"],
            env: {
              GETMNEMO_API_KEY: apiKey,
              ...(workspaceId ? { GETMNEMO_WORKSPACE_ID: workspaceId } : {}),
              GETMNEMO_API_URL: baseUrl,
            },
          },
        },
      };

      if (json) {
        printJson({ client: opts.client ?? "claude", snippet });
        return;
      }

      const target = opts.client === "cursor"
        ? "~/.cursor/mcp.json"
        : "~/Library/Application Support/Claude/claude_desktop_config.json (macOS)";

      process.stdout.write(`# Add to: ${target}\n`);
      process.stdout.write(JSON.stringify(snippet, null, 2) + "\n");
    });
}
