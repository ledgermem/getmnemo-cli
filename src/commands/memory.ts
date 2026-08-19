import { Command } from "commander";
import kleur from "kleur";
import prompts from "prompts";
import type { Memory, SearchHit } from "getmnemo";
import { getClient, parseMetadata } from "../lib/client.js";
import { resolveContainerTag, type CliConfig } from "../lib/config.js";
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

const CONTAINER_OPTION_FLAGS = "-C, --container <tag>";
const CONTAINER_OPTION_DESC =
  "container tag / tenant boundary (e.g. user:jane); falls back to GETMNEMO_CONTAINER or config";

// Every memory command needs a container as of getmnemo 0.5.1: the API 400s
// by-id get/delete without a scope (requireMemoryScope guard), and the SDK
// itself throws on add/search/list. Resolve or exit(2) before any request.
function requireContainerTag(cfg: CliConfig, flag: string | undefined, json: boolean): string {
  const containerTag = resolveContainerTag(cfg, flag);
  if (!containerTag) {
    if (json) {
      printJson({ ok: false, error: "container_required" });
    } else {
      printError(
        "A container is required. Pass --container <tag>, set GETMNEMO_CONTAINER, or add defaultContainerTag to your config.",
      );
    }
    process.exit(2);
  }
  return containerTag;
}

export function registerMemoryCommands(program: Command): void {
  program
    .command("add <content>")
    .description("add a new memory")
    .option("-m, --metadata <pair...>", "metadata key=value pairs (repeatable)")
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .action(
      async (
        content: string,
        opts: { metadata?: string[]; container?: string },
        cmd: Command,
      ) => {
        const json = rootJsonFlag(cmd);
        const ctx = await getClient();
        const metadata = parseMetadata(opts.metadata);
        const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
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
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
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
        const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
        // Field is `q` (NOT `query`) per the API contract (re-verified
        // against getmnemo 0.5.1).
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
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .action(async (id: string, opts: { container?: string }, cmd: Command) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
      let found: Memory;
      try {
        found = await ctx.client.get(id, { containerTag });
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
    .description("delete a memory (recoverable by default; --permanent purges)")
    .option("-y, --yes", "skip confirmation prompt", false)
    .option("-P, --permanent", "purge immediately instead of a recoverable delete", false)
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
    .action(async (
      id: string,
      opts: { yes?: boolean; permanent?: boolean; container?: string },
      cmd: Command,
    ) => {
      const json = rootJsonFlag(cmd);
      const ctx = await getClient();
      // Resolve before prompting so a missing container fails immediately.
      const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
      if (!opts.yes) {
        if (!process.stdin.isTTY) {
          if (json) printJson({ ok: false, error: "confirmation_required" });
          else printError("Refusing to delete without --yes in a non-interactive shell.");
          process.exit(2);
        }
        const { confirm } = await prompts({
          type: "confirm",
          name: "confirm",
          message: `${opts.permanent ? "Permanently delete" : "Delete"} memory ${id}?`,
          initial: false,
        });
        if (!confirm) {
          printInfo("Cancelled.");
          return;
        }
      }
      const result = await ctx.client.delete(id, {
        containerTag,
        permanent: opts.permanent === true,
      });
      if (json) {
        printJson({ ok: true, id, receipt: result.receipt ?? null });
        return;
      }
      // Deletion is recoverable by default when the workspace has a recovery
      // window — say so instead of implying a completed purge.
      const restorableUntil =
        result.receipt?.status === "restorable" ? result.receipt.restorableUntil : undefined;
      printSuccess(
        restorableUntil
          ? `Deleted ${id} (restorable until ${restorableUntil})`
          : `Deleted ${id}`,
      );
    });

  program
    .command("list")
    .description("list memories in a container")
    .option("-l, --limit <n>", "page size", "20")
    .option("-c, --cursor <cursor>", "pagination cursor")
    .option(CONTAINER_OPTION_FLAGS, CONTAINER_OPTION_DESC)
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
        // As of getmnemo 0.5.1 list() requires a container (the SDK throws
        // without one) — gate it like the other commands so the failure is
        // the CLI's exit-2 message, not a raw SDK error.
        const containerTag = requireContainerTag(ctx.cfg, opts.container, json);
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
