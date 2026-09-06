<div align="center">

# ProtonMail MCP

**Read your Proton mailbox from an AI host — on Windows, macOS or Linux.**

A local, read-only [Model Context Protocol](https://modelcontextprotocol.io)
server that talks to [Proton Mail Bridge](https://proton.me/mail/bridge) over
loopback TLS. Four tools: check status, list folders, search, read. Nothing
sends, deletes, moves, or even marks a message read.

![platform: Windows, macOS, Linux](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Node 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)
![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-ready-8A63D2)
![license: GPLv3](https://img.shields.io/badge/license-GPLv3-blue)

</div>

---

## What it does

> *"What did I miss from the climbing group this week?"*
> → Searches `INBOX`, reads the thread, summarizes it.

> *"Draft a reply to Alice saying I'm in for Saturday."*
> → Writes the reply in the conversation. You copy it into Proton Mail and
> send it yourself. This server has no send tool.

Reading is the whole product. That is a deliberate boundary, not a milestone:
there is no code path in this repository that mutates a mailbox.

## Requirements

- A **paid Proton plan** — Bridge is not available on free accounts.
- **Proton Mail Bridge**, installed, signed in, and running. Bridge handles
  Proton login, token rotation, and decryption; this server only speaks IMAP
  to Bridge's loopback endpoint.
- **Node.js 22 or newer**.

## Setup

```sh
cd mailbox-mcp
npm ci --ignore-scripts
node src/cli.mjs setup
```

On PowerShell, use `npm.cmd` if the execution policy blocks `npm.ps1`.

`setup` asks for Bridge's IMAP port, its generated IMAP username and password
(**not** your Proton account password), the path to the TLS certificate you
exported from Bridge's settings, and a vault passphrase. It shows the
certificate's SHA-256 fingerprint for you to confirm, verifies the connection,
and only then writes an encrypted vault (scrypt + AES-256-GCM) to your
per-user config directory.

Then check it and print host configuration:

```sh
node src/cli.mjs doctor
node src/cli.mjs config
```

## Connecting a host

The server reads the vault passphrase from `PROTONMAIL_MCP_PASSPHRASE` in its
environment. Nothing is stored in the host configuration file, so paste the
output of `config` into your client and start it with the passphrase set:

```sh
node src/cli.mjs launch codex
# Windows: node src/cli.mjs launch powershell.exe -NoExit
```

`launch` prompts once, verifies the vault, and starts the named program with
the passphrase in its environment — keeping it out of your shell history.

Copy `mailbox-mcp/skills/protonmail/` into your host's skills directory to give
the model guidance on paginating searches and handling untrusted mail.

## Tools

| Tool | Inputs | Returns |
|---|---|---|
| `mailbox_status` | none | connectivity and read-only state, no mail |
| `mailbox_folders` | none | up to 200 selectable folder paths |
| `mailbox_search` | folder, `text`/`from`/`subject`/`unread`, `limit` 1–50, `cursor` | summaries and a continuation cursor |
| `mailbox_read` | `message_id` | headers, up to 20,000 characters of plain text, attachment metadata |

All four are annotated read-only and idempotent. Search walks a bounded window
of recent UIDs newest-first, so an empty page can still return a cursor —
follow it until it is null.

## Privacy

Mail returned by these tools enters the host conversation and **may be sent to
that host's AI provider**. Running the server locally does not make cloud model
processing local. Nothing here adds analytics, telemetry, webhooks, or remote
content loading; at runtime the only outbound connection is to Bridge on
`127.0.0.1`. Message bodies are never written to disk — there is no cache.

See [SECURITY.md](SECURITY.md) for the boundaries and residual risks, and
[SECURITY-REVIEW.md](SECURITY-REVIEW.md) for what was inherited from upstream
and why it was left behind.

## Development

```sh
cd mailbox-mcp
npm test              # unit, loopback TLS IMAP, and MCP subprocess tests
npm audit --omit=dev
```

Tests run against a local TLS IMAP fixture with ephemeral certificates and
synthetic messages; the fixture rejects mutating commands, so a regression that
tried to write would fail rather than touch a real mailbox. CI runs the same
suite on Ubuntu, Windows, and macOS against Node 22 and 24.

Design and rationale: [SPEC.md](SPEC.md). Progress and evidence:
[IMPLEMENTATION.md](IMPLEMENTATION.md).

## Attribution and license

A fork of [`just-an-oldsalt/proto-mcp`](https://github.com/just-an-oldsalt/proto-mcp),
a macOS-only Go implementation that logged into Proton's private API directly.
This fork replaces that runtime with a portable Node.js server built on Proton's
own Bridge; the original history is preserved in this repository's git log.

GPL-3.0-only. See [LICENSE](LICENSE).
