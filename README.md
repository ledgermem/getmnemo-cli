# getmnemo-cli

The official command-line interface for [Mnemo](https://mnemohq.com) — a verifiable, append-only memory layer for AI agents.

`getmnemo` lets you create, search, and manage memories from your terminal, plus drop a turnkey MCP config snippet into Claude Desktop or Cursor.

## Install

```bash
npm install -g getmnemo-cli
```

Or run without installing:

```bash
npx getmnemo-cli --help
```

## Quickstart

```bash
getmnemo login                       # save API key to ~/.getmnemo/config.json
getmnemo add "Acme prefers blue branding" --container org:acme
getmnemo search "what brand color does Acme use?" --container org:acme
getmnemo doctor                      # verify auth + API reachability
```

> Every memory command (`add`, `search`, `get`, `rm`, `list`) requires a
> **container** (the tenant boundary, e.g. `user:jane` or `org:acme`). Pass
> `--container <tag>`, set `GETMNEMO_CONTAINER`, or add `defaultContainerTag`
> to `~/.getmnemo/config.json`.

## Commands

### Authentication

| Command | Description |
| --- | --- |
| `getmnemo login` | Prompt for API key and (optionally) API URL; verify; persist to `~/.getmnemo/config.json`. The API key identifies the workspace. |
| `getmnemo logout` | Remove saved credentials. |
| `getmnemo whoami` | Print the API key preview + API URL (and workspace, if one is still configured). |

`login` flags: `--api-key`, `--api-url` (skip the prompt). `--workspace-id` is deprecated and optional — workspace identity comes from the API key.

### Memory operations

| Command | Description |
| --- | --- |
| `getmnemo add "<content>" --container <tag> [-m key=value ...]` | Add a memory to a container with optional metadata. |
| `getmnemo search "<query>" --container <tag> [--limit 5]` | Semantic search within a container. |
| `getmnemo get <id> --container <tag>` | Fetch a single memory. |
| `getmnemo rm <id> --container <tag> [--yes] [--permanent]` | Delete a memory (recoverable by default; `--permanent` purges immediately). |
| `getmnemo list --container <tag> [--limit 20] [--cursor <c>]` | Paginate the memories in a container. |

`--container` / `-C` accepts a container tag (e.g. `user:jane`) and is required on every memory command. Resolution order: `--container` flag → `GETMNEMO_CONTAINER` env → `defaultContainerTag` in config.

### Daily brief, timeline, people, reminders, meetings

These commands need the matching scopes on your API key (`brief:read`, `timeline:read`, `people:read|write`, `reminders:read|write`, `meetings:read`, and `memories:write`+`memories:delete` for merge). A `503 FEATURE_DISABLED` means the deployment has not enabled that feature yet.

| Command | Description |
| --- | --- |
| `getmnemo brief [--container <tag>] [--date YYYY-MM-DD] [--timezone <tz>] [--days 7] [--sections core,followUps,meetings]` | Your Daily Brief: overdue / due today / coming up, important dates, today's meetings, follow-ups, last-24h captures. Container resolves like the memory commands; timezone defaults to your system zone. |
| `getmnemo timeline --container <tag> [--from <iso>] [--to <iso>] [--types memory,reminder,document,event] [--direction desc\|asc] [--limit 50] [--cursor <c>]` | Merged chronological stream of memories, reminders and documents for one container (`event` is opt-in). |
| `getmnemo people list [-q <text>] [--include-archived] [--limit 50] [--cursor <c>]` | List people (one memory container per person, `person:<slug>`). |
| `getmnemo people get <slug>` | Show a person with contact fields, important dates and reminder counts. |
| `getmnemo people add "<name>" [--slug] [--relationship] [--email] [--phone] [--company] [--notes] [--alias <a>...] [--important-date label=YYYY-MM-DD[:recurring]...]` | Add a person. A slug collision is a `409 PERSON_EXISTS`; retry with `--slug`. |
| `getmnemo reminders list [--status open\|completed\|all] [--days <n>] [--due-after <iso>] [--due-before <iso>] [-C <tag>] [--container-type person] [--limit 50] [--cursor <c>]` | Workspace-wide reminders ordered by due date. `-C` here is an explicit filter only (env/config defaults are not applied). |
| `getmnemo reminders upcoming [--days 7] [--timezone <tz>] [-C <tag>] [--container-type <t>] [--limit 50]` | Overdue / due today / coming up buckets in your timezone, plus important dates in the window. |
| `getmnemo reminders add "<content>" --due <iso> (--person <slug> \| --container <tag>) [--idempotency-key <k>] [-m key=value ...]` | Create a reminder for a person (lands in `person:<slug>`) or a container (flag → `GETMNEMO_CONTAINER` → config). |
| `getmnemo reminders complete <id>` | Mark a reminder done (clears `dueAt`, keeps the memory). |
| `getmnemo meetings upcoming [--days 7] [--limit 50] [--cursor <c>] [-C <tag>]` | Upcoming meetings from connected calendars, attendees matched to people. |
| `getmnemo meetings brief <documentId> [-q "<question>"]` | Pre-meeting brief: reader summary, each attendee's open reminders + recent memories, previous meetings. |
| `getmnemo memories merge <id> <id> [<id>...] [--into <id>] [--content "<text>"] [--type <memoryType>] [--merge-key <k>] [-m key=value ...] [-C <tag>] [-y]` | Merge 2–20 memories from one container. With `--into` that memory survives; otherwise `--content` is required and a new memory is created. Sources are soft-deleted (restorable). Prompts unless `-y`; refuses without `-y` in non-interactive shells. |

### Workspaces

| Command | Description |
| --- | --- |
| `getmnemo workspace list` | List workspaces from local config. |
| `getmnemo workspace switch <id>` | Switch the active workspace. |

### Other

| Command | Description |
| --- | --- |
| `getmnemo mcp [--client claude\|cursor]` | Print an MCP server config snippet (`npx -y getmnemo-mcp`). |
| `getmnemo doctor` | Check auth + `GET /health`. |

## Global flags

- `--json` — emit machine-readable JSON instead of pretty output. Honoured by every command.
- `--version` / `-v`
- `--help` / `-h`

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime error (auth missing, API failure, not found, ...) |
| `2` | Invalid arguments / unknown command / missing container / confirmation required |

With `--json`, runtime errors are written to stderr as `{"ok": false, "error": "<message>", "code": "<API code>", "status": <http>}` — `code` is the API's stable error code (`FEATURE_DISABLED`, `PERSON_NOT_FOUND`, `MERGE_CROSS_CONTAINER`, ...), and argument errors as `{"ok": false, "error": "invalid_argument" | "container_required" | "confirmation_required", "message": "..."}`.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `GETMNEMO_API_KEY` | Overrides the saved API key. | — |
| `GETMNEMO_WORKSPACE_ID` | Deprecated and optional — the API key identifies the workspace. | — |
| `GETMNEMO_API_URL` | Overrides the API base URL. | `https://api.mnemohq.com` |
| `GETMNEMO_CONTAINER` | Default container tag for the memory commands when no `--container` flag is given. | — |

Environment variables take precedence over `~/.getmnemo/config.json`.

## Examples

```bash
# add a tagged memory
getmnemo add "Customer asked about SOC 2 timeline" --container org:acme -m channel=email

# JSON output for piping into jq
getmnemo search "soc 2" --container org:acme --limit 3 --json | jq '.results[].memoryId'

# delete without prompting (CI-safe)
getmnemo rm mem_01HX... --container org:acme --yes

# generate Claude Desktop MCP config
getmnemo mcp --client claude > claude_desktop_config.json

# morning routine
getmnemo brief --container user:me --timezone Asia/Karachi
getmnemo reminders upcoming --days 3

# people + reminders
getmnemo people add "Jane Doe" --relationship client --email jane@example.com --important-date birthday=1990-05-04:recurring
getmnemo reminders add "Send Jane the proposal" --due 2026-09-05T09:00:00Z --person jane-doe
getmnemo reminders complete <reminder-id>

# what happened in a container, newest first
getmnemo timeline --container person:jane-doe --types memory,reminder --limit 20

# prep for the next meeting
getmnemo meetings upcoming --days 1 --json | jq -r '.items[0].documentId' | xargs getmnemo meetings brief

# fold duplicate memories into one
getmnemo memories merge <id-a> <id-b> --into <id-a> --container user:me -y
```

## Development

```bash
npm install
npm run dev -- --help    # run from source via tsx
npm run build            # compile to dist/
npm test                 # vitest
```

## License

[MIT](./LICENSE)
