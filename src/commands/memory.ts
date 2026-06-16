import { Command } from "commander";
import kleur from "kleur";
import prompts from "prompts";
import type { Memory, SearchHit } from "getmnemo";
import { getClient, parseMetadata } from "../lib/client.js";
import { resolveContainerTag } from "../lib/config.js";
import {
  printError,
  printInfo,
  printJson,
  printSuccess,
  rootJsonFlag,
  truncate,
} from "../lib/output.js";

// confirmed against prod 2026-06-16. Display id differs by endpoint: search
// hits carry `memoryId`; full Memory objects (add/get/update/list) carry `id`.
function memoryId(m: Memory | SearchHit): string {
  return "memoryId" in m ? m.memoryId : m.id;
}

export function registerMemoryCommands(program: Command): void {
  program
    .command("add <content>")
    .description("add a new memory")
    .option("-m, --metadata <pair...>", "metadata key=value pairs (repeatable)")
    .option(
      "-C, --container <tag>",
      "container tag / tenant boundary (e.g. user:jane); falls back to GETMNEMO_CONTAINER or config",
    )
    .action(
      async (
        content: string,
        opts: { metadata?: string[]; container?: string },
        cmd: Command,
      ) => {
        const json = rootJsonFlag(cmd);
        const ctx = await getClient();
        const metadata = parseMetadata(opts.metadata);
        const containerTag = resolveContainerTag(ctx.cfg, opts.container);
        if (!containerTag) {
          printError(
            "A container is required. Pass --container <tag>, set GETMNEMO_CONTAINER, or add defaultContainerTag to your config.",
          );
          process.exit(2);
        }
        const result = await ctx.client.add({ content, metadata, containerTag });
        if (json) {
          printJson(result);
          return;
        }
        // confirmed against prod 2026-06-16. add() returns AddResponse
        // { scopeKey, scope, items: Memory[] }.
        const first = result.items[0];
        printSuccess(
          `Added memory ${kleur.dim(first ? memoryId(first) : "(no id returned)")}`,
        );
      },
    );

  program
    .command("search <query>")
    .description("semantic search across memories")
    .option("-l, --limit <n>", "max results", "5")
    .option(
      "-C, --container <tag>",
      "container tag / tenant boundary (e.g. user:jane); falls back to GETMNEMO_CONTAINER or config",
    )
    .action(
      async (
        query: string,
        opts: { limit?: string; container?: string },
        cmd: Command,
      ) => {
        const json = rootJsonFlag(cmd);
        const ctx = await getClient();
        const limit = Number.parseInt(opts.limit ?? "5", 10);
        if (Number.isNaN(limit) || limit <= 0) {
          printError("--limit must be a positive integer");
          process.exit(2);
        }
        const containerTag = resolveContainerTag(ctx.cfg, opts.container);
        if (!containerTag) {
          printError(
            "A container is required. Pass --container <tag>, set GETMNEMO_CONTAINER, or add defaultContainerTag to your config.",
          );
          process.exit(2);
        }
        // Field is `q` (NOT `query`) per the v0.2.0 contract.
        const result = await ctx.client.search({ q: query, limit, containerTag });
        if (json) {
          printJson(result);
          return;
        }
        // confirmed against prod 2026-06-16. search() returns SearchResponse;
        // the primary hits live in `results` (NOT `hits`).
        const items = result.results;
        if (items.length === 0) {
          printInfo("No matching memories.");
          return;
        }
        for (const m of items) {
          const score =
            typeof m.score === "number"
              ? kleur.yellow(m.score.toFixed(3))
              : kleur.dim("—");
          const id = kleur.dim(memoryId(m));
          process.stdout.write(
            `${score}  ${id}\n  ${truncate(m.content, 200)}\n\n`,
          );
        }
      },
    );

  program
    .command("get <id>")
    .description("fetch a single memory by id")
    .action(async (id: string, _opts: unknown, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      let found: Memory;
      try {
        found = await ctx.client.get(id);
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 404) {
          if (json) printJson({ ok: false, error: "not_found" });
          else printError(`Memory ${id} not found.`);
          process.exit(1);
        }
        throw err;
      }
      if (json) {
        printJson(found);
        return;
      }
      // confirmed against prod 2026-06-16. get() returns a Memory.
      printInfo(`id:        ${memoryId(found)}`);
      printInfo(`content:   ${found.content}`);
      if (found.metadata) printInfo(`metadata:  ${JSON.stringify(found.metadata)}`);
      if (found.createdAt) printInfo(`createdAt: ${found.createdAt}`);
    });

  program
    .command("rm <id>")
    .description("delete a memory")
    .option("-y, --yes", "skip confirmation prompt", false)
    .action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          if (json) printJson({ ok: false, error: "confirmation_required" });
          else printError("Refusing to delete without --yes in a non-interactive shell.");
          process.exit(2);
        }
        const { confirm } = await prompts({
          type: "confirm",
          name: "confirm",
          message: `Delete memory ${id}?`,
          initial: false,
        });
        if (!confirm) {
          printInfo("Cancelled.");
          return;
        }
      }
      await ctx.client.delete(id);
      if (json) {
        printJson({ ok: true, id });
        return;
      }
      printSuccess(`Deleted ${id}`);
    });

  program
    .command("list")
    .description("list memories in the current workspace")
    .option("-l, --limit <n>", "page size", "20")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .option(
      "-C, --container <tag>",
      "filter by container tag / tenant boundary (e.g. user:jane); falls back to GETMNEMO_CONTAINER or config",
    )
    .action(
      async (
        opts: { limit?: string; cursor?: string; container?: string },
        cmd: Command,
      ) => {
        const json = rootJsonFlag(cmd);
        const ctx = await getClient();
        const limit = Number.parseInt(opts.limit ?? "20", 10);
        if (Number.isNaN(limit) || limit <= 0) {
          printError("--limit must be a positive integer");
          process.exit(2);
        }
        // Container is an optional filter on list — undefined lists the
        // workspace; a value scopes to that tenant boundary.
        const containerTag = resolveContainerTag(ctx.cfg, opts.container);
        const result = await ctx.client.list({
          limit,
          cursor: opts.cursor,
          containerTag,
        });
        if (json) {
          printJson(result);
          return;
        }
        // confirmed against prod 2026-06-16. list() returns PaginatedMemories
        // { items: Memory[], nextCursor }.
        const items = result.items;
        if (items.length === 0) {
          printInfo("No memories yet.");
          return;
        }
        for (const m of items) {
          const id = kleur.dim(memoryId(m).padEnd(24).slice(0, 24));
          process.stdout.write(`${id}  ${truncate(m.content, 100)}\n`);
        }
      },
    );
}
