# Score King bug loop

## Start with the problem

In an active Score King coding session, send a bug description or an existing issue link. No
special command, form, label, or agent selection is required. For example:

```text
Bug loop: On /hearts, [action] produces [actual result].
Expected: [expected result].
Requested fix: [optional].
Device/browser: [optional, useful for device-specific bugs].
```

The agent supplies the investigation, issue, regression coverage, PR, and delivery evidence.
Screenshots and reproduction steps help but are not prerequisites when the behavior can be
established from the report and code. Ask only for information that blocks a safe fix. Treat a
requested fix as a proposed solution; preserve the intended outcome and explain any necessary
deviation instead of implementing a workaround blindly.

This is the **report-to-repair** entry point wired into [AGENTS.md](AGENTS.md#report-driven-bug-loop).
For exploratory discovery across multiple scenarios, use the existing
[bug-bash campaign](.github/prompts/bug-bash.prompt.md) instead. This loop is not a background
watcher: filing a GitHub issue alone does not start an agent, and closing the active session stops
its ability to shepherd delivery.

## Shipping policy and target

**Target: verified live within 15 minutes of the report for eligible low-risk web fixes.**
Measure elapsed wall-clock time, including clarification, Actions queues, CI, and Pages deployment.
Record the report timestamp and deadline at intake; for an existing issue, preserve its original
report timestamp and separately record when active repair started. Never restart the clock to hide
a miss. This is a target, not a guarantee or permission to skip a gate.

The repository owner approved merging the agent's own eligible low-risk fixes after all existing
checks pass and letting the existing merge-triggered Pages workflow publish them. This is not
permission to dispatch deployments manually, change protection/settings, use credentials, merge
someone else's PR, or expand the human-gated authority in [AGENTS.md](AGENTS.md#human-gated-operations-mandatory).

| Fast lane: all must hold                                                 | Standard path: stop fast-lane shipping                                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| One reproducible defect, clear expected behavior, small root-cause fix   | Ambiguous behavior, redesign, feature request, or unrelated defects                                   |
| Existing web/PWA code; no new dependencies or contracts                  | Relay, infrastructure, CI/deployment, dependencies, permissions, or shared canon changes              |
| No change to stored data, sync, authentication, or trust boundaries      | Storage/schema, import/export, sync/conflict resolution, authentication, security, or privacy changes |
| Reversible without data repair; relevant behavior can be checked locally | Real accounts, physical-device evidence, migration, or a check the agent cannot perform               |

Surface uncertainty explicitly. For a standard-path report, investigate read-only, state the
specific risk/blocker, and obtain the necessary human decision before gated work. Do not promise
the 15-minute window. A larger fix may proceed under the normal workflow after scope is agreed;
it must not be mislabeled as low risk to meet the deadline.

## Execution contract for the agent

Use one owning session and one issue/PR per root cause. Do not launch a discovery campaign,
multiple implementation agents, or a standing automation for a single reported bug.
Follow the authoritative [change delivery workflow](.github/instructions/workflow.instructions.md)
for issue reuse, worktree ownership, commits, PRs, and merge gates rather than duplicating it here.
Never edit generated studio assets to implement this local workflow.

| Elapsed target | Action and exit evidence                                                                                                                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-2 min        | Capture report/deadline, expected/actual behavior, relevant route/device, and risk class. Search duplicates and active work; reuse the owning issue/session instead of racing it. Reproduce against current code before editing. |
| 2-7 min        | Create/reuse the issue before mutation. Implement the smallest complete root-cause repair on the owned feature branch; add focused regression coverage.                                                                          |
| 7-11 min       | Re-run the reported scenario and required local checks. Open the focused PR with the issue linkage and evidence; monitor existing CI and mergeability.                                                                           |
| 11-15 min      | Merge only an owned, eligible PR with green checks and a current conflict-free head. Observe the existing Pages deployment, verify the live result, and report delivery evidence.                                                |

These are budgets, not fixed sleeps or timeouts. Move on immediately when a stage finishes.
If reproduction or scope is still uncertain at minute 2, flag the risk to the target. At minute 10,
if a verified fix is not ready for CI, tell the user what remains and whether 15 minutes is still
plausible. At minute 15, report `target missed` with elapsed time, current state, and blocker;
continue safe work while the session remains active unless the user stops it. Never claim
completion, discard checks, or merge a speculative fix to beat the clock.

### Focused verification, not a second QA campaign

- Turn the original reproduction into a regression test when practical, demonstrate it fails
  before the fix and passes after, and check one adjacent boundary/error case. For visual or
  interaction defects, exercise the actual UI; a build or unrelated unit test is not a substitute.
  If browser/device access is unavailable, state that limitation and hand off verification.
- Use a targeted command such as `npm test -- src/lib/example.test.ts` during iteration. Then run
  the existing pre-push gates once for the final candidate: `npm run configs:check`,
  `npm run lint`, `npm run format:check`, `npm run check`, `npm test`, and `npm run build`.
  The required web commands remain owned by [AGENTS.md](AGENTS.md#verification) and package scripts;
  this loop does not weaken them. Documentation-only fixes need applicable documentation/format
  checks, not synthetic product tests.
- Keep existing PR CI intact, including security and performance checks. Reuse its results for the
  exact head SHA; do not create a duplicate broad audit, full-device matrix, or repeated exploratory
  run. Any change after verification needs the affected checks again. UI changes still follow the
  product's design and accessibility constraints.
- A failing check, conflict, unavailable dependency, or flaky result is a blocker, not a pass.
  Repair only coupled failures; report unrelated failures rather than disabling checks.

### Verify delivery, not just merge

The existing [Pages workflow](.github/workflows/deploy.yml) deploys applicable changes on `main`.
Documentation-only changes do not trigger it. Do not edit that workflow, dispatch it, or add a new
release mechanism for routine repairs.

1. Read the merged PR's `mergeCommit.oid`. Find the Pages run for that exact SHA, not simply the
   latest successful run. `gh run list --workflow deploy.yml --commit <merge-sha>` and
   `gh run view <run-id>` expose its status and URL.
2. Require a completed successful deployment and a successful `github-pages` deployment status
   for that SHA. Read-only `gh api` queries to
   `repos/jrmoulckers/score-king/deployments?sha=<merge-sha>&environment=github-pages` and
   `repos/jrmoulckers/score-king/deployments/<id>/statuses` provide the deployment and environment URL.
   A missing, queued, failed, or approval-waiting deployment is not live.
3. Use the deployment URL and a fresh browser context with safe synthetic data to re-run the
   reported scenario. Confirm the served entry point references the repaired build's hashed
   assets from the corresponding successful CI run's `score-king-web` artifact (or a local build
   of that exact commit), rather than relying on HTTP 200 or an old service-worker-controlled tab. If a newer
   deployment supersedes it, verify the served revision includes the fix before calling it live.
   Do not send private game data or use a real account for this check.
4. Report `live verified` only with deployment evidence and a passing live reproduction.
   Otherwise say `deployed; live behavior unverified` or the specific blocked state.

**PWA limitation:** existing open/installed clients check for updates hourly and deliberately wait
for the user's **Refresh** action; offline clients cannot download a fix. The 15-minute target
means the corrected version is available on the live site, not silently installed on every
device. Never force-reload an active game, clear site data, or unregister a user's service worker
to make the target appear met.

## Evidence and recovery

Keep the issue/PR as the durable record: report timestamp, active-repair timestamp if different,
deadline, reproduction, expected/actual result, risk classification, root cause, changed scope,
regression evidence, validation results, PR/merge SHA, Pages run/deployment URL, live check, and
elapsed time. Do not copy private logs or game data into public issues.

Finish with a short status, not a process transcript:

```text
Live verified | 12m elapsed | issue + PR links
Fixed: <user-visible result>.
Evidence: <deployment link and live reproduction result>.
Installed/open apps: accept Refresh when offered; offline devices update after reconnecting.
```

For a blocked or missed target, give the actual state (`investigating`, `awaiting decision`,
`PR checks pending`, `merged; deployment pending`, or `deployed; live behavior unverified`), links,
elapsed time, and the precise next action/owner. Do not call a docs-only workflow change live.

If the live check fails after deployment, stop taking more reports in that session, preserve the
failure evidence, and assess recovery. Prefer a small forward repair when safe; otherwise prepare
a revert PR linked to the original issue. Use the same validation, ownership, approval, and
deployment gates; no direct pushes to `main`, emergency bypass, data reset, or unapproved deploy.
Do not reopen/close issues manually. Document any necessary human action.

For the next report, repeat the loop in the same active session only if its branch is still
usable; otherwise start a fresh app-native session from the current default branch. Never
continue committing on an already-merged branch or mix multiple unverified repairs into one PR.
