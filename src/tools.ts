import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PromptingBoxClient } from './api-client.js';

/** Resolve promptId from either explicit ID or title search */
async function resolvePromptId(
  client: PromptingBoxClient,
  promptId?: string,
  promptTitle?: string
): Promise<{ id: string } | { error: string }> {
  if (promptId) return { id: promptId };
  if (!promptTitle) return { error: 'Provide either promptId or promptTitle.' };

  const all = await client.listPrompts();
  const lower = promptTitle.toLowerCase();
  const matches = all.filter((p) => p.title.toLowerCase().includes(lower));

  if (matches.length === 0) return { error: `No prompt found matching "${promptTitle}".` };
  if (matches.length > 1) {
    const list = matches.map((p) => `- ${p.title} (id: ${p.id})`).join('\n');
    return { error: `Multiple prompts match "${promptTitle}". Use promptId to be specific:\n${list}` };
  }
  return { id: matches[0].id };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

/**
 * Register all PromptingBox tools on a given McpServer.
 *
 * @param server   – McpServer instance (any transport)
 * @param client   – PromptingBoxClient configured with the user's API key
 * @param baseUrl  – Site URL for building prompt links
 * @param getSuffix – Async function returning the response suffix (account label + update notice)
 */
export function registerTools(
  server: McpServer,
  client: PromptingBoxClient,
  baseUrl: string,
  getSuffix: () => Promise<string>
) {
  // ── save_prompt ──────────────────────────────────────────────────────────────
  server.tool(
    'save_prompt',
    'Save a prompt to the user\'s PromptingBox account. Use this when the user wants to save, store, or bookmark a prompt. If no folder is specified, saves to the default folder.',
    {
      title: z.string().describe('A short, descriptive title for the prompt'),
      content: z.string().describe('The full prompt content to save'),
      folder: z.string().optional().describe('Folder name to save into (created if it doesn\'t exist)'),
      tagNames: z.array(z.string()).optional().describe('Tag names to apply (created if they don\'t exist)'),
    },
    async ({ title, content, folder, tagNames }) => {
      try {
        const [result, suffix] = await Promise.all([
          client.savePrompt({ title, content, folder, tagNames }),
          getSuffix(),
        ]);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Prompt saved to PromptingBox!\n\nTitle: ${result.title}\nID: ${result.id}\nURL: ${result.url}` +
                (result.folderId ? `\nFolder: ${folder}` : '') +
                `\n\n${suffix}`,
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to save prompt: ${message}`);
      }
    }
  );

  // ── get_prompt ───────────────────────────────────────────────────────────────
  server.tool(
    'get_prompt',
    'Get the full content of a single prompt from PromptingBox. Returns title, content, tags, folder, and metadata.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
    },
    async ({ promptId, promptTitle }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [prompt, suffix] = await Promise.all([
          client.getPrompt(resolved.id),
          getSuffix(),
        ]);

        const tagList = prompt.tags.length > 0
          ? `Tags: ${prompt.tags.map((t) => t.name).join(', ')}`
          : 'Tags: (none)';

        return {
          content: [{
            type: 'text' as const,
            text: `# ${prompt.title}\n\nID: ${prompt.id}\n` +
              `Folder: ${prompt.folderName ?? '(none)'}\n` +
              `${tagList}\n` +
              `Favorite: ${prompt.isFavorite ? 'Yes' : 'No'}\n` +
              `URL: ${baseUrl}/workspace/prompt/${prompt.id}\n\n` +
              `---\n\n${prompt.content}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get prompt: ${message}`);
      }
    }
  );

  // ── find_relevant (semantic search) ─────────────────────────────────────────
  server.tool(
    'find_relevant',
    'Find prompts in PromptingBox that are semantically relevant to the given context. Uses AI-powered semantic search — matches by meaning, not just keywords. Great for discovering prompts related to what the user is currently working on.',
    {
      context: z.string().describe('The context text to find relevant prompts for (e.g. what the user is working on, a question, a topic)'),
      limit: z.number().int().min(1).max(20).optional().default(5).describe('Max number of results (default 5)'),
      threshold: z.number().min(0).max(1).optional().default(0.3).describe('Minimum similarity score 0-1 (default 0.3)'),
    },
    async ({ context, limit, threshold }) => {
      try {
        const [result, suffix] = await Promise.all([
          client.findRelevant({ context, limit, threshold }),
          getSuffix(),
        ]);

        if (result.count === 0) {
          return {
            content: [{ type: 'text' as const, text: `No relevant prompts found for this context.\n\n${suffix}` }],
          };
        }

        const lines = result.results.map((p) =>
          `- **${p.title}** (${Math.round(p.similarity * 100)}% match)\n  ID: \`${p.id}\`${p.folderName ? ` | 📁 ${p.folderName}` : ''}`
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Found ${result.count} relevant prompt${result.count === 1 ? '' : 's'}:\n\n${lines.join('\n\n')}\n\nUse \`get_prompt\` with the ID to retrieve the full content.\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to find relevant prompts: ${message}`);
      }
    }
  );

  // ── search_prompts ──────────────────────────────────────────────────────────
  server.tool(
    'search_prompts',
    'Search prompts in PromptingBox by title, content, tag, folder, or favorites. Returns matching prompts.',
    {
      query: z.string().optional().describe('Search text to match against title and content'),
      tag: z.string().optional().describe('Filter by tag name'),
      folder: z.string().optional().describe('Filter by folder name'),
      favorites: z.boolean().optional().describe('Set to true to only show favorited prompts'),
    },
    async ({ query, tag, folder, favorites }) => {
      try {
        const [results, suffix] = await Promise.all([
          client.searchPrompts({ search: query, tag, folder, favorites }),
          getSuffix(),
        ]);

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No prompts found matching your search.\n\n${suffix}` }],
          };
        }

        const lines = results.map((p) =>
          `- ${p.isFavorite ? '⭐ ' : ''}${p.title} (id: \`${p.id}\`)${p.folderName ? ` — 📁 ${p.folderName}` : ''}`
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Found ${results.length} prompt${results.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to search prompts: ${message}`);
      }
    }
  );

  // ── update_prompt ───────────────────────────────────────────────────────────
  server.tool(
    'update_prompt',
    'Update the title and/or content of an existing prompt. If content changes, a new version is automatically created.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      title: z.string().optional().describe('New title for the prompt'),
      content: z.string().optional().describe('New content for the prompt'),
    },
    async ({ promptId, promptTitle, title, content }) => {
      try {
        if (!title && !content) return errorResult('Provide at least a new title or content to update.');

        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [result, suffix] = await Promise.all([
          client.updatePrompt(resolved.id, { title, content }),
          getSuffix(),
        ]);

        let text = `Prompt updated successfully!\nID: ${result.id}`;
        if (result.versionCreated) {
          text += `\nNew version created: v${result.newVersionNumber}`;
        }
        text += `\nURL: ${baseUrl}/workspace/prompt/${result.id}`;
        text += `\n\n${suffix}`;

        return { content: [{ type: 'text' as const, text }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to update prompt: ${message}`);
      }
    }
  );

  // ── delete_prompt ───────────────────────────────────────────────────────────
  server.tool(
    'delete_prompt',
    'Permanently delete a prompt from PromptingBox. This also deletes all versions and tag associations.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
    },
    async ({ promptId, promptTitle }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        await client.deletePrompt(resolved.id);
        const suffix = await getSuffix();

        return {
          content: [{ type: 'text' as const, text: `Prompt deleted successfully.\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to delete prompt: ${message}`);
      }
    }
  );

  // ── duplicate_prompt ────────────────────────────────────────────────────────
  server.tool(
    'duplicate_prompt',
    'Create a copy of an existing prompt. The copy gets "(Copy)" appended to the title and inherits the same folder and tags.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
    },
    async ({ promptId, promptTitle }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [result, suffix] = await Promise.all([
          client.duplicatePrompt(resolved.id),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `Prompt duplicated!\n\nTitle: ${result.title}\nID: ${result.id}\nURL: ${result.url}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to duplicate prompt: ${message}`);
      }
    }
  );

  // ── toggle_favorite ─────────────────────────────────────────────────────────
  server.tool(
    'toggle_favorite',
    'Star or unstar a prompt in PromptingBox.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      isFavorite: z.boolean().describe('true to favorite, false to unfavorite'),
    },
    async ({ promptId, promptTitle, isFavorite }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        await client.toggleFavorite(resolved.id, isFavorite);
        const suffix = await getSuffix();

        const action = isFavorite ? 'favorited ⭐' : 'unfavorited';
        return {
          content: [{ type: 'text' as const, text: `Prompt ${action}.\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to toggle favorite: ${message}`);
      }
    }
  );

  // ── add_tags ────────────────────────────────────────────────────────────────
  server.tool(
    'add_tags',
    'Set tags on a prompt (by tag name). This replaces all existing tags on the prompt. Tags are auto-created if they don\'t exist.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      tagNames: z.array(z.string()).describe('Tag names to set on the prompt (replaces existing tags)'),
    },
    async ({ promptId, promptTitle, tagNames }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [result, suffix] = await Promise.all([
          client.updatePromptTags(resolved.id, tagNames),
          getSuffix(),
        ]);

        const tagList = result.tags.map((t) => t.name).join(', ');
        return {
          content: [{
            type: 'text' as const,
            text: `Tags updated: ${tagList || '(no tags)'}.\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to update tags: ${message}`);
      }
    }
  );

  // ── delete_tag ──────────────────────────────────────────────────────────────
  server.tool(
    'delete_tag',
    'Delete a tag entirely from PromptingBox. Removes it from all prompts that use it.',
    {
      tagId: z.string().optional().describe('The tag ID. Provide this or tagName.'),
      tagName: z.string().optional().describe('The tag name. Provide this or tagId.'),
    },
    async ({ tagId, tagName }) => {
      try {
        let resolvedId = tagId;

        if (!resolvedId) {
          if (!tagName) return errorResult('Provide either tagId or tagName.');
          const allTags = await client.listTags();
          const lower = tagName.toLowerCase();
          const matches = allTags.filter((t) => t.name.toLowerCase() === lower);
          if (matches.length === 0) return errorResult(`No tag found matching "${tagName}".`);
          resolvedId = matches[0].id;
        }

        const [result, suffix] = await Promise.all([
          client.deleteTag(resolvedId),
          getSuffix(),
        ]);

        return {
          content: [{ type: 'text' as const, text: `Tag "${result.tagName}" deleted.\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to delete tag: ${message}`);
      }
    }
  );

  // ── create_folder ───────────────────────────────────────────────────────────
  server.tool(
    'create_folder',
    'Create a new folder in PromptingBox. If a folder with the same name exists, returns the existing one.',
    {
      name: z.string().describe('The folder name to create'),
    },
    async ({ name }) => {
      try {
        const [result, suffix] = await Promise.all([
          client.createFolder(name),
          getSuffix(),
        ]);

        const status = result.alreadyExisted ? 'already exists' : 'created';
        return {
          content: [{
            type: 'text' as const,
            text: `Folder "${result.name}" ${status}.\nID: ${result.id}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to create folder: ${message}`);
      }
    }
  );

  // ── delete_folder ───────────────────────────────────────────────────────────
  server.tool(
    'delete_folder',
    'Delete a folder from PromptingBox. Prompts in the folder are moved to the default folder (not deleted). The default folder cannot be deleted.',
    {
      folderId: z.string().optional().describe('The folder ID. Provide this or folderName.'),
      folderName: z.string().optional().describe('The folder name. Provide this or folderId.'),
    },
    async ({ folderId, folderName }) => {
      try {
        let resolvedId = folderId;

        if (!resolvedId) {
          if (!folderName) return errorResult('Provide either folderId or folderName.');
          const allFolders = await client.listFolders();
          const lower = folderName.toLowerCase();
          const matches = allFolders.filter((f) => f.name.toLowerCase() === lower);
          if (matches.length === 0) return errorResult(`No folder found matching "${folderName}".`);
          resolvedId = matches[0].id;
        }

        const [result, suffix] = await Promise.all([
          client.deleteFolder(resolvedId),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `Folder "${result.folderName}" deleted. Prompts moved to root.\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to delete folder: ${message}`);
      }
    }
  );

  // ── list_versions ───────────────────────────────────────────────────────────
  server.tool(
    'list_versions',
    'Get the version history for a prompt. Shows all saved versions with their version numbers, notes, and timestamps.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
    },
    async ({ promptId, promptTitle }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [versions, suffix] = await Promise.all([
          client.listVersions(resolved.id),
          getSuffix(),
        ]);

        if (versions.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No versions found.\n\n${suffix}` }],
          };
        }

        const lines = versions.map((v) =>
          `- **v${v.versionNumber}** — ${v.versionNote ?? 'No note'} (${new Date(v.createdAt).toLocaleDateString()})`
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Version history (${versions.length} version${versions.length === 1 ? '' : 's'}):\n\n${lines.join('\n')}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list versions: ${message}`);
      }
    }
  );

  // ── restore_version ─────────────────────────────────────────────────────────
  server.tool(
    'restore_version',
    'Restore a prompt to a previous version. Creates a new version with the restored content.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      versionNumber: z.number().int().positive().describe('The version number to restore to'),
    },
    async ({ promptId, promptTitle, versionNumber }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [result, suffix] = await Promise.all([
          client.restoreVersion(resolved.id, versionNumber),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `Restored to version ${result.restoredVersion}. New version created: v${result.newVersionNumber}.\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to restore version: ${message}`);
      }
    }
  );

  // ── search_templates ────────────────────────────────────────────────────────
  server.tool(
    'search_templates',
    'Browse and search the PromptingBox public template library. Find pre-built prompts you can save to your collection.',
    {
      query: z.string().optional().describe('Search text to match against template titles and descriptions'),
      category: z.string().optional().describe('Filter by category (e.g. "Business", "Writing", "Development")'),
      limit: z.number().int().min(1).max(50).optional().default(10).describe('Number of results to return (default 10)'),
    },
    async ({ query, category, limit }) => {
      try {
        const result = await client.searchTemplates({ search: query, category, limit });
        const suffix = await getSuffix();

        if (result.templates.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No templates found matching your search.\n\n${suffix}` }],
          };
        }

        const lines = result.templates.map((t) =>
          `- **${t.title}** (${t.category})${t.description ? ` — ${t.description}` : ''}\n  ID: \`${t.id}\` | Used ${t.usageCount} times`
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Found ${result.pagination.total} template${result.pagination.total === 1 ? '' : 's'}` +
              `${result.pagination.hasMore ? ` (showing first ${result.templates.length})` : ''}:\n\n${lines.join('\n\n')}` +
              `\n\nUse \`use_template\` with the template ID to save one to your collection.\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to search templates: ${message}`);
      }
    }
  );

  // ── use_template ────────────────────────────────────────────────────────────
  server.tool(
    'use_template',
    'Save a public template to your PromptingBox collection. Creates a copy you can edit and customize.',
    {
      templateId: z.string().describe('The template ID (from search_templates)'),
    },
    async ({ templateId }) => {
      try {
        const [result, suffix] = await Promise.all([
          client.useTemplate(templateId),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `Template saved to your collection!\n\nTitle: ${result.title}\nID: ${result.promptId}\nURL: ${result.url}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to use template: ${message}`);
      }
    }
  );

  // ── whoami ──────────────────────────────────────────────────────────────────
  server.tool(
    'whoami',
    'Show which PromptingBox account is connected to this MCP server.',
    {},
    async () => {
      try {
        const info = await client.getAccountInfo();

        let text = `Connected to PromptingBox as:\n\nEmail: ${info.email}\nName: ${info.name || '(not set)'}\nID: ${info.id}`;

        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get account info: ${message}`);
      }
    }
  );

  // ── list_folders ─────────────────────────────────────────────────────────────
  server.tool(
    'list_folders',
    'List all folders in the user\'s PromptingBox account. Useful to know where to save a prompt.',
    {},
    async () => {
      try {
        const [folders, suffix] = await Promise.all([client.listFolders(), getSuffix()]);
        if (folders.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No folders found. You can specify a folder name when saving and it will be created automatically.\n\n${suffix}` }],
          };
        }
        const list = folders.map((f) => `- ${f.name} (id: \`${f.id}\`)`).join('\n');
        return {
          content: [{ type: 'text' as const, text: `Folders in PromptingBox:\n${list}\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list folders: ${message}`);
      }
    }
  );

  // ── list_prompts ─────────────────────────────────────────────────────────────
  server.tool(
    'list_prompts',
    'List all prompts in the user\'s PromptingBox account grouped by folder. Use this to see what prompts exist and where they are organized.',
    {},
    async () => {
      try {
        const [prompts, suffix] = await Promise.all([client.listPrompts(), getSuffix()]);
        if (prompts.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No prompts found.\n\n${suffix}` }],
          };
        }

        // Group by folder
        const grouped = new Map<string, typeof prompts>();
        for (const p of prompts) {
          const key = p.folderName ?? 'My Prompts';
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(p);
        }

        const sortedKeys = [...grouped.keys()].sort((a, b) => a.localeCompare(b));

        const lines: string[] = [`Your PromptingBox prompts (${prompts.length} total):\n`];
        for (const key of sortedKeys) {
          lines.push(`📁 ${key}`);
          for (const p of grouped.get(key)!) {
            const fav = p.isFavorite ? '⭐ ' : '';
            lines.push(`   • ${fav}[${p.title}](${baseUrl}/workspace/prompt/${p.id})  \`${p.id}\``);
          }
          lines.push('');
        }

        lines.push(suffix);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n').trimEnd() }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list prompts: ${message}`);
      }
    }
  );

  // ── move_prompt_to_folder ─────────────────────────────────────────────────
  server.tool(
    'move_prompt_to_folder',
    'Move a prompt to a different folder. Provide either the prompt ID or the prompt title — if a title is given, it will be looked up automatically. Does not change or delete prompt content.',
    {
      promptId: z.string().optional().describe('The prompt ID (from list_prompts). Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      folder: z.string().describe('The folder name to move the prompt into'),
    },
    async ({ promptId, promptTitle, folder }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        await client.movePromptToFolder(resolved.id, folder);
        const suffix = await getSuffix();
        return {
          content: [{ type: 'text' as const, text: `Moved prompt to folder "${folder}".\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to move prompt: ${message}`);
      }
    }
  );

  // ── list_tags ────────────────────────────────────────────────────────────────
  server.tool(
    'list_tags',
    'List all tags in the user\'s PromptingBox account. Useful to know what tags are available when saving a prompt.',
    {},
    async () => {
      try {
        const [tags, suffix] = await Promise.all([client.listTags(), getSuffix()]);
        if (tags.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No tags found. You can specify tag names when saving and they will be created automatically.\n\n${suffix}` }],
          };
        }
        const list = tags.map((t) => `- ${t.name} (id: \`${t.id}\`)`).join('\n');
        return {
          content: [{ type: 'text' as const, text: `Tags in PromptingBox:\n${list}\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list tags: ${message}`);
      }
    }
  );
}
