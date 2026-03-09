---
name: save
description: Save a prompt to PromptingBox
user-invocable: true
---

Save a prompt to the user's PromptingBox account.

## Instructions

1. Look at the current conversation context. Identify what the user most likely wants to save:
   - If the user just wrote or refined a prompt, save that prompt
   - If the conversation contains a system prompt, instruction set, or reusable template, save that
   - If unclear, ask the user what they'd like to save

2. Before saving, propose:
   - **Title:** A clear, descriptive title
   - **Folder:** Suggest an appropriate folder based on the prompt's domain (optional)
   - **Tags:** Suggest 1-3 relevant tags (optional)

3. Ask the user to confirm or adjust, then call `save_prompt` with the final values.

4. After saving, show the user the prompt URL so they can view it in PromptingBox.

If the user provided arguments after the command (e.g., `/pbox:save my code review prompt`), use that as a hint for what to save.
