# Foxtly Approval Gate Prototype

This repo implements a Node.js + TypeScript prototype of the Executor approval gate in a real Anthropic `tool_use` / `tool_result` loop.

## What is built

- `SPEC.md` with design decisions:
  - approval gate placement in loop
  - approval state machine
  - concurrent action handling
  - production open questions
- Backend (Express + TypeScript):
  - real Anthropic executor loop (`/api/agent/run`)
  - mocked Meta Ads and Google Ads APIs with realistic fake responses
  - approval persistence in SQLite
  - approve/reject endpoints
  - automatic deferred execution after approval
- Minimal frontend (`public/index.html`):
  - run a prompt against executor
  - list pending approvals
  - approve/reject actions

## Project structure

- `src/server.ts` - App composition and route handlers
- `src/index.ts` - Server bootstrap
- `src/agent/executorAgent.ts` - Anthropic tool-use loop
- `src/agent/toolDefinitions.ts` - Tool schemas exposed to Claude
- `src/services/toolExecutor.ts` - Tool execution + approval interception
- `src/services/approvalStore.ts` - SQLite persistence
- `src/mock/metaAdsApi.ts` - Mock Meta Ads module
- `src/mock/googleAdsApi.ts` - Mock Google Ads module
- `public/index.html` - Minimal UI for approvals
- `src/integration/approvalGate.test.ts` - Integration tests for core state transitions
- `SPEC.md` - Part 1 written spec

## How to run

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Edit `.env` and set:

- `ANTHROPIC_API_KEY` (required)
- optional `ANTHROPIC_MODEL` (default: `claude-sonnet-4-20250514`)
- optional `PORT` (default: `3000`)
- optional `SQLITE_DB_PATH` (default: `./data/approvals.db`)

4. Start dev server:

```bash
npm run dev
```

5. Open:

- `http://localhost:3000`

## API endpoints

- `POST /api/agent/run`
  - body: `{ "prompt": "..." }`
  - runs real Anthropic loop with tools
- `GET /api/approvals?status=pending`
  - lists approvals (optional status filter)
- `GET /api/approvals/:id`
  - fetch one approval
- `POST /api/approvals/:id/approve`
  - body: `{ "decidedBy": "name", "note": "optional" }`
  - marks approval approved and immediately executes deferred action
  - duplicate decision guard: if already decided by another request, returns `409` and does not execute again
- `POST /api/approvals/:id/reject`
  - body: `{ "decidedBy": "name", "note": "optional" }`
  - marks approval rejected and discards action

## Approval behavior in prototype

- High-impact tools are intercepted before execution:
  - `*_update_campaign_budget`
  - `*_pause_all_campaigns`
- Pending approvals are persisted in SQLite.
- Agent gets explicit tool result status:
  - `pending_approval`
  - `blocked_by_pending_approval`
  - `executed` / `failed`
- If a campaign scope already has a pending approval, a second high-impact action on that same scope is blocked.

## Tests

Run:

```bash
npm test
```

Included integration tests cover:

- pending action blocks second conflicting action on same campaign
- approve replays original payload and applies expected side effect
- reject leaves campaign unchanged
- double approve race returns one `200` + one `409` (no duplicate execution)

## What is deliberately skipped

- Authentication / RBAC for decision endpoints
- Multi-instance locking and distributed workers
- Idempotency tokens across process crashes
- Approval expiry/escalation policies
- Full Analyst/Manager pipeline (this focuses on Executor path)

## What I would do with more time

- Add auth and audit trails for approvals
- Add queue-backed resume execution with retries and idempotency keys
- Add conflict-resolution strategy beyond simple "one pending per campaign scope"
- Add integration tests for state transitions and failure paths
- Add metrics (pending age, approval latency, fail rate)
