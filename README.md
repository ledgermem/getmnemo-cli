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
getmnemo login                       # save API key + workspace to ~/.getmnemo/config.json
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
| `getmnemo login` | Prompt for API key, workspace ID, and (optionally) API URL; persist to `~/.getmnemo/config.json`. |
| `getmnemo logout` | Remove saved credentials. |
| `getmnemo whoami` | Print the active workspace + API URL. |

`login` flags: `--api-key`, `--workspace-id`, `--api-url` (skip the prompt).

### Memory operations

| Command | Description |
| --- | --- |
| `getmnemo add "<content>" --container <tag> [-m key=value ...]` | Add a memory to a container with optional metadata. |
| `getmnemo search "<query>" --container <tag> [--limit 5]` | Semantic search within a container. |
| `getmnemo get <id> --container <tag>` | Fetch a single memory. |
| `getmnemo rm <id> --container <tag> [--yes] [--permanent]` | Delete a memory (recoverable by default; `--permanent` purges immediately). |
| `getmnemo list --container <tag> [--limit 20] [--cursor <c>]` | Paginate the memories in a container. |

`--container` / `-C` accepts a container tag (e.g. `user:jane`) and is required on every memory command. Resolution order: `--container` flag → `GETMNEMO_CONTAINER` env → `defaultContainerTag` in config.

### Workspaces

| Command | Description |
| --- | --- |
| `getmnemo workspace list` | List workspaces from local config. |
| `getmnemo workspace switch <id>` | Switch the active workspace. |

### Other

| Command | Description |
| --- | --- |
| `getmnemo mcp [--client claude\|cursor]` | Print an MCP server config snippet. |
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
| `2` | Invalid arguments / unknown command |

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `GETMNEMO_API_KEY` | Overrides the saved API key. | — |
| `GETMNEMO_WORKSPACE_ID` | Overrides the active workspace. | — |
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
