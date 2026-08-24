# Approval Gate Prototype Spec

## Scope and Goal

This prototype focuses on the Executor agent path:

1. Claude emits `tool_use`
2. The backend decides whether to execute immediately or route through approval gate
3. Approved actions are executed and returned to Claude as `tool_result`
4. Rejected actions are returned to Claude as `tool_result` with a structured rejection payload

The goal is to prove the full `tool_use`/`tool_result` loop with a real Anthropic call and a persistent approval workflow.

## Where the Approval Gate Intercepts

Interception happens **inside the tool executor**, before any side-effecting API call:

- Claude sends a `tool_use` block.
- The Executor inspects the requested tool and input.
- If the action is high-impact, the Executor writes a pending approval record and returns a `tool_result` status of `pending_approval` instead of executing.
- Claude continues the same loop with this explicit signal and can choose to wait, explain to user, or attempt a safer action.

Why here:

- It is the last safe point before side effects.
- It keeps policy decisions (what requires approval) in one place.
- It works uniformly across Meta and Google tools.

## Approval State Machine

Single approval record states:

- `pending`: created by gate; action not executed.
- `approved`: human approved; ready for execution.
- `rejected`: human rejected; action must never execute.
- `executed`: action executed successfully after approval.
- `failed`: action execution attempted after approval but failed.

Transitions:

- `pending -> approved` via API `POST /approvals/:id/approve`
- `pending -> rejected` via API `POST /approvals/:id/reject`
- `approved -> executed` when executor runs deferred action successfully
- `approved -> failed` when deferred execution throws

Decision guard:

- Approve/reject updates are conditional (`WHERE status = 'pending'`).
- If two reviewers click approve at nearly the same time, only one update succeeds; the other gets a conflict response and does not trigger execution.

Terminal states:

- `rejected`, `executed`, `failed`

Notes:

- We keep `approved` as a distinct state (not directly to `executed`) for observability and retry semantics.
- We store timestamps for every transition.

## Agent Loop Behavior While Pending

When a high-impact action is blocked:

- Executor returns tool result:
  - `status: "pending_approval"`
  - `approvalId`
  - action summary
  - reason (`"high_impact_action"`)
- The loop does **not** silently drop the action.
- The same conversation can later be resumed with a follow-up run that checks approvals and executes approved records.

Prototype simplification:

- We expose explicit endpoints to resume execution after approval.
- We do not implement a distributed queue/worker; execution resumes in-process.

## Concurrent Actions and Pending Collisions

Policy for this prototype:

- If a campaign already has a `pending` approval, any new high-impact action targeting the same campaign is not enqueued as a second pending item.
- Instead, tool result returns `status: "blocked_by_pending_approval"` with the existing `approvalId`.

Why:

- Prevents contradictory actions (for example, increase budget then pause all campaigns).
- Keeps human review simple and deterministic.

Out-of-scope alternative:

- A priority queue of pending actions per campaign with conflict resolution rules.

## Persistence Choice

Use SQLite for approvals and execution metadata.

Why:

- Survives restarts (better than in-memory).
- Zero external dependency for interview setup.
- Easy to inspect and reason about.

Schema includes:

- `approvals` table with ids, provider, tool, payload JSON, campaign key, status, decision metadata, execution result/error.

## High-Impact Action Policy

Initial policy (hard-coded for prototype):

- Require approval for:
  - Any budget change tool
  - Any pause-all-campaigns tool
- Auto-execute all other tools.

Production would likely externalize this policy to config or policy engine.

## Open Questions Before Production

1. **Identity and auth:** who can approve, and how are approvals authenticated/audited?
2. **Idempotency:** how do we prevent duplicate execution across retries/process crashes?
3. **SLA/timeouts:** should pending approvals expire or escalate?
4. **Concurrency model:** what lock strategy across multiple executor instances?
5. **Policy ownership:** where do high-impact rules live and who can edit them?
6. **User feedback loop:** how does the Analyst/Manager layer communicate long-pending decisions?
7. **Failure handling:** should `failed` actions be retryable with same approval or require re-approval?
8. **Observability:** what metrics/events are mandatory (pending age, reject rate, execution latency)?

## Deliberate Prototype Cuts

- No RBAC/auth (local demo API only).
- No background job queue.
- No webhook callbacks to external systems.
- No full multi-tenant data model.
