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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
              `Published: ${prompt.isPublic ? `Yes — ${baseUrl}/prompt/@.../${prompt.slug}` : 'No'}\n` +
              (prompt.publishedDescription ? `Description: ${prompt.publishedDescription}\n` : '') +
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
    'Create a new folder in PromptingBox. Supports one level of nesting — provide parentId or parentName to create a subfolder. If a folder with the same name exists at the same level, returns the existing one.',
    {
      name: z.string().describe('The folder name to create'),
      parentId: z.string().optional().describe('ID of the parent folder to nest under (max 1 level deep)'),
      parentName: z.string().optional().describe('Name of the parent folder to nest under (resolved to ID automatically)'),
    },
    async ({ name, parentId, parentName }) => {
      try {
        // Resolve parentName → parentId if needed
        let resolvedParentId = parentId;
        if (!resolvedParentId && parentName) {
          const allFolders = await client.listFolders();
          const lower = parentName.toLowerCase();
          const match = allFolders.find((f) => f.name.toLowerCase() === lower);
          if (!match) return errorResult(`Parent folder "${parentName}" not found.`);
          resolvedParentId = match.id;
        }

        const [result, suffix] = await Promise.all([
          client.createFolder(name, resolvedParentId),
          getSuffix(),
        ]);

        const status = result.alreadyExisted ? 'already exists' : 'created';
        const parentNote = resolvedParentId ? ' (subfolder)' : '';
        return {
          content: [{
            type: 'text' as const,
            text: `Folder "${result.name}" ${status}${parentNote}.\nID: ${result.id}\n\n${suffix}`,
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

  // ── rename_folder ──────────────────────────────────────────────────────────
  server.tool(
    'rename_folder',
    'Rename an existing folder in PromptingBox.',
    {
      folderId: z.string().optional().describe('The folder ID. Provide this or folderName.'),
      folderName: z.string().optional().describe('The current folder name. Provide this or folderId.'),
      newName: z.string().describe('The new name for the folder'),
    },
    async ({ folderId, folderName, newName }) => {
      try {
        let resolvedId = folderId;
        if (!resolvedId) {
          if (!folderName) return errorResult('Provide either folderId or folderName.');
          const allFolders = await client.listFolders();
          const lower = folderName.toLowerCase();
          const match = allFolders.find((f) => f.name.toLowerCase() === lower);
          if (!match) return errorResult(`No folder found matching "${folderName}".`);
          resolvedId = match.id;
        }

        const [result, suffix] = await Promise.all([
          client.updateFolder(resolvedId, { name: newName }),
          getSuffix(),
        ]);

        return {
          content: [{ type: 'text' as const, text: `Folder renamed to "${result.name}".\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to rename folder: ${message}`);
      }
    }
  );

  // ── move_folder ───────────────────────────────────────────────────────────
  server.tool(
    'move_folder',
    'Move a folder under a parent folder (nest it) or to the top level. Supports one level of nesting only.',
    {
      folderId: z.string().optional().describe('The folder ID to move. Provide this or folderName.'),
      folderName: z.string().optional().describe('The folder name to move. Provide this or folderId.'),
      parentId: z.string().optional().describe('The parent folder ID to nest under. Provide this or parentName. Omit both to move to top level.'),
      parentName: z.string().optional().describe('The parent folder name to nest under. Provide this or parentId. Omit both to move to top level.'),
    },
    async ({ folderId, folderName, parentId, parentName }) => {
      try {
        const allFolders = await client.listFolders();

        // Resolve folder to move
        let resolvedId = folderId;
        if (!resolvedId) {
          if (!folderName) return errorResult('Provide either folderId or folderName.');
          const lower = folderName.toLowerCase();
          const match = allFolders.find((f) => f.name.toLowerCase() === lower);
          if (!match) return errorResult(`No folder found matching "${folderName}".`);
          resolvedId = match.id;
        }

        // Resolve parent (null = top level)
        let resolvedParentId: string | null = null;
        if (parentId) {
          resolvedParentId = parentId;
        } else if (parentName) {
          const lower = parentName.toLowerCase();
          const match = allFolders.find((f) => f.name.toLowerCase() === lower);
          if (!match) return errorResult(`Parent folder "${parentName}" not found.`);
          resolvedParentId = match.id;
        }

        const [result, suffix] = await Promise.all([
          client.updateFolder(resolvedId, { parentId: resolvedParentId }),
          getSuffix(),
        ]);

        const location = resolvedParentId ? `under "${result.name}"` : 'to top level';
        return {
          content: [{ type: 'text' as const, text: `Folder "${result.name}" moved ${location}.\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to move folder: ${message}`);
      }
    }
  );

  // ── publish_prompt ────────────────────────────────────────────────────────
  server.tool(
    'publish_prompt',
    'Publish a prompt to your public profile on PromptingBox. Makes it visible at /prompt/@username/slug. Requires a username to be set.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      description: z.string().optional().describe('A short public description for the published prompt (max 500 chars)'),
    },
    async ({ promptId, promptTitle, description }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [result, suffix] = await Promise.all([
          client.publishPrompt(resolved.id, description),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `Prompt published!\n\nURL: ${baseUrl}${result.publishedUrl}\nSlug: ${result.slug}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to publish prompt: ${message}`);
      }
    }
  );

  // ── unpublish_prompt ──────────────────────────────────────────────────────
  server.tool(
    'unpublish_prompt',
    'Unpublish a prompt, removing it from your public profile. The prompt is not deleted — it becomes private again.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
    },
    async ({ promptId, promptTitle }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [, suffix] = await Promise.all([
          client.unpublishPrompt(resolved.id),
          getSuffix(),
        ]);

        return {
          content: [{ type: 'text' as const, text: `Prompt unpublished. It is now private.\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to unpublish prompt: ${message}`);
      }
    }
  );

  // ── list_context_sources ──────────────────────────────────────────────────
  server.tool(
    'list_context_sources',
    'List all context sources attached to a prompt. Context sources are files or text that provide additional context when using the prompt.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
    },
    async ({ promptId, promptTitle }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [sources, suffix] = await Promise.all([
          client.listContextSources(resolved.id),
          getSuffix(),
        ]);

        if (sources.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No context sources attached to this prompt.\n\n${suffix}` }],
          };
        }

        const lines = sources.map((s) =>
          `- **${s.source_name}** (${formatBytes(s.extracted_size)})${s.is_enabled ? '' : ' [disabled]'}\n  ID: \`${s.id}\``
        );

        return {
          content: [{
            type: 'text' as const,
            text: `Context sources (${sources.length}):\n\n${lines.join('\n')}\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to list context sources: ${message}`);
      }
    }
  );

  // ── add_context_source ────────────────────────────────────────────────────
  server.tool(
    'add_context_source',
    'Attach a context source to a prompt. Send the extracted text content directly — useful for adding file contents, documentation, or reference material that should accompany the prompt.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      sourceName: z.string().describe('Name of the source (e.g. filename like "README.md")'),
      extractedText: z.string().describe('The text content to attach'),
      sourceMimeType: z.string().optional().describe('MIME type (e.g. "text/plain", "text/markdown")'),
    },
    async ({ promptId, promptTitle, sourceName, extractedText, sourceMimeType }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [result, suffix] = await Promise.all([
          client.addContextSource(resolved.id, {
            sourceName,
            extractedText,
            sourceMimeType,
            sourceSize: new TextEncoder().encode(extractedText).length,
          }),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `Context source "${result.source_name}" added (${formatBytes(result.extracted_size)}).\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to add context source: ${message}`);
      }
    }
  );

  // ── remove_context_source ─────────────────────────────────────────────────
  server.tool(
    'remove_context_source',
    'Remove a context source from a prompt. Use list_context_sources first to get the context source ID.',
    {
      promptId: z.string().optional().describe('The prompt ID. Provide this or promptTitle.'),
      promptTitle: z.string().optional().describe('The prompt title to search for. Provide this or promptId.'),
      contextId: z.string().describe('The context source ID to remove (from list_context_sources)'),
    },
    async ({ promptId, promptTitle, contextId }) => {
      try {
        const resolved = await resolvePromptId(client, promptId, promptTitle);
        if ('error' in resolved) return errorResult(resolved.error);

        const [, suffix] = await Promise.all([
          client.removeContextSource(resolved.id, contextId),
          getSuffix(),
        ]);

        return {
          content: [{ type: 'text' as const, text: `Context source removed.\n\n${suffix}` }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to remove context source: ${message}`);
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

  // ── get_template ────────────────────────────────────────────────────────────
  server.tool(
    'get_template',
    'Get the full content of a public template from the PromptingBox library. Use this to preview a template before saving it with use_template.',
    {
      templateId: z.string().describe('The template ID (from search_templates)'),
    },
    async ({ templateId }) => {
      try {
        const [template, suffix] = await Promise.all([
          client.getTemplate(templateId),
          getSuffix(),
        ]);

        return {
          content: [{
            type: 'text' as const,
            text: `**${template.title}**${template.category ? ` (${template.category})` : ''}\n` +
              (template.description ? `${template.description}\n\n` : '\n') +
              `---\n${template.content}\n---\n\n` +
              `Used ${template.usageCount} times\n` +
              `Use \`use_template\` with ID \`${template.id}\` to save to your collection.\n\n${suffix}`,
          }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return errorResult(`Failed to get template: ${message}`);
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
    'List all folders in the user\'s PromptingBox account. Shows nested folder structure. Useful to know where to save a prompt.',
    {},
    async () => {
      try {
        const [allFolders, suffix] = await Promise.all([client.listFolders(), getSuffix()]);
        if (allFolders.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No folders found. You can specify a folder name when saving and it will be created automatically.\n\n${suffix}` }],
          };
        }

        // Build nested display: top-level first, then children indented
        const topLevel = allFolders.filter((f) => !f.parentId);
        const childrenByParent = new Map<string, typeof allFolders>();
        for (const f of allFolders) {
          if (f.parentId) {
            if (!childrenByParent.has(f.parentId)) childrenByParent.set(f.parentId, []);
            childrenByParent.get(f.parentId)!.push(f);
          }
        }

        const lines: string[] = [];
        for (const f of topLevel) {
          lines.push(`- ${f.name} (id: \`${f.id}\`)`);
          const children = childrenByParent.get(f.id);
          if (children) {
            for (const child of children) {
              lines.push(`  - ${child.name} (id: \`${child.id}\`)`);
            }
          }
        }

        return {
          content: [{ type: 'text' as const, text: `Folders in PromptingBox:\n${lines.join('\n')}\n\n${suffix}` }],
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
