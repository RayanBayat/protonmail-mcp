# Upstream security review and what this fork inherits

Baseline reviewed: `just-an-oldsalt/proto-mcp` at commit `7b23913`.

The upstream project maintained an unusually detailed self-audit — three
review cycles in its `SECURITY.md`, with per-defect tracking in `DEFECTS.html`.
Those files documented the *Go/macOS* runtime and were removed when this fork
dropped that runtime; they remain in this repository's git history at
`7b23913`. This file records what mattered for the rewrite. It is a summary of
upstream's own findings plus a read of the code, not an independent audit of
the Go implementation.

## Why the runtime was replaced rather than ported

**Proton Bridge impersonation.** Upstream sent `AppVersion:
macos-bridge@3.24.2` on every Proton API request — Bridge's identifier, for an
unregistered client, as an acknowledged shortcut to pass Proton's API
allowlist. Upstream tracked this as M-1 and left it open across all three
review cycles. This fork does not talk to Proton's API at all; it speaks IMAP
to the user's own Bridge, which is the supported integration path. The issue
disappears rather than being mitigated.

**Hard macOS coupling.** Touch ID approval via a Swift helper, Keychain
storage through CGO, LaunchAgent management, code signing and notarization,
`SO_PEERCRED`-style caller attribution, and Unix signal handling. None of it
ports to Windows, and upstream's own B-5 finding noted the weekly
`govulncheck` job silently under-scanned because the Keychain CGO path could
not link on Ubuntu. Rewriting in Node removed the platform-specific surface
instead of reimplementing it three times.

**Credential handling in memory.** Several findings (H-1, H-2, B-1, B-2, B-3)
concerned secrets round-tripping through non-zeroable Go strings and best-
effort wipes that were never actually invoked on hot paths. This fork does not
handle the Proton account password or session tokens at all — Bridge does. It
holds only Bridge's generated IMAP credentials, and zeroes the derived key and
plaintext buffers after vault operations, while acknowledging that a JavaScript
runtime offers no memory-zeroing guarantee (see SECURITY.md, residual risks).

## Findings this fork answered by design

| Upstream finding | How this fork stands |
|---|---|
| **C-1** decrypted bodies cached in SQLite | No cache, no database. Bodies are parsed in memory and discarded. |
| **C-2** plaintext to stdout without control-char sanitization | All mail-derived strings pass a sanitizer stripping C0/C1 controls, zero-width, and bidirectional-override characters, then are length-capped. |
| **C-6/C-7** HTML sanitizer gaps (`<a href>`, SVG, entity-encoded `javascript:`) | No HTML is rendered or returned. MailParser extracts text; no script execution, no remote content, no link following. |
| **C-8/C-9** SQL built with `Sprintf`; FTS5 input passed verbatim | No SQL. Search is server-side IMAP with Zod-validated fields that reject control characters, so no command injection into the IMAP stream. |
| **B-6** DSN path concatenation → pragma injection via `--db` | No database and no path-taking flag. The config directory is derived per-OS, overridable only by an explicit environment variable. |
| **B-9** unbounded attacker-controlled bytes written to storage | Nothing is written. Reads are refused above 2 MiB before download and capped again after. |
| **B-10** deleted plaintext lingering in SQLite free pages | Not applicable — nothing persisted. |
| **M-4/M-5** error wrapping echoing credential material | A single `publicError` funnel returns fixed, actionable strings; raw protocol errors are never surfaced. Asserted in tests. |
| **D22** `mail_read` with no untrusted-input marker | Every mail-derived result carries `"untrusted": true`, server instructions state it, and the skill makes it explicit. Mitigation, not a guarantee. |
| **D30** Touch ID helper has no password fallback | No biometric dependency; a passphrase-encrypted vault works identically on all three OSes. |

## What was not carried over, and what that costs

Upstream's default-deny policy engine, audit log, approval broker, and
send-time Touch ID confirmation were all built to make *write* operations
safe. This fork has no write operations, so it has none of that machinery.
The cost is real: there is **no audit log** of what the model read, and no
per-tool approval prompt. If mailbox writes are ever added here, that gating
layer has to be rebuilt first — do not add a send tool without it.

Upstream's local SQLite mirror also made reads fast and available offline.
This fork queries Bridge live on every request, which is slower and requires
Bridge to be running.

## Limits of this document

This is a review of a snapshot for the purpose of deciding what to rewrite.
It is not a security certification of either codebase, not a claim that the
upstream defects listed as closed were verified closed, and not evidence of
the absence of malicious code anywhere in the dependency graph. Upstream's
last recorded `govulncheck` run (2026) failed with vulnerable call-path
annotations; that is a property of the Go dependency set this fork no longer
uses, and says nothing about the npm set it does.
