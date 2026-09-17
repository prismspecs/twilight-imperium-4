---
name: context-budget
description: >-
  Inspects, audits, and compacts AI agent context bloat across Pi Harness,
  Claude Code, OpenCode, and Antigravity. Measures exact token weights of system
  prompts, tool schemas, and resident rules using local audits, the turn-0
  logging proxy (proxy.mjs), and token-meter.
---

# Context Budget & Bloat Optimizer

A cross-harness skill and toolkit to audit, visualize, and eliminate context bloat across the **Pi Harness**, **Claude Code**, **OpenCode**, and **Antigravity (agy)**.

Excess context directly harms reasoning quality, slows down response latency, exhausts model attention windows, and wastes tokens. This skill provides automated tools and an actionable triage runbook to maintain a clean working set.

---

## Harness Understanding: The Role of Pi

**Pi** (`@earendil-works/pi-coding-agent`) is an open-source, minimalist **agent harness**. Rather than functioning as a closed assistant, a harness provides the runtime execution loop, tool protocol dispatch, model orchestration, and tree-structured session history (branching, rewinding, and compaction). The tools, extensions, and resident rules plugged into the harness determine the active capabilities. Keeping a harness's resident context lean is vital because every globally mounted MCP or extension tool definition is transmitted on every interaction.

---

## The Fast Triage Checklist

Always apply these four core rules when organizing agent configurations:

1. **Move from Global to Project Scope**
   - Audit global config files (`~/.pi/agent/settings.json`, `~/.gemini/config/mcp_config.json`, `~/.claude/settings.json`, etc.).
   - Remove any extension or MCP server that isn't required in 100% of your projects (e.g. Blender MCP, database tools, browser automation).
   - Place domain-specific MCPs only in project-root configs (`.mcp.json`, `.pi/mcp.json`, or `.cursor/mcp.json`).

2. **Prune Tool Definitions**
   - Every tool schema injected into the system prompt costs tokens on **every single turn**.
   - If an MCP server or extension exposes 20 tools and you only use 2, use tool-filtering flags/deny lists or project-specific configs.

3. **Check System Prompt & Rules Size**
   - Keep resident prompt files (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules`) **under ~1,000 tokens**.
   - Use **progressive disclosure**: link to local reference files (e.g., `docs/spec/...`) rather than pasting full manuals into resident prompts.

4. **Pipe and Truncate Terminal Outputs**
   - Avoid running commands that dump unbounded logs to the terminal (`cat large_file.log`, raw `npm test` without filters).
   - Pipe with `grep`, `head -n 50`, or `tail -n 50`. Unbounded terminal outputs get baked into the conversation history and compound exponentially.

---

## How to Add Project-Scoped MCPs

When an MCP server (such as Blender, Docker, Database, or Browser Control) is removed from global configuration, wire it project-locally using the methods below:

### 1. For the Pi Harness
Place a `.pi/mcp.json` file inside the root of your project:

```json
{
  "mcpServers": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    }
  }
}
```

When you launch `pi` inside that project directory, Pi automatically loads the project-scoped servers for that session only. You can also run `pi install <source> -l` (or `--local`) to install extensions into `.pi/settings.json`.

### 2. For Antigravity (agy)
Place a standard `.mcp.json` file in your repository root (or inside `.agents/mcp_config.json`):

```json
{
  "mcpServers": {
    "blender": {
      "command": "/home/grayson/.local/bin/blender-mcp",
      "args": []
    },
    "browser-control": {
      "command": "node",
      "args": ["/path/to/browser-control-mcp/mcp-server/dist/server.js"],
      "env": {
        "EXTENSION_SECRET": "your-secret",
        "EXTENSION_PORT": "8089"
      }
    }
  }
}
```

Antigravity walks up from the current working directory to the project root and activates those MCP servers specifically for that workspace.

### 3. For Claude Code
Claude Code supports project-scoped MCP registration directly via CLI or `.mcp.json`:

```bash
# Register project-locally via CLI (adds to .mcp.json in the current repo):
claude mcp add --scope project blender -- uvx blender-mcp

# Or for browser control:
claude mcp add --scope project browser-control -- node /path/to/server.js
```

Or manually create `.mcp.json` in the project root.

### 4. For OpenCode
OpenCode recognizes project-local `.mcp.json` or project-level `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "blender": {
      "command": "uvx",
      "args": ["blender-mcp"]
    }
  }
}
```

---

## Toolkit Capabilities & Commands

The toolkit is accessible via the global `context-budget` CLI or direct Node scripts.

### 1. Cross-Harness Configuration Audit (`context-budget audit`)
Scans all local agent harnesses and the current project workspace for context bloat:

```bash
context-budget audit
# or machine-readable JSON:
context-budget audit --json
```

**What it checks:**
- **Antigravity (`~/.gemini`)**: Global MCP servers, active skills count, global rules token size.
- **Pi Harness (`~/.pi`)**: Packages installed, global MCPs, compaction threshold settings.
- **Claude Code (`~/.claude`)**: `autoMode.environment` token size (detects repo-specific leakage), active skills, disabled skill stubs.
- **OpenCode (`~/.config/opencode`)**: Global instruction files and rule sizes.
- **Current Project Workspace**: Token weights of resident rules (`CLAUDE.md`, `AGENTS.md`), local skills, and project-scoped MCP configs.

---

### 2. Turn-0 Request Inspection Proxy (`context-budget proxy` / `proxy.mjs`)
Agent developer architectural pattern: runs a local proxy between your agent harness and your LLM gateway (e.g., Modal, OpenRouter, Anthropic, OpenAI).

```bash
# Start proxy in live forwarding mode:
context-budget proxy --port 8080 --target https://api.anthropic.com

# Or run in mock/inspection mode (no API key needed, tests harness payloads instantly):
context-budget proxy --port 8080 --mock
```

**What it does on Turn 0:**
1. Intercepts the raw JSON request payload before it reaches the provider.
2. Dumps `turn_0_request.json` to `.context-audit/`.
3. Measures and ranks the exact token/byte cost of:
   - **System Prompt Slices**: Breaks down by header (`#`, `##`, `<RULE[...]`).
   - **Tool Schemas**: Calculates schema parameters and description tokens for every tool, ranking from heaviest to lightest.
   - **User Input & Context Working Set**.
4. Outputs a colorized terminal dashboard and generates `.context-audit/turn_0_breakdown.md`.

---

### 3. Historical Session & MCP Cost Auditing (`token-meter`)
Token Meter (`@whdrnr2583/token-meter`) scans agent JSONL logs to identify token waste:

```bash
# Ingest local session logs:
token-meter ingest

# Run cost & efficiency audit:
token-meter audit

# Print 30-day token summary & top tools:
token-meter stats 30

# Web dashboard:
token-meter serve
```

**Key Signals Detected:**
- Sessions accounting for disproportionate costs.
- Oversized tool responses (e.g., `Read` or `Bash` dumping megabytes).
- Long-latency tools blocking execution.

---

### 4. Pi Harness Context Inspection & Compaction (`pi-context`)
For the **Pi Harness**, two extensions provide live context management:

- **Interactive Visual Dashboard**:
  Type `/context` in any Pi interactive session to view a breakdown of:
  - System prompt
  - Active extensions/skills schemas
  - Tool definitions
  - Working set history

- **Agentic Compaction Tools**:
  - `context_checkpoint`: Label a meaningful milestone (e.g. `tests-passing`).
  - `context_timeline`: Inspect conversation branch structure and checkpoints.
  - `context_compact`: Summarize completed history loops into a state summary.
  - `context_info`: Programmatically check current token usage against window limits.

---

## Step-by-Step Remediation Playbook

### Scenario A: Niche MCP Server Configured Globally
**Problem:** Blender MCP is configured in `~/.gemini/config/mcp_config.json` or `~/.pi/agent/mcp.json`. Every non-Blender project pays 26 tool definitions in token overhead.
**Solution:**
1. Remove `blender` from global config files.
2. In projects that actually require Blender, create a project-local `.mcp.json` or `.pi/mcp.json`.

### Scenario B: Bloated Resident Rules File
**Problem:** `CLAUDE.md` or `AGENTS.md` is >1,500 tokens because it includes complete API documentation or test listings.
**Solution:**
1. Extract reference manuals into `docs/spec/` or `references/`.
2. Keep only core constraints, conventions, and links in the root file.

### Scenario C: Global Claude `autoMode` Leakage
**Problem:** `~/.claude/settings.json` has repository-specific paths in `autoMode.environment`.
**Solution:**
Move project-specific instructions into that project's `CLAUDE.md` or `.claude/config` and keep global settings clean.
