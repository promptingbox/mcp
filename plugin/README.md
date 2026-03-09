# PromptingBox Plugin for Claude Code

[PromptingBox](https://www.promptingbox.com) is a prompt management platform — store, organize, version, and retrieve your AI prompts across tools. This plugin connects Claude Code to your PromptingBox account so you can save and access prompts without leaving the terminal.

## Installation

### Option 1: From marketplace (recommended)

```bash
/plugin install promptingbox
```

### Option 2: From GitHub

```bash
/plugin marketplace add promptingbox/claude-plugins
/plugin install promptingbox
```

## Setup

After installing, connect the plugin to your PromptingBox account:

1. Create a free account at [promptingbox.com](https://www.promptingbox.com) if you don't have one
2. Go to [Settings > MCP](https://www.promptingbox.com/workspace/settings?view=mcp) and copy your API key
3. Set the environment variable:
   ```bash
   export PROMPTINGBOX_API_KEY=your_api_key_here
   ```
   Add this to your shell profile (`~/.zshrc` or `~/.bashrc`) so it persists across sessions.

## Slash Commands

| Command | Description |
|---|---|
| `/promptingbox:save` | Save a prompt from the current conversation |
| `/promptingbox:list` | List all your prompts grouped by folder |
| `/promptingbox:search <query>` | Search your prompt library |

## What's Included

- **MCP Tools:** 20 tools for full prompt management — save, search, update, version, organize with folders and tags, browse public templates
- **Smart Skill:** Claude learns when to proactively suggest saving prompts (e.g., after you iterate on one, or when you say "save this")
- **Slash Commands:** Quick access to common actions without remembering tool names

## MCP Tools Available

| Tool | Description |
|---|---|
| `save_prompt` | Save a new prompt |
| `get_prompt` | Get full prompt content |
| `search_prompts` | Search by title, content, tag, folder |
| `update_prompt` | Update title/content (auto-versions) |
| `delete_prompt` | Delete a prompt |
| `duplicate_prompt` | Copy a prompt |
| `toggle_favorite` | Star/unstar a prompt |
| `add_tags` | Set tags on a prompt |
| `delete_tag` | Delete a tag from all prompts |
| `create_folder` | Create a folder |
| `delete_folder` | Delete a folder |
| `list_versions` | Get version history |
| `restore_version` | Restore to a previous version |
| `search_templates` | Browse public template library |
| `use_template` | Save a template to your collection |
| `whoami` | Show connected account |
| `list_folders` | List all folders |
| `list_prompts` | List all prompts |
| `move_prompt_to_folder` | Move prompt to a folder |
| `list_tags` | List all tags |

## Links

- [PromptingBox](https://www.promptingbox.com)
- [Get API Key](https://www.promptingbox.com/workspace/settings?view=mcp)
- [Documentation](https://www.promptingbox.com/docs/mcp)
