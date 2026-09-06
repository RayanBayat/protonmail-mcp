# ProtonMail MCP implementation tracker

This ledger tracks [SPEC.md](SPEC.md). Checkboxes mean completed work with
evidence, not planned work. Update as implementation and validation proceed.

## Local SQLite cache (2026-09-07)

`serve` now initializes a local `mail-cache.sqlite` automatically and persists
bounded `mailbox_read` responses. Cached reads still validate against Bridge;
searches remain live. The cache is unencrypted, limited to 1,000 messages and
30-day expiry, and can be cleared with `cache-clear`. This supersedes the
original no-persistent-cache decision. The runtime minimum is Node 22.13.0
for built-in SQLite without a command-line flag.

Validation: Windows, Node 26.8.1, local TLS IMAP fixtures and the production
MCP subprocess. Tests cover persistence across instances, skipping repeat body
downloads, account/folder/UID-validity isolation, deletion, oversize rejection,
expiration, eviction, local clearing and sanitized errors. No real mailbox
was read to test this change; live Bridge performance and other OS runs remain
unverified for this feature.

## Release readiness

- [x] Move the package to the repository root and remove the legacy runtime
- [x] Keep installation instructions in README; omit the separate Codex guide as requested
- [x] Add focused contributor/MR instructions and PR template
- [x] Review feature surface and document read-only boundaries
- [ ] Push the final branch and open/merge the fork PR into `main`

## Requirement traceability

| Requirement | Status | Evidence / remaining work |
|---|---|---|
| AC01 public fork and attribution | Complete | `RayanBayat/protonmail-mcp`, public, fork of `just-an-oldsalt/proto-mcp`; upstream history retained; GPL LICENSE unchanged; attribution in README |
| AC02 spec and tracker first | Complete | SPEC.md and this file, created before portable implementation |
| AC03 portable implementation | Complete | Node-only runtime; Go/macOS sources removed. The same suite passes on all three OSes against Node 22 and 24 in CI, and on Windows locally under Node 25.8 |
| AC04 setup/doctor/config | Complete | `setup`, `doctor` and `config` exercised by hand against real Bridge on Windows on 2026-09-06; `saveVault` + `clientConfig` covered by `test/setup.test.mjs`. `launch` still unexercised, and the interactive prompts have no automated coverage |
| AC05 four read-only MCP tools | Complete | `test/mcp.test.mjs`: real subprocess, official SDK client, initialize, list-tools, all four tools, invalid args and unknown tool rejected |
| AC06 OS tests | Complete | Run 34050271822: all 7 jobs green - 14 tests on ubuntu-latest, windows-latest and macos-latest against Node 22 and 24, plus the dependency audit and packaged-file check |
| AC07 security boundaries | Complete | `test/mailbox.test.mjs` asserts EXAMINE/BODY.PEEK, absence of mutating commands, certificate-mismatch rejection, credential-free errors, 2 MiB refusal before download, stale-ID and cursor binding; `test/config.test.mjs` loopback/TLS-only |
| AC08 importable skill | Complete | `skills/protonmail/SKILL.md`, validated by `test/skill.test.mjs` (frontmatter, four tools, untrusted-data framing, no machine-local state) |
| AC09 live Bridge verification | Complete | 2026-09-06: `doctor` against live Bridge v3.22.0 returned "Connected to Proton Bridge over verified TLS. Read-only access works (19 folders)." Certificate, login and folder listing verified; no message was read |

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
- [x] T10 Add OS matrix; run suite and dependency audit on all three OSes.
      An independent security review of this Node code is still outstanding.
- [x] T11 Push to the public fork; verify GitHub metadata and CI outcomes.
- [x] T12 Exercise real Bridge with locally entered credentials.

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

- 2026-09-06: pushed `feature/cross-platform-mcp` and opened PR #1 against the
  fork's own main (not upstream). CI run 34050129686: ubuntu-latest and
  macos-latest passed on Node 22 and 24, and the audit job passed.
  windows-latest failed on one assertion in `test/skill.test.mjs`, which
  assumed LF frontmatter while Windows checks the file out with CRLF. That was
  a defect in the test, not the server; fixed by normalizing line endings in
  the test and adding `.gitattributes` (`* text=auto eol=lf`). Verified by
  converting SKILL.md to CRLF locally and re-running.
- 2026-09-06: CI run 34050271822 green on all 7 jobs - 14 tests on
  ubuntu-latest, windows-latest and macos-latest against Node 22 and 24, plus
  the audit and packaged-file checks. This is the first observed macOS and
  Linux execution and it used synthetic data only; it is not evidence of
  Proton Bridge compatibility.
- 2026-09-06: added two security tests after confirming from ImapFlow's source
  that `options.tls` is merged into the STARTTLS upgrade — the certificate
  fingerprint check is now asserted on the STARTTLS path as well as implicit
  TLS, and a server that stops advertising STARTTLS is asserted to fail
  without sending credentials. Suite is 14 tests.

- 2026-09-06: live Bridge verification on Windows 11, Bridge v3.22.0 listening
  on 127.0.0.1:1143. The user exported Bridge's TLS certificate (self-signed,
  `C=CH O=Proton AG OU=Proton Mail CN=127.0.0.1`, SAN `IP:127.0.0.1`, SHA-256
  `3F:62:6E:C7:...:2E:84`), confirmed the fingerprint at the prompt, and
  completed `setup` in a real terminal. `doctor` then reported: "Connected to
  Proton Bridge over verified TLS. Read-only access works (19 folders)."
  This exercised certificate validation, STARTTLS, Bridge authentication and a
  read-only folder listing against a real mailbox. No message was fetched, and
  no credential or passphrase was visible to the assistant at any point.
- 2026-09-06: `setup` correctly refused to run under a non-TTY stdin when
  invoked through the agent, forcing credential entry into a real terminal.
  Behaved as designed rather than degrading to an echoing prompt.

- 2026-09-06: first real-mailbox use surfaced a defect the fixture missed.
  HTML-only mail returned a blank body. Root cause was not "the server only
  returns text/plain": inside a multipart/alternative, mailparser treats the
  text/plain sibling as the text representation and never converts the HTML
  (`mail-parser.js` ~807), so an empty sibling yields an empty body while the
  HTML is discarded. Marketing and receipt mail routinely ships exactly that.
  Fixed by converting the HTML locally when no usable plain part exists, with
  anchor destinations preserved and images skipped, plus a `text_source` field.
  `html-to-text` pinned to 10.0.1, the version mailparser already resolves.
  Covered by `test/body.test.mjs` (4 tests); suite is 18.

- 2026-09-06: repository restructured for one-command install. The package
  moved from `mailbox-mcp/` to the repository root, because npm cannot install
  from a subdirectory of a git repository. Added a `bin` entry, a `files`
  allowlist, and repository metadata. Verified by packing the tarball (11
  files, no vault/certificate/config), installing it into a clean project, and
  running `protonmail-mcp --help` from `node_modules/.bin`. CI gained an
  `install` job that runs `npm install -g .` and the binary on all three OSes,
  so broken install instructions fail the build.
- 2026-09-06: switched development and CI to pnpm 10.20.0, pinned via
  `packageManager`. `pnpm-lock.yaml` replaces `package-lock.json`. The suite
  passes under pnpm's non-hoisted layout, which confirms no module relies on an
  undeclared transitive dependency. `pnpm audit --prod` reports no known
  vulnerabilities. Note the boundary honestly: npm ignores a dependency's
  lockfile when installing from git, so the lockfile binds development and CI
  only. End-user installs are pinned by the exact versions in `package.json`,
  and their transitive set is resolved fresh.

- 2026-09-06: CI run 34060791550 green on all 10 jobs - 18 tests on three OSes
  against Node 22 and 24, the pnpm audit, the packaged-file check, and a fresh
  global install plus `protonmail-mcp --help` on ubuntu, windows and macOS.
  The install job earned its place immediately: its first run failed with
  ERR_MODULE_NOT_FOUND because `npm install -g .` symlinks the checkout, so
  Node resolved imports from a tree with no node_modules. Packing first, as
  `npm install -g github:...` does internally, fixed it. That was a defect in
  the check rather than in the package, but it is exactly the class of breakage
  no unit test would catch.

- 2026-09-07: added committed VS Code configuration (`.vscode/launch.json`,
  `tasks.json`, `settings.json`, `extensions.json`), with `.gitignore` narrowed
  so those four are shared and per-user VS Code state is not. Debug configs
  cover the suite, a single file, coverage, each CLI command, and attaching to
  a `--inspect` server; `autoAttachChildProcesses` makes breakpoints work
  inside the subprocess the MCP end-to-end test spawns. The `setup` config uses
  the integrated terminal because setup requires a real TTY, and the `serve`
  config takes the passphrase through a password-type prompt held in memory for
  the session rather than stored in the file.
- 2026-09-07: added `test:watch` and `test:coverage` scripts. First coverage
  run: 78.89% lines, 79.01% branches, 83.33% functions overall, with
  `mailbox.mjs` and `server.mjs` at 100% lines. The low files are `setup.mjs`
  (31.68%) and `cli.mjs` (45.16%), which is the interactive-flow gap already
  recorded below rather than a new finding.
- 2026-09-07: noted that bare `node --test` reports 19 tests where the suite
  has 18. Node auto-discovers every file under `test/`, so the helper
  `test/imap-fixture.mjs` is counted as an empty test file. All entry points
  use the explicit `test/*.test.mjs` glob, and the VS Code test settings
  exclude the helper.

## Known gaps

Recorded rather than glossed over:

- The interactive `setup` and `launch` flows have no automated coverage;
  a TTY-driven regression could slip through the suite. `setup` and `doctor`
  have now been run by hand against real Bridge; `launch` has not.
- `mailbox_search` and `mailbox_read` have now run against a real mailbox via
  an MCP host, which is what surfaced the HTML-body defect. The fix itself is
  covered by unit tests but has not been re-confirmed against real mail.
- The IMAP fixture models plain-text mail only. Real mailboxes are mostly
  multipart/alternative, which is why the blank-body defect survived CI.
- End-user installs resolve transitive dependencies fresh rather than from
  `pnpm-lock.yaml`; only direct dependencies are version-pinned for them.
- Integration tests use a hand-written IMAP fixture. It approximates Bridge
  well enough that connection, auth and folder listing worked against the real
  thing on the first attempt, but it is still not proof of Bridge behaviour.
- No independent security review of this Node implementation has been done.
  SECURITY-REVIEW.md reviews the *upstream* Go code, not this code.

## Pending external inputs

- Local Bridge credentials and vault passphrase, entered in setup, never chat.
- Latest branch CI must pass before merge; prior three-OS evidence is recorded above.
