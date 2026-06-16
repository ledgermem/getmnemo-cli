#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";
import { pathToFileURL } from "node:url";
import { registerAuthCommands } from "./commands/auth.js";
import { registerMemoryCommands } from "./commands/memory.js";
import { registerWorkspaceCommands } from "./commands/workspace.js";
import { registerMcpCommand } from "./commands/mcp.js";
import { registerDoctorCommand } from "./commands/doctor.js";

const VERSION = "0.2.0";

// Color detection: kleur's autodetect can produce ANSI escapes when this CLI
// is spawned as a subprocess (e.g. by `claude`, CI runners, or scripts that
// pipe stdout) because it only checks isTTY on first import. Honor the
// no-color.org NO_COLOR convention and disable color whenever stdout is
// not a TTY, unless FORCE_COLOR is explicitly set.
//
// Precedence (matches supports-color spec):
//   1. FORCE_COLOR=0|false  → explicitly disabled, wins over NO_COLOR.
//   2. FORCE_COLOR=<other>  → explicitly enabled, wins over NO_COLOR.
//   3. NO_COLOR set (any value, including empty) → disabled.
//   4. Fallback: stdout.isTTY.
//
// Previous version checked `force && force !== "0"`, which let
// `FORCE_COLOR=0` fall through to the NO_COLOR/TTY branches and ended up
// *enabling* color in a TTY when the operator had explicitly disabled it.
function configureColor(): void {
  const force = process.env.FORCE_COLOR;
  if (force !== undefined) {
    kleur.enabled = force !== "0" && force !== "false" && force !== "";
    return;
  }
  if (process.env.NO_COLOR !== undefined) {
    kleur.enabled = false;
    return;
  }
  kleur.enabled = Boolean(process.stdout.isTTY);
}
configureColor();

export function buildCli(): Command {
  const program = new Command();

  program
    .name("getmnemo")
    .description(kleur.cyan("Mnemo CLI") + " — manage memories from your terminal.")
    .version(VERSION, "-v, --version", "print the CLI version")
    .option("--json", "format output as JSON for machine consumption", false)
    .showHelpAfterError("(add --help for additional information)");

  registerAuthCommands(program);
  registerMemoryCommands(program);
  registerWorkspaceCommands(program);
  registerMcpCommand(program);
  registerDoctorCommand(program);

  program.exitOverride((err) => {
    if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
      process.exit(0);
    }
    if (err.code === "commander.unknownCommand" || err.code === "commander.unknownOption") {
      process.exit(2);
    }
    process.exit(err.exitCode ?? 1);
  });

  return program;
}

async function main(): Promise<void> {
  const program = buildCli();
  // Detect --json early so the top-level error handler can match the format
  // the user requested. Without this, `getmnemo search foo --json` that
  // throws (e.g. network failure) writes ANSI-coloured human text to stderr
  // and exits 1, while `getmnemo get $missing --json` writes JSON and exits
  // 1 — same exit code, two different output shapes. Scripts piping to `jq`
  // can't tell which they got.
  const wantsJson = process.argv.includes("--json");
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (wantsJson) {
      process.stderr.write(JSON.stringify({ ok: false, error: message }) + "\n");
    } else {
      process.stderr.write(kleur.red(`error: ${message}\n`));
    }
    process.exit(1);
  }
}

function isMainModule(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return import.meta.url === pathToFileURL(argv1).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  void main();
}
