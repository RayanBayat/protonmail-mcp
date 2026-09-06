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

---

# Installation

Roughly 15 minutes of work, plus waiting for Bridge's first sync. Follow the
steps in order — each depends on the one before it.

## Step 0 — Check the prerequisites

| Requirement | How to check | Notes |
|---|---|---|
| **Paid Proton plan** | Proton account settings | Bridge is **not** available on free plans. This is the one thing you cannot work around. |
| **Node.js 22+** | `node --version` | Install from [nodejs.org](https://nodejs.org) if missing or older. |
| **Proton Mail Bridge** | see Step 1 | Free download, but requires the paid plan above. |

## Step 1 — Install and sign in to Proton Mail Bridge

Bridge is Proton's official local IMAP gateway. It holds your session, rotates
tokens, and does the decryption. This server never sees your Proton password.

1. Download Bridge from [proton.me/mail/bridge](https://proton.me/mail/bridge)
   and install it.
2. Launch it and sign in with your Proton account.
3. **Wait for the initial sync.** Bridge downloads and decrypts your entire
   mailbox locally. That is CPU-bound and can take **hours** on a large
   account. Mail that has not synced yet is invisible over IMAP, so searches
   look sparse until it finishes. It is one-time — later syncs are incremental.

If Bridge offers to configure Outlook, Apple Mail, or Thunderbird, **skip it**.
That step is for desktop mail clients. This server is the client.

## Step 2 — Install the server

Pick one. Both give you a `protonmail-mcp` command.

**Global install (recommended):**

```sh
npm install -g github:RayanBayat/protonmail-mcp
protonmail-mcp --help
```

**Or run it without installing:**

```sh
npx github:RayanBayat/protonmail-mcp --help
```

<details>
<summary>Or from a clone, if you want to modify it</summary>

```sh
git clone https://github.com/RayanBayat/protonmail-mcp.git
cd protonmail-mcp
npm install -g pnpm
pnpm install --frozen-lockfile
node src/cli.mjs --help
```

Everywhere below, read `protonmail-mcp <command>` as `node src/cli.mjs <command>`.
</details>

On PowerShell, if the execution policy blocks `npm.ps1`, use `npm.cmd` instead.

## Step 3 — Collect two things from Bridge

**a) Your IMAP credentials.** In Bridge, select your account, then open
**Mailbox details**. Note the username and the **generated password**.

> ⚠️ That generated password is *not* your Proton account password. Bridge
> creates a separate one for local mail clients. This server has no use for
> your real password and will never ask for it.

**b) The TLS certificate.** In Bridge: **Settings → Advanced → Export TLS
certificates**, and pick a folder such as your Desktop. Bridge writes
`cert.pem` and `key.pem`. You want **`cert.pem`**, the public one. Setup
refuses any file that contains a private key.

## Step 4 — Run setup

**This must run in a real terminal window** — PowerShell, Terminal, or your
shell of choice. It deliberately refuses to run through an AI agent, an IDE
task runner, or anything else that pipes stdin, because without a real
terminal it cannot hide what you type.

```sh
protonmail-mcp setup
```

It asks, in order:

| Prompt | Answer |
|---|---|
| IMAP port | `1143` — Bridge's default; check Mailbox details if unsure |
| Connection security | `starttls` — Bridge's default |
| Path to certificate | full path to `cert.pem` from Step 3b |
| Trust this certificate? | compare the printed SHA-256 against Bridge's, then `yes` |
| Bridge IMAP username | from Step 3a |
| Bridge IMAP password | the generated one; hidden as you type |
| Vault passphrase (×2) | **a new passphrase you invent**, 12+ characters |

The vault passphrase is not any existing password. It encrypts the credential
vault on this machine, and you will need it each time you start your AI host.

Setup verifies TLS and logs into Bridge **before** writing anything, so wrong
credentials fail without leaving a broken vault behind.

## Step 5 — Verify

```sh
protonmail-mcp doctor
```

Expected:

```
Connected to Proton Bridge over verified TLS. Read-only access works (19 folders).
```

If it fails, see [Troubleshooting](#troubleshooting).

## Step 6 — Connect your AI host

Print the configuration for your client:

```sh
protonmail-mcp config
```

Paste the output into your client's MCP configuration. **No secret goes into
that file.** The server reads the vault passphrase from the
`PROTONMAIL_MCP_PASSPHRASE` environment variable instead, which is what Step 7
is for.

For Claude Code:

```sh
claude mcp add protonmail -- protonmail-mcp serve
```

For Claude Desktop, Codex, and other stdio clients, use the JSON or TOML block
that `config` prints.

## Step 7 — Start your host with the vault unlocked

```sh
protonmail-mcp launch claude
```

`launch` prompts once for the vault passphrase, verifies it, then starts the
named program with that passphrase in its environment — keeping it out of your
shell history, your process arguments, and your configuration files.

Substitute whichever host you use, such as `codex`. On Windows you can also run
`protonmail-mcp launch powershell.exe -NoExit` and start your client from
inside that session.

## Step 8 — Add the skill (optional)

Copy `skills/protonmail/` into your host's skills directory. It tells the model
how to paginate searches and — more importantly — to treat mail as untrusted
data rather than as instructions.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Run this command in an interactive terminal` | `setup` was run through something that pipes stdin. Open a real terminal window. |
| `Bridge is not configured or its vault is invalid` | Setup never completed, or `PROTONMAIL_MCP_PASSPHRASE` is not set. Re-run setup, or start via `launch`. |
| `Cannot unlock vault: wrong passphrase or damaged vault` | Wrong vault passphrase — the one you invented in Step 4, not your Proton or Bridge password. |
| `TLS certificate verification failed` | Bridge regenerated its certificate. Export it again (Step 3b) and re-run setup. |
| `Bridge rejected the credentials` | You used your Proton password instead of Bridge's generated one. |
| `Cannot complete the mailbox request` | Bridge is not running or not signed in. Start it, then re-run `doctor`. |
| Searches return little or nothing | Bridge's initial sync is incomplete. Check its progress and wait. |
| A message body comes back empty | Please report it. HTML-only mail is converted to text, so a blank body is a bug. |

---

## Tools

| Tool | Inputs | Returns |
|---|---|---|
| `mailbox_status` | none | connectivity and read-only state, no mail |
| `mailbox_folders` | none | up to 200 selectable folder paths |
| `mailbox_search` | folder, `text`/`from`/`subject`/`unread`, `limit` 1–50, `cursor` | summaries and a continuation cursor |
| `mailbox_read` | `message_id` | headers, up to 20,000 characters of text, attachment metadata |

All four are annotated read-only and idempotent. Search walks a bounded window
of recent UIDs newest-first, so an empty page can still return a cursor —
follow it until it is null. HTML-only mail is converted to text locally with
link destinations preserved; `text_source` tells you which part the text came
from.

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
npm install -g pnpm
pnpm install --frozen-lockfile
pnpm test
pnpm audit --prod
```

pnpm is used here for the reasons `uv` gets used in Python projects: it is
fast, and its non-hoisted `node_modules` means a module can only import what
`package.json` actually declares — so an undeclared transitive dependency
fails here rather than in someone else's install. `pnpm-lock.yaml` is the
source of truth; `package-lock.json` is deliberately absent.

End users do not need pnpm. `npm install -g github:...` resolves the exact
versions pinned in `package.json`.

Tests run against a local TLS IMAP fixture with ephemeral certificates and
synthetic messages. The fixture rejects mutating commands, so a regression that
tried to write would fail rather than touch a real mailbox. CI runs the suite on
Ubuntu, Windows, and macOS against Node 22 and 24, audits dependencies, and
installs the package from a clean checkout on all three systems.

Design and rationale: [SPEC.md](SPEC.md). Progress and evidence:
[IMPLEMENTATION.md](IMPLEMENTATION.md).

Adding a tool or skill: [CONTRIBUTING.md](CONTRIBUTING.md) explains module
boundaries, focused pull requests, and developer checks.

## Attribution and license

A fork of [`just-an-oldsalt/proto-mcp`](https://github.com/just-an-oldsalt/proto-mcp),
a macOS-only Go implementation that logged into Proton's private API directly.
This fork replaces that runtime with a portable Node.js server built on Proton's
own Bridge; the original history is preserved in this repository's git log.

GPL-3.0-only. See [LICENSE](LICENSE).
