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
getmnemo add "Acme prefers blue branding"
getmnemo search "what brand color does Acme use?"
getmnemo doctor                      # verify auth + API reachability
```

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
| `getmnemo add "<content>" [-m key=value ...]` | Add a memory with optional metadata. |
| `getmnemo search "<query>" [--limit 5]` | Semantic search. |
| `getmnemo get <id>` | Fetch a single memory. |
| `getmnemo rm <id> [--yes]` | Delete a memory. |
| `getmnemo list [--limit 20] [--cursor <c>]` | Paginate the workspace. |

### Workspaces

| Command | Description |
| --- | --- |
| `getmnemo workspace list` | List workspaces from local config. |
| `getmnemo workspace switch <id>` | Switch the active workspace. |

### Other

| Command | Description |
| --- | --- |
| `getmnemo mcp [--client claude\|cursor]` | Print an MCP server config snippet. |
| `getmnemo doctor` | Check auth + `GET /healthz`. |

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

Environment variables take precedence over `~/.getmnemo/config.json`.

## Examples

```bash
# add a tagged memory
getmnemo add "Customer asked about SOC 2 timeline" -m customer=acme -m channel=email

# JSON output for piping into jq
getmnemo search "soc 2" --limit 3 --json | jq '.results[].id'

# delete without prompting (CI-safe)
getmnemo rm mem_01HX... --yes

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
