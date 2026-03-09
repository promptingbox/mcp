# Prompt Management Skill

You have access to PromptingBox — a prompt library where the user stores, organizes, and versions their AI prompts. Use the `pbox` MCP tools to interact with it.

## When to proactively suggest saving a prompt

- The user has iterated on a prompt multiple times and reached a version they're happy with
- The user explicitly asks you to write a complex system prompt, persona, or instruction set
- The user says anything like "save this", "remember this prompt", "store this", or "bookmark this"
- The user creates a reusable prompt template (e.g., a code review checklist, writing style guide, analysis framework)
- The user refines a prompt and says something like "that's perfect" or "let's keep this version"

When suggesting a save, briefly explain what you'll save and ask for confirmation before calling `save_prompt`. Suggest a clear, descriptive title.

## When to retrieve prompts

- The user says "get my prompt", "find my prompt about...", "what prompts do I have for..."
- The user wants to reuse or reference a previously saved prompt
- The user asks to list, browse, or organize their prompt collection
- Before writing a prompt from scratch, check if the user already has a similar one saved

## Organization best practices

- **Titles:** Use clear, descriptive titles that make prompts easy to find later. Examples: "Code Review Checklist", "Blog Post Writer — Technical", "SQL Query Optimizer"
- **Folders:** Group related prompts together. Suggest folder names based on the prompt's domain (e.g., "Development", "Writing", "Analysis", "Marketing")
- **Tags:** Apply 1-3 relevant tags for cross-cutting concerns. Good tags describe the prompt's purpose or technique (e.g., "system-prompt", "chain-of-thought", "few-shot", "persona")
- **Versioning:** When updating an existing prompt, use `update_prompt` instead of saving a new copy — this preserves version history automatically

## Tool quick reference

| Action | Tool |
|---|---|
| Save a new prompt | `save_prompt` |
| Find a prompt | `search_prompts` or `get_prompt` |
| See all prompts | `list_prompts` |
| Update content (auto-versions) | `update_prompt` |
| Organize into folders | `move_prompt_to_folder` or `create_folder` |
| Tag prompts | `add_tags` |
| Browse public templates | `search_templates` then `use_template` |
| Check version history | `list_versions` |
| Revert to old version | `restore_version` |
| Check connected account | `whoami` |

## Important notes

- The API key determines which PromptingBox account is used. If the user seems confused about which account they're connected to, run `whoami`.
- When saving, you can specify a `folder` name — it will be auto-created if it doesn't exist.
- When saving, you can specify `tagNames` — tags are auto-created if they don't exist.
- `add_tags` replaces all tags on a prompt. To add a tag without removing existing ones, first get the prompt to see current tags, then call `add_tags` with the combined list.
