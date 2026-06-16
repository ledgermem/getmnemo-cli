#!/usr/bin/env node
/**
 * CI prod smoke gate for the `getmnemo-cli` (the `getmnemo` binary).
 *
 * Runs a real round-trip against PRODUCTION by driving the BUILT CLI in
 * `./dist/cli.js` as a subprocess — the same binary that gets published — then
 * asserts the cross-container tenant-isolation boundary. The publish workflow
 * gates `publish` on `needs: smoke`, so a red run here blocks the release.
 *
 * We drive the real CLI (not the core SDK directly) on purpose: this is the
 * thing users install, so the test exercises arg parsing, the `--json`
 * contract, container-flag plumbing, and the bundled `getmnemo` core together.
 *
 * Exit codes:
 *   0  happy-path round-trip + BOTH isolation assertions passed.
 *   1  missing env, round-trip failure, or — loudest of all — a tenant
 *      isolation leak (a live-server security finding, NOT a flaky test).
 *
 * Per SDK_RECONCILIATION_0.2.0.md: a leak is a production tenant-isolation
 * security finding (cross-container leakage), not an SDK/CLI bug. It outranks
 * the launch — fix the server, do not iterate the CLI around it.
 *
 * Required env:
 *   MNEMO_API_KEY        scoped test key (needs delete scope for cleanup)
 *   MNEMO_WORKSPACE_ID   throwaway test workspace id
 *   MNEMO_TEST_CONTAINER base containerTag, e.g. "ci-smoke"
 *
 * Optional env:
 *   MNEMO_API_URL        override the prod base url (default: CLI default)
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
// The published binary entrypoint — the exact file `bin.getmnemo` points at.
const CLI = resolve(__dirname, '..', 'dist', 'cli.js')

const PROPAGATION_WAIT_MS = 3_000
const CLI_TIMEOUT_MS = 30_000

function fail(msg) {
  console.error(`\n[smoke] FAIL: ${msg}`)
  process.exit(1)
}

/** LOUD failure for a server-side tenant-isolation leak. */
function isolationFailure(detail) {
  const banner = '='.repeat(72)
  console.error(`\n${banner}`)
  console.error('TENANT ISOLATION FAILURE')
  console.error(banner)
  console.error(
    'A search scoped to one container returned a memory written to a DIFFERENT\n' +
      'container. This is a PRODUCTION tenant-isolation security finding\n' +
      '(cross-container leakage), NOT a flaky test and NOT a CLI bug.\n\n' +
      'Per SDK_RECONCILIATION_0.2.0.md this outranks the launch: STOP, fix the\n' +
      'server, and do NOT iterate the CLI around it. Publish is correctly blocked.',
  )
  console.error(`\nDetail: ${detail}`)
  console.error(`${banner}\n`)
  process.exit(1)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Run the built CLI with `--json` and return parsed stdout JSON.
 * The CLI maps its own GETMNEMO_* env to credentials, so we translate the
 * smoke's MNEMO_* inputs into that namespace here. Throws on non-zero exit,
 * timeout, or unparseable stdout — every failure is loud.
 */
function runCli(args, env) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [CLI, ...args, '--json'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGKILL')
      rejectRun(new Error(`CLI timed out after ${CLI_TIMEOUT_MS}ms: getmnemo ${args.join(' ')}`))
    }, CLI_TIMEOUT_MS)

    child.stdout.on('data', (d) => {
      stdout += d
    })
    child.stderr.on('data', (d) => {
      stderr += d
    })
    child.on('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectRun(err)
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        rejectRun(
          new Error(
            `getmnemo ${args.join(' ')} exited ${code}.\nstderr: ${stderr.trim()}\nstdout: ${stdout.trim()}`,
          ),
        )
        return
      }
      try {
        resolveRun(JSON.parse(stdout))
      } catch (err) {
        rejectRun(
          new Error(
            `getmnemo ${args.join(' ')} did not emit valid JSON.\n` +
              `parse error: ${err instanceof Error ? err.message : String(err)}\n` +
              `stdout: ${stdout.trim()}`,
          ),
        )
      }
    })
  })
}

/** True if any search hit's content contains `needle`. */
function resultsContain(response, needle) {
  // CLI `search --json` emits the raw SearchResponse; hits live in `results`.
  const results = response?.results
  if (!Array.isArray(results)) return false
  return results.some((hit) => typeof hit?.content === 'string' && hit.content.includes(needle))
}

/** Collect created memory ids from a CLI `add --json` (raw AddResponse). */
function addedIds(response) {
  const items = response?.items
  if (!Array.isArray(items)) return []
  return items.map((it) => it?.id).filter((id) => typeof id === 'string')
}

async function main() {
  const apiKey = process.env.MNEMO_API_KEY
  const workspaceId = process.env.MNEMO_WORKSPACE_ID
  const base = process.env.MNEMO_TEST_CONTAINER

  if (!apiKey) fail('MNEMO_API_KEY is not set')
  if (!workspaceId) fail('MNEMO_WORKSPACE_ID is not set')
  if (!base) fail('MNEMO_TEST_CONTAINER is not set')

  // Translate the smoke's MNEMO_* inputs into the CLI's GETMNEMO_* namespace.
  // Pass container EXPLICITLY per-command (--container) instead of via env so
  // the two containers can never collide on a shared default.
  const cliEnv = {
    ...process.env,
    GETMNEMO_API_KEY: apiKey,
    GETMNEMO_WORKSPACE_ID: workspaceId,
  }
  if (process.env.MNEMO_API_URL) cliEnv.GETMNEMO_API_URL = process.env.MNEMO_API_URL
  // Don't let an ambient default container bleed into explicit-flag calls.
  delete cliEnv.GETMNEMO_CONTAINER

  // Unique per-run nonce so concurrent / re-run smokes never collide and so a
  // leaked memory from a prior run can't masquerade as this run's data.
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  // containerTag must be "<type>:<id>"; default type "user" when base has no colon.
  const colon = base.indexOf(':')
  const ctype = colon >= 0 ? base.slice(0, colon) : 'user'
  const cidBase = colon >= 0 ? base.slice(colon + 1) : base
  const containerA = `${ctype}:${cidBase}-a-${nonce}`
  const containerB = `${ctype}:${cidBase}-b-${nonce}`
  const alphaContent = `${nonce} codeword ALPHA`
  const bravoContent = `${nonce} codeword BRAVO`

  console.log('[smoke] driving built CLI:', CLI)
  console.log('[smoke] run nonce:', nonce)
  console.log('[smoke] container A:', containerA)
  console.log('[smoke] container B:', containerB)

  // Track created ids so cleanup runs even if assertions throw.
  const createdIds = []

  try {
    // ---- HAPPY PATH: add to two distinct containers --------------------
    const addA = await runCli(['add', alphaContent, '--container', containerA], cliEnv)
    const addB = await runCli(['add', bravoContent, '--container', containerB], cliEnv)

    createdIds.push(...addedIds(addA), ...addedIds(addB))

    if (createdIds.length < 2) {
      fail(
        `add did not return ids for both writes — got ${createdIds.length} ` +
          `(addA.items=${addA?.items?.length ?? 0}, addB.items=${addB?.items?.length ?? 0})`,
      )
    }

    // Give the indexer a moment to make the writes searchable.
    await sleep(PROPAGATION_WAIT_MS)

    // Round-trip: ALPHA must be retrievable in its OWN container.
    const ownA = await runCli(['search', 'codeword ALPHA', '--container', containerA], cliEnv)
    if (!resultsContain(ownA, alphaContent)) {
      fail(
        'happy-path round-trip failed: searching container A for "codeword ALPHA" ' +
          'did not return the ALPHA memory in response.results. ' +
          `results=${JSON.stringify(ownA?.results ?? null)}`,
      )
    }
    console.log('[smoke] OK happy-path: add + search round-trip via response.results')

    // ---- ISOLATION ASSERTION (the security gate) -----------------------
    // ALPHA was written to A; a search scoped to B must NOT see it.
    const crossA = await runCli(['search', 'codeword ALPHA', '--container', containerB], cliEnv)
    if (resultsContain(crossA, alphaContent)) {
      isolationFailure(
        `ALPHA (written to container "${containerA}") leaked into a search ` +
          `scoped to container "${containerB}".`,
      )
    }

    // BRAVO was written to B; a search scoped to A must NOT see it.
    const crossB = await runCli(['search', 'codeword BRAVO', '--container', containerA], cliEnv)
    if (resultsContain(crossB, bravoContent)) {
      isolationFailure(
        `BRAVO (written to container "${containerB}") leaked into a search ` +
          `scoped to container "${containerA}".`,
      )
    }

    console.log('[smoke] OK isolation: A↛B and B↛A — no cross-container leakage')
  } finally {
    // ---- CLEANUP: best-effort delete; failure warns, never fatal -------
    for (const id of createdIds) {
      try {
        await runCli(['rm', id, '--yes'], cliEnv)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[smoke] WARN: cleanup delete failed for memory ${id}: ${msg}`)
      }
    }
  }

  console.log('\n[smoke] PASS: happy-path + both isolation assertions green.')
  process.exit(0)
}

main().catch((err) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err)
  fail(`unexpected error during smoke run:\n${msg}`)
})
