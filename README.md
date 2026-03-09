# @promptingbox/mcp

MCP (Model Context Protocol) server for [PromptingBox](https://www.promptingbox.com) — save, manage, and organize prompts directly from Claude, Cursor, ChatGPT, and other MCP-compatible AI tools.

## Setup

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

Restart Claude Desktop or Cursor for the MCP server to be detected.

## Usage

Once configured, you can say things like:

**Saving & retrieving prompts:**
- "Save this prompt to pbox"
- "Save this as 'Code Review Checklist' in my Work folder on pbox"
- "Get my prompt called 'Code Review'"
- "Search my pbox prompts for API"
- "List my pbox prompts"

**Editing & managing prompts:**
- "Update the content of 'Code Review'"
- "Delete the prompt called 'Old Draft'"
- "Duplicate 'Code Review'"
- "Star my 'Code Review' prompt"

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

## License

MIT
