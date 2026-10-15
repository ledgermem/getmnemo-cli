# Changelog

All notable changes to `getmnemo-cli` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [0.4.0] — 2026-10-15

### Changed
- `getmnemo` core dependency `^0.5.1` → `^0.6.0`.
- A workspace ID is no longer required: with an API key, workspace identity comes from the key. Commands no longer fail with "No workspace selected".
- `login` no longer prompts for a workspace ID; `--workspace-id` is deprecated and only saved if given.
- `whoami` reports authenticated with just an API key; `doctor` drops the "workspace configured" check; `mcp` only emits `GETMNEMO_WORKSPACE_ID` when one is still configured.

### Notes
- Minor bump (not patch): `login`, `whoami`, `doctor` and `mcp` output change, and the core dependency moves a minor version.
- `GETMNEMO_WORKSPACE_ID` / a saved `workspaceId` are still accepted but ignored by getmnemo 0.6.

## [0.3.0] — 2026-09-02

### Added
- `getmnemo brief [--container <tag>] [--date] [--timezone] [--days] [--sections]` — your Daily Brief (overdue / due today / coming up, important dates, today's meetings, follow-ups, last-24h captures). `GET /v1/brief`, scope `brief:read`.
- `getmnemo timeline --container <tag> [--from --to --types --direction --limit --cursor]` — merged chronological stream for one container. `GET /v1/timeline`, scope `timeline:read`.
- `getmnemo people list|get <slug>|add <name>` — one memory container per person, with `--relationship --email --phone --company --notes --alias --important-date`. `/v1/people`, scopes `people:read` / `people:write`.
- `getmnemo reminders list|upcoming|add <content> --due <iso>|complete <id>` — reminders are memories with a due date; `add` targets `--person <slug>` or a container. `/v1/reminders`, scopes `reminders:read` / `reminders:write`.
- `getmnemo meetings upcoming|brief <documentId>` — calendar meetings with attendee ↔ person matching and a pre-meeting brief. `/v1/meetings`, scope `meetings:read` (+ `answer:read` for briefs).
- `getmnemo memories merge <id...> [--into <id>] [--content] [--type] [--merge-key] [-y]` — fold 2–20 memories into one; sources are soft-deleted and restorable. `POST /v1/memories/merge`, scopes `memories:write` + `memories:delete`.
- `--json` error envelope now carries the API's stable `code` (e.g. `FEATURE_DISABLED`, `PERSON_NOT_FOUND`) and `status`.

### Changed
- `--version` is read from `package.json` at runtime (the hardcoded const had drifted to 0.2.0 while the package was 0.2.1).
- All new commands validate arguments locally (bounded integers, ISO-8601 dates, enums, csv subsets) and exit `2` before any request is sent.

### Fixed
- `getmnemo mcp` now emits `npx -y getmnemo-mcp` (the published package) instead of the never-published `@mnemo/mcp`.

### Notes
- The new commands need the matching scopes on your API key — existing keys gain nothing by default; mint or edit a key in the dashboard.
- These features are dark-launched server-side; a `503 FEATURE_DISABLED` means the deployment has not enabled that feature yet.
- The new surfaces use a CLI-owned transport (`src/lib/personal-api.ts`) with wire shapes identical to `getmnemo@0.6.0`'s resources; the dependency stays `^0.5.1` until 0.6.0 is published.

## [0.2.1] — 2026-08-19

### Fixed
- Require a container scope on by-id memory routes (`get`, `rm`); bump `getmnemo` to `^0.5.1`.

## [0.2.0]

### Changed
- API-contract reconciliation (`q` search field, `results` hits, `items` receipts) + CI prod smoke gate before publish.
