# @promptingbox/mcp

MCP (Model Context Protocol) server for [PromptingBox](https://www.promptingbox.com) — save, manage, and organize prompts directly from Claude.ai, Claude Desktop, Cursor, Windsurf, and other MCP-compatible AI tools.

## Quick Start

There are two ways to connect:

| Method | Best for | Install needed? |
|--------|----------|-----------------|
| **[Claude.ai (Web)](#claudeai-web--cowork)** | Claude.ai conversations, Cowork | No |
| **[Local (npm)](#local-setup-npm)** | Claude Desktop, Cursor, Windsurf, Claude Code | Yes |

Both methods give you the same 20 tools and connect to the same account.

---

## Claude.ai (Web / Cowork)

No install needed — works entirely in the browser. This connects PromptingBox to [claude.ai](https://claude.ai) for web conversations and **Cowork** (Claude's cloud agent mode).

### Steps

1. **Get your API key** — Go to [Settings → MCP Integration](https://www.promptingbox.com/workspace/settings?view=mcp) and create a key.

2. **Add a custom connector** — In claude.ai, go to **Settings → Connectors → Add custom connector**.

3. **Enter the connector URL:**
   ```
   https://www.promptingbox.com/api/mcp-transport
   ```

4. **Name it `pbox`** (recommended) — This lets you say "save this to pbox" naturally. You can use any name, but Claude will use whatever name you enter here.

5. **Click Connect** — A window opens asking for your API key. Paste it and click **Authorize**.

6. **Done!** Start a new conversation and try it out.

### Naming tip

We recommend **`pbox`** so you can say "save to pbox" naturally in conversation. If you choose a different name (e.g. "my-prompts"), use that name instead when talking to Claude (e.g. "save to my-prompts"). Claude uses the exact name you entered when adding the connector.

### Examples in Claude.ai

```
"Save this conversation as a prompt to pbox"
"List all my pbox prompts"
"Search pbox for my email templates"
"Save this as 'Meeting Notes Template' in my Work folder on pbox"
"Get my prompt called 'Code Review' from pbox"
"Which pbox account am I connected to?"
```

---

## Local Setup (npm)

For Claude Desktop, Cursor, Windsurf, and Claude Code. Requires Node.js 18+.

### 1. Get your API key

Go to [PromptingBox Settings → MCP Integration](https://www.promptingbox.com/workspace/settings?view=mcp) and create an API key.

### 2. Install the server (run once)

```bash
npm install -g @promptingbox/mcp
```

### 3. Configure your AI tool

> **Tip:** Name the server `pbox` so you can naturally say things like *"save this to pbox"* or *"list my pbox prompts"*.

#### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "pbox": {
      "command": "promptingbox-mcp",
      "env": {
        "PROMPTINGBOX_API_KEY": "pb_your_key_here"
      }
    }
  }
}
```

#### Cursor

Add to `.cursor/mcp.json` in your project (or global config):

```json
{
  "mcpServers": {
    "pbox": {
      "command": "promptingbox-mcp",
      "env": {
        "PROMPTINGBOX_API_KEY": "pb_your_key_here"
      }
    }
  }
}
```

#### Windsurf

Add to your Windsurf MCP config:

```json
{
  "mcpServers": {
    "pbox": {
      "command": "promptingbox-mcp",
      "env": {
        "PROMPTINGBOX_API_KEY": "pb_your_key_here"
      }
    }
  }
}
```

#### Claude Code

Add to `.claude/mcp.json` in your project:

```json
{
  "mcpServers": {
    "pbox": {
      "command": "promptingbox-mcp",
      "env": {
        "PROMPTINGBOX_API_KEY": "pb_your_key_here"
      }
    }
  }
}
```

### 4. Restart your AI tool

Restart Claude Desktop, Cursor, or Windsurf for the MCP server to be detected.

---

## Usage

Once configured, you can say things like:

**Saving & retrieving prompts:**
- "Save this prompt to pbox"
- "Save this as 'Code Review Checklist' in my Work folder on pbox"
- "Save this to pbox with tags 'python' and 'debugging'"
- "Get my prompt called 'Code Review'"
- "Search my pbox prompts for API"
- "List all my pbox prompts"

**Editing & managing prompts:**
- "Update the content of 'Code Review'"
- "Delete the prompt called 'Old Draft'"
- "Duplicate 'Code Review'"
- "Star my 'Code Review' prompt"
- "Move 'Brainstorm Ideas' to my Marketing folder"

**Folders & tags:**
- "Create a folder called 'Work'"
- "Move 'Code Review' to my Work folder"
- "Delete my 'Old' folder"
- "Tag 'Code Review' with testing and automation"
- "List my pbox folders"
- "List my pbox tags"

**Version history:**
- "Show version history for 'Code Review'"
- "Restore version 2 of 'Code Review'"

**Templates:**
- "Search pbox templates for email"
- "Save that template to my collection"

**Account:**
- "Which pbox account am I using?"

## Available Tools

### Prompt Management

| Tool | Description |
|------|-------------|
| `save_prompt` | Save a prompt with title, content, optional folder and tags |
| `get_prompt` | Get the full content and metadata of a prompt |
| `search_prompts` | Search prompts by title, content, tag, folder, or favorites |
| `update_prompt` | Update a prompt's title and/or content (auto-versions) |
| `delete_prompt` | Permanently delete a prompt and all its versions |
| `duplicate_prompt` | Create a copy of an existing prompt |
| `toggle_favorite` | Star or unstar a prompt |
| `list_prompts` | List all prompts grouped by folder |

### Folder Management

| Tool | Description |
|------|-------------|
| `list_folders` | List all folders in your account |
| `create_folder` | Create a new folder (or return existing one) |
| `delete_folder` | Delete a folder (prompts move to root, not deleted) |
| `move_prompt_to_folder` | Move a prompt to a different folder |

### Tag Management

| Tool | Description |
|------|-------------|
| `list_tags` | List all tags in your account |
| `add_tags` | Set tags on a prompt (replaces existing, auto-creates new tags) |
| `delete_tag` | Delete a tag from your account and all prompts |

### Version History

| Tool | Description |
|------|-------------|
| `list_versions` | View all saved versions of a prompt |
| `restore_version` | Restore a prompt to a previous version |

### Templates

| Tool | Description |
|------|-------------|
| `search_templates` | Browse and search the public template library |
| `use_template` | Save a public template to your collection |

### Account

| Tool | Description |
|------|-------------|
| `whoami` | Show which PromptingBox account is connected |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PROMPTINGBOX_API_KEY` | Yes | Your PromptingBox API key (starts with `pb_`) |
| `PROMPTINGBOX_BASE_URL` | No | Override the API base URL (default: `https://www.promptingbox.com`) |

## FAQ

**Can I use both the web connector and local MCP?**
Yes! The web connector (Claude.ai) and local MCP (Claude Desktop) can coexist. They share the same tools and account. The desktop version works in Claude Desktop app, while the web connector works in claude.ai conversations and Cowork.

**What name should I use?**
We recommend `pbox` — it's short and lets you say "save to pbox" naturally. You can also use `promptingbox` or any name you like. Just use your chosen name when talking to Claude.

**Is my data secure?**
Yes. For local setups, the server runs on your machine over HTTPS. For the web connector, authentication uses OAuth 2.1 with PKCE — your API key is never exposed to Claude directly. We store only SHA-256 hashes of API keys, never raw keys.

**Is the server open source?**
Yes. Source code is at [github.com/promptingbox/mcp](https://github.com/promptingbox/mcp).

## License

MIT
