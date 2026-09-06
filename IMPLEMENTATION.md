# ProtonMail MCP implementation tracker

This ledger tracks [SPEC.md](SPEC.md). Checkboxes mean completed work with
evidence, not planned work. Update as implementation and validation proceed.

## Requirement traceability

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| AC01 public fork and attribution | Pending | GitHub CLI initially reports no login; verify outside sandbox |
| AC02 spec and tracker first | Complete | SPEC.md and this file, created before portable implementation |
| AC03 portable implementation | In progress | Windows prototype exists; migrate to common runtime |
| AC04 setup/doctor/config | Pending | Implement portable encrypted vault and CLI |
| AC05 four read-only MCP tools | Pending | Implement with official SDK |
| AC06 OS tests | Pending | Write protocol tests and CI matrix |
| AC07 security boundaries | In progress | Prototype config/ID tests pass; port and extend |
| AC08 importable skill | Pending | Create and validate skill folder |
| AC09 live Bridge verification | Blocked on user setup | Bridge installed; no credentials accessed |

## Task ledger

- [x] T01 Inventory repository, scripts, dependencies, and platform assumptions.
- [x] T02 Inspect public upstream CI for exact baseline commit.
- [x] T03 Write detailed portable spec and this traceability ledger.
- [ ] T04 Migrate prototype and implement portable config/vault with tests.
- [ ] T05 Implement/test TLS connection and read-only folder operations.
- [ ] T06 Implement/test bounded search, cursors, and message reads.
- [ ] T07 Implement/test MCP registration and stdio subprocess lifecycle.
- [ ] T08 Implement/test guided setup, doctor, config output, session launcher.
- [ ] T09 Create skill and user setup/security documentation.
- [ ] T10 Add OS matrix; run suite, dependency audit, and code review.
- [ ] T11 Create and push public fork; verify GitHub metadata and CI.
- [ ] T12 Exercise real Bridge with locally entered credentials.

## Evidence log

- 2026-09-06: baseline 7b23913, clean tracked worktree before prototype.
- 2026-09-06: upstream macOS job on 2026-08-13 passed vet/build/helper/test:
  https://github.com/just-an-oldsalt/proto-mcp/actions/runs/31661910084/job/94328250104
- 2026-09-06: later upstream govulncheck job failed with vulnerable call-path
  annotations (not a clean current dependency scan):
  https://github.com/just-an-oldsalt/proto-mcp/actions/runs/33432614526/job/99621352617
- 2026-09-06: Windows prototype config tests: 2 passed. This is not evidence
  of mailbox connectivity, MCP functionality, or other OS compatibility.
- 2026-09-06: pinned prototype npm install used --ignore-scripts; npm reported
  zero known vulnerabilities among 138 packages at installation time.
- 2026-09-06: user expanded scope to public cross-platform fork and requested
  spec-first implementation, Markdown traceability, and uv for any Python use.

## Pending external inputs

- GitHub sign-in/account access for creating the user's public fork.
- Local Bridge credentials and vault passphrase, entered in setup, never chat.
- OS CI evidence after publication; no macOS/Linux run has been claimed yet.
