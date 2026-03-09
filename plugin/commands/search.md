---
name: search
description: Search prompts in PromptingBox
user-invocable: true
---

Search for prompts in the user's PromptingBox account.

## Instructions

1. Use the argument provided after the command as the search query.
   - Example: `/promptingbox:search code review` → search for "code review"
2. Call `search_prompts` with the query.
3. Display matching results. For each result, show the title, folder, and ID.
4. If the user wants to see the full content of a result, call `get_prompt` with the ID.

If no argument was provided, ask the user what they'd like to search for.
