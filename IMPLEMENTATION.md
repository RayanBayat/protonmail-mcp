# ProtonMail MCP implementation tracker

This ledger tracks [SPEC.md](SPEC.md). Checkboxes mean completed work with
evidence, not planned work. Update as implementation and validation proceed.

## Requirement traceability

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| AC01 public fork and attribution | Complete | `RayanBayat/protonmail-mcp`, public, fork of `just-an-oldsalt/proto-mcp`; upstream history retained; GPL LICENSE unchanged; attribution in README |
| AC02 spec and tracker first | Complete | SPEC.md and this file, created before portable implementation |
| AC03 portable implementation | Complete on Windows | Node-only runtime; Go/macOS sources removed. 12/12 tests pass on Windows + Node 25.8. macOS/Linux unverified until CI runs |
| AC04 setup/doctor/config | Partly verified | `setup`/`doctor`/`config`/`serve`/`launch` implemented in `src/cli.mjs`; `saveVault` + `clientConfig` covered by `test/setup.test.mjs`. Interactive prompts and `launch` not automatically tested — they need a TTY and a live Bridge |
| AC05 four read-only MCP tools | Complete | `test/mcp.test.mjs`: real subprocess, official SDK client, initialize, list-tools, all four tools, invalid args and unknown tool rejected |
| AC06 OS tests | Local complete, CI unrun | 12 tests pass locally; `.github/workflows/mailbox.yml` adds 3 OS x Node 22/24 + audit. No macOS or Linux run has occurred yet |
| AC07 security boundaries | Complete | `test/mailbox.test.mjs` asserts EXAMINE/BODY.PEEK, absence of mutating commands, certificate-mismatch rejection, credential-free errors, 2 MiB refusal before download, stale-ID and cursor binding; `test/config.test.mjs` loopback/TLS-only |
| AC08 importable skill | Complete | `mailbox-mcp/skills/protonmail/SKILL.md`, validated by `test/skill.test.mjs` (frontmatter, four tools, untrusted-data framing, no machine-local state) |
| AC09 live Bridge verification | Blocked on user setup | Bridge installed; no credentials accessed. Nothing in this ledger is evidence of real mailbox connectivity |

## Task ledger

- [x] T01 Inventory repository, scripts, dependencies, and platform assumptions.
- [x] T02 Inspect public upstream CI for exact baseline commit.
- [x] T03 Write detailed portable spec and this traceability ledger.
- [x] T04 Migrate prototype and implement portable config/vault with tests.
- [x] T05 Implement/test TLS connection and read-only folder operations.
- [x] T06 Implement/test bounded search, cursors, and message reads.
- [x] T07 Implement/test MCP registration and stdio subprocess lifecycle.
- [x] T08 Implement/test guided setup, doctor, config output, session launcher.
      Non-interactive parts tested; prompt flows exercised only by hand.
- [x] T09 Create skill and user setup/security documentation.
- [x] T10 Add OS matrix; run suite and dependency audit locally.
      CI results and an independent code review are still outstanding.
- [ ] T11 Push to the public fork; verify GitHub metadata and CI outcomes.
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
- 2026-09-06: full suite on Windows 11, Node v25.8.0 — 12 tests, 12 passed,
  0 failed, ~1.6 s. Covers unit, loopback TLS IMAP (implicit and STARTTLS),
  and an MCP subprocess end-to-end. All mail data was synthetic.
- 2026-09-06: `npm audit --omit=dev` reported 0 vulnerabilities;
  `npm ci --ignore-scripts` reproduces the lockfile cleanly.
- 2026-09-06: `npm pack --dry-run` lists 15 files — sources, tests, skill,
  package.json — and no vault, certificate, config, or dependency directory.
  CI enforces this.
- 2026-09-06: user directed removal of unused files; the Go/macOS runtime was
  deleted (201 files: cmd/, internal/, helpers/, Formula/, scripts/, docs/,
  Makefile, go.mod/go.sum, .golangci.yml, TESTING.md, TODO.html, DEFECTS.html,
  the three Go workflows, CODEOWNERS, and the Go-era SECURITY.md). SPEC.md
  AD01 amended to match; the code remains in git history at 7b23913, and
  SECURITY-REVIEW.md records the findings that justified not porting it.

## Known gaps

Recorded rather than glossed over:

- No macOS or Linux execution has happened. The claim of portability rests on
  avoiding platform-specific APIs, not yet on observed runs.
- The interactive `setup` and `launch` flows have no automated coverage;
  a TTY-driven regression could slip through the suite.
- Integration tests use a hand-written IMAP fixture. It approximates Bridge;
  it does not prove Bridge compatibility. Only T12 can do that.
- No independent security review of this Node implementation has been done.
  SECURITY-REVIEW.md reviews the *upstream* Go code, not this code.

## Pending external inputs

- Local Bridge credentials and vault passphrase, entered in setup, never chat.
- OS CI evidence after publication; no macOS/Linux run has been claimed yet.
