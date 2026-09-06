# ProtonMail MCP: cross-platform implementation specification

Date: 2026-09-06
Upstream baseline: `just-an-oldsalt/proto-mcp`, commit `7b23913531fbaa5c5aaf61176af397b972715bac`.
Product/repository name: **ProtonMail MCP** / **protonmail-mcp**.
Requested distribution: public GitHub fork in the requesting user's account.
Status and evidence: [IMPLEMENTATION.md](IMPLEMENTATION.md).

## 1. Objective and acceptance scope

Provide an easy-to-use local MCP server for Proton mail on supported Windows,
macOS, and Linux desktop systems. An MCP host launches the same Node.js program
on all three systems. A companion skill guides mailbox search, reading, and
summarization. This release is read-only: no remote mailbox state is changed,
including read/unread flags. Drafting text in the conversation is possible;
sending, saving drafts, deleting, moving, calendar integration, and attachment
downloads are not included in this release.

"Any OS" means the desktop operating systems supported by Proton Mail Bridge
and Node.js, not Android, iOS, browsers, or every historical OS version. A paid
Proton Mail plan and a logged-in local Bridge installation are prerequisites.
Bridge is installed on the current Windows machine; plan eligibility and a
working account connection have not yet been verified.

Acceptance criteria:

- AC01: public GitHub fork named `protonmail-mcp`, preserving upstream history,
  GPL license, and attribution; no credentials or private mailbox data published.
- AC02: this spec exists before the cross-platform implementation, with a
  maintained Markdown traceability file mapping requirements to tests/evidence.
- AC03: one runnable Node.js implementation on Windows/macOS/Linux, requiring no
  Go, Xcode, Touch ID, LaunchAgent, Unix signals, or OS-specific IMAP code.
- AC04: guided setup, `doctor`, `serve`, and client configuration commands;
  setup stores encrypted credentials and confirms the Bridge TLS certificate.
- AC05: MCP initialize, list-tools, status, folder listing, paginated search,
  and bounded message reads work through the official MCP SDK.
- AC06: automated unit, local TLS IMAP integration, and MCP subprocess tests;
  a CI matrix runs the same suite on Windows, macOS, and Linux.
- AC07: default-deny writes, bounded input/output, TLS certificate validation,
  localhost-only IMAP connections, generic errors, and no persistent mail cache.
- AC08: a portable skill folder can be imported, documents its MCP dependency,
  and distinguishes untrusted email contents from user instructions.
- AC09: a local real-Bridge test is recorded separately from simulated tests.
  Missing credentials or unavailable OS runners remain explicitly unverified.

## 2. Architecture and decisions

### AD01: use Proton's official Bridge rather than porting private API login

The original Go implementation has hard macOS dependencies and impersonates
Proton Bridge's client version. The fork retains that historical source for
reference, but the supported entry point becomes `mailbox-mcp/`. Bridge handles
Proton account login, token rotation, and decryption; our code speaks standard
IMAP to its loopback endpoint. This reduces new credential-handling code and
avoids carrying the upstream draft/send security issues into the new runtime.

### AD02: stdio MCP, no server listening port

The AI host spawns `node .../src/cli.mjs serve`. Stdout is exclusively MCP
JSON-RPC. Errors go to stderr without credentials or message bodies. No MCP
HTTP server, service registration, system startup task, or inbound firewall
rule is necessary. Each request opens a bounded IMAP connection and closes it.
Limit simultaneous mailbox operations and terminate hung connections.

### AD03: encrypted portable credential storage

Use a passphrase-encrypted local vault (scrypt key derivation and AES-256-GCM)
on all OSes, with restrictive user permissions where supported. Setup prompts
for the Bridge-specific username/password and a vault passphrase without echo.
The account password is never required by our code. MCP hosts obtain the vault
passphrase from the invoking environment (`PROTONMAIL_MCP_PASSPHRASE`); no secret
is embedded in a checked-in client configuration or skill. Document that
environment variables/process memory are accessible to sufficiently privileged
same-user processes. The original Windows-only DPAPI prototype is superseded.

Offer a session launcher that prompts once for the vault passphrase and starts
the selected MCP-capable CLI with that environment, keeping the passphrase out
of command-line arguments and shell history. Desktop users set the environment
before launching their client; no unencrypted on-disk fallback is provided.

### AD04: TLS with the user's exported Bridge certificate

Allow only literal `127.0.0.1` and configured TCP port 1..65535. Support required
STARTTLS (Bridge default) and implicit TLS. Setup imports a public certificate
exported by Bridge; the runtime validates the certificate chain against that
certificate and explicitly checks its fingerprint. A changed or expired
certificate requires setup again. Never disable TLS validation to make tests
or production work. Test fixtures use their own ephemeral certificates.

### AD05: read-only means no IMAP mutation

Use EXAMINE instead of SELECT, and BODY.PEEK for reads. No tool accepts raw IMAP
commands or exposes write functionality. Validate inputs with Zod, cap pages
and body size, preserve UIDVALIDITY in message references, and refuse stale
references. Extract text from MIME without executing HTML or fetching links.
Attachments are listed as metadata only. Label every mail-derived result as
untrusted data. This is context guidance, not a prompt-injection guarantee.

### AD06: data boundary disclosure

Mail returned by MCP is visible to its host and may be sent to that host's AI
provider. A local MCP server does not make cloud-model processing local.
No analytics, telemetry, outbound webhooks, remote content loading, or public
mailbox endpoint is added. At runtime only Bridge receives network connections.

## 3. Tool contract

All tools advertise read-only/idempotent annotations. Unknown tools and invalid
arguments fail before accessing IMAP. Tool failures return `isError: true` and
an actionable, sanitized explanation. No raw server responses are returned.

| Tool | Inputs | Result |
|---|---|---|
| `mailbox_status` | none | configuration/connectivity and read-only status |
| `mailbox_folders` | none | bounded selectable folder paths |
| `mailbox_search` | folder (INBOX default), text/from/subject/unread filters, limit 1..50, optional cursor | message summaries and continuation cursor |
| `mailbox_read` | opaque message_id | subject/from/to/date, bounded plain text, attachment metadata, truncation indicator |

Message IDs encode folder, UIDVALIDITY, UID; they grant no additional access.
Search examines bounded descending UID windows, reporting a continuation even
when a sparse window has no matches. Cursors bind to the folder, filters, and
UIDVALIDITY so changing a query cannot silently reuse its continuation state.
Cap raw message downloads at 2 MiB; refuse larger messages before downloading.
Cap returned text at 20,000 characters and attachments at 50 metadata records.
Limit search pages to 50 results, folder lists to 200, and tool concurrency to 2.

## 4. Technology and layout

Node.js >=22, JavaScript ES modules, official MCP SDK, ImapFlow, MailParser,
Zod. Pin dependencies and commit the npm lockfile; install with scripts disabled.
Use the Node built-in test runner. No Python is planned; if needed use `uv`.

```text
SPEC.md                         detailed specification and decisions
IMPLEMENTATION.md               requirements, task progress, test evidence
SECURITY-REVIEW.md              upstream review findings and limitations
mailbox-mcp/package.json        portable runtime/dependency/test commands
mailbox-mcp/src/                config, vault, IMAP service, MCP, CLI/setup
mailbox-mcp/test/               unit tests and local protocol fixtures
mailbox-mcp/skills/protonmail/   importable SKILL.md and metadata
.github/workflows/mailbox.yml   OS test matrix and dependency audit
```

Commands (use `npm.cmd` on PowerShell where script policy blocks npm.ps1):

```sh
cd mailbox-mcp
npm ci --ignore-scripts
npm test
npm audit --omit=dev
node src/cli.mjs setup
node src/cli.mjs doctor
node src/cli.mjs config
node src/cli.mjs serve
```

Use small named functions and explicit imports. Keep OS path selection separate
from protocol logic. Example style:

```js
const lock = await client.getMailboxLock(folder, { readOnly: true });
try {
  return await readMessage(client, reference);
} finally {
  lock.release();
}
```

## 5. Ordered implementation plan

1. **Specification and traceability**: write this file and the task ledger;
   record upstream review and GitHub authentication status.
2. **Portable foundation**: migrate the uncommitted Windows prototype into
   `mailbox-mcp`, implement platform paths, validated config, encrypted vault,
   and identifier/cursor boundaries. Verify negative and round-trip tests.
3. **Read-only mailbox operations**: establish authenticated TLS, folders,
   bounded search/read, stale-ID checks, and cancellation/timeouts. Test against
   a local TLS IMAP fixture that records commands and rejects mutations.
4. **MCP and UX**: implement the four tools, stdio lifecycle, setup, doctor,
   client config output, and session launcher. Verify with the official SDK
   client, including a real subprocess.
5. **Skill and documentation**: create the reusable skill, setup instructions,
   honest privacy/compatibility documentation, and preserve upstream attribution.
6. **Cross-platform CI and review**: run the local suite and audit, inspect the
   diff and packaged files, add a three-OS test matrix, and update traceability.
7. **Public fork and verification**: create the GitHub fork using the
   authenticated account, rename to `protonmail-mcp`, push changes, confirm
   public visibility/fork parent and CI outcomes. Do not publish to npm.
8. **Live smoke test**: after local user-entered setup, run doctor and one
   bounded read-only mailbox test; record what was actually exercised.

## 6. Test strategy

- Unit: config rejection, OS directories, vault integrity/wrong passphrase,
  stable IDs, query/cursor binding, payload limits, and sanitized errors.
- Integration: loopback TLS IMAP fixture; verify EXAMINE/BODY.PEEK, search
  pagination, MIME handling, auth failure, wrong certificate, large-message
  refusal, stale IDs, and connection cleanup.
- End-to-end: official MCP client starts the production CLI, initializes,
  lists tools, calls each read tool, and attempts an unknown/write tool.
- CI: same test suite on ubuntu-latest/windows-latest/macos-latest with Node 22
  and 24, dependency audit on one runner. Synthetic data only.
- Live: explicitly separate actual Bridge authentication/mail access from
  tests of the simulated IMAP server; do not equate passing CI with a full
  upstream feature audit or proof of malware absence.

## 7. Boundaries, risks, and publication

Always validate inputs, use pinned packages, preserve the GPL license, retain
upstream history, run relevant tests, and record failures/unverified claims.
The user has authorized implementation, dependencies, tests, the public fork,
and publication of this project. Publishing unrelated files is outside scope.
Ask for missing login/account access only when necessary. No separate spec or
publication approval is needed under this session's explicit instruction.

Never commit credentials, private mailbox content, machine-local paths in
generated personal configs, dependency directories, or encrypted user vaults.
Never ask for the Proton password or vault passphrase in chat. Never send mail
as a test. Do not silently enable the legacy Go runtime in the cross-platform
installer. Same-user malware and host/provider retention are residual risks.

Outstanding external requirements: authenticated GitHub account, Proton Bridge
account setup, and live test credentials entered locally by the user.

## 8. Primary references

- [Proton Bridge and supported systems](https://proton.me/support/imap-smtp-and-pop3-setup)
- [MCP server development](https://modelcontextprotocol.io/docs/develop/build-server)
- [ImapFlow API](https://imapflow.com/docs/api/imapflow-client/)
- [MailParser](https://nodemailer.com/extras/mailparser)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
- [Codex skills](https://developers.openai.com/codex/skills)
