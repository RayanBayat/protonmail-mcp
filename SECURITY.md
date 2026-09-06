# Security

## Reporting

Report suspected vulnerabilities privately through GitHub's **Security →
Report a vulnerability** form on this repository rather than in a public issue.
Please include the affected version, reproduction steps, and impact. Never
include real mailbox content, credentials, or a vault file.

## Design boundaries

These are enforced in code and covered by tests, not aspirations.

**Read-only.** Folders are opened with `EXAMINE` and bodies fetched with
`BODY.PEEK`, so reading does not clear the unread flag. No tool sends, saves,
deletes, moves, labels, or flags mail. No tool accepts a raw IMAP command.
`mailbox.test.mjs` asserts that no `SELECT`, `STORE`, `APPEND`, `EXPUNGE`,
`MOVE`, `COPY`, or `DELETE` reaches the server.

**Localhost and TLS only.** The configuration validator accepts the literal
host `127.0.0.1` and nothing else. Both implicit TLS and required STARTTLS are
supported; plaintext is not. The certificate you exported from Bridge is the
only trust anchor, and its SHA-256 fingerprint is checked explicitly on every
connection. TLS verification is never disabled — not in production, not in
tests, which use their own ephemeral certificates.

**Credentials at rest.** The Bridge IMAP username and password live in a vault
encrypted with scrypt (N=32768) and AES-256-GCM, written atomically with mode
`0600` inside a `0700` directory where the OS supports it. Your Proton account
password is never requested. The vault passphrase is read from
`PROTONMAIL_MCP_PASSPHRASE`; there is no unencrypted on-disk fallback and no
secret in the host configuration file.

**Bounded everything.** Search returns at most 50 results per page over a
bounded UID window; folder lists cap at 200; messages larger than 2 MiB are
refused *before* download; extracted text is capped at 20,000 characters and
attachments at 50 metadata records. At most two mailbox operations run
concurrently, and connections carry connect, greeting, socket, and overall
timeouts.

**No mail on disk.** Message bodies are parsed in memory and returned. Nothing
caches, indexes, or logs them. There is no database.

**No new network surface.** stdio only — no listening port, no service
registration, no startup task, no firewall rule. No telemetry, analytics,
webhooks, or remote content loading. HTML is converted to text without
executing scripts or fetching linked resources.

**Sanitized errors.** Failures return a short actionable message; raw server
responses, credentials, and message content never reach stderr or a tool
result. Invalid arguments are rejected by Zod before any connection opens.

## Residual risks

Stated plainly, because the boundaries above do not cover these:

- **Your AI host and its provider see the mail you request.** A local MCP
  server does not make cloud processing local. This is the single largest
  exposure and it is inherent to the design.
- **Prompt injection is mitigated, not solved.** Mail is third-party content.
  Results are labelled `"untrusted": true`, control characters and
  bidirectional overrides are stripped, and the skill instructs the model to
  treat mail as data. A sufficiently persuasive message may still influence a
  host that ignores that framing. Never let a model act on instructions that
  arrived inside an email.
- **Same-user processes.** `PROTONMAIL_MCP_PASSPHRASE` lives in the server's
  environment, and the derived key and decrypted mail live in its memory. Any
  process running as you with sufficient privilege can read both. This is a
  deliberate trade for portability over an OS-specific keystore.
- **Bridge is trusted.** It holds your Proton session and does the decryption.
  This project's security cannot exceed Bridge's.
- **Dependencies.** Four pinned runtime packages, installed with
  `--ignore-scripts` and audited in CI. Passing CI is not proof that a
  dependency is free of malicious code.
- **A passing test suite is not a mailbox guarantee.** Integration tests run
  against a simulated IMAP server. Live Bridge behaviour is verified
  separately and recorded in [IMPLEMENTATION.md](IMPLEMENTATION.md).

## Supported versions

The `main` branch is the only supported version. Fixes land there.
