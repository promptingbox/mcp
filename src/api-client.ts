const DEFAULT_BASE_URL = 'https://www.promptingbox.com';

export interface PromptingBoxConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface SavePromptParams {
  title: string;
  content: string;
  folder?: string;
  tagNames?: string[];
}

export interface SavePromptResult {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string;
  url: string;
}

export interface AccountInfo {
  id: string;
  email: string;
  name: string;
}

export interface Folder {
  id: string;
  name: string;
  order: number;
  isDefault?: boolean;
}

export interface Tag {
  id: string;
  name: string;
}

export interface PromptListItem {
  id: string;
  title: string;
  folderId: string | null;
  folderName: string | null;
  isFavorite?: boolean;
}

export interface PromptDetail {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  folderName: string | null;
  isFavorite: boolean;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  versionNumber: number;
  title: string;
  content: string;
  versionNote: string | null;
  createdAt: string;
}

export interface TemplateListItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  icon: string | null;
  usageCount: number;
}

export interface TemplateDetail {
  id: string;
  title: string;
  content: string;
  description: string | null;
  category: string;
  icon: string | null;
  usageCount: number;
}

export interface TemplateSearchResult {
  templates: TemplateListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface SearchPromptsParams {
  search?: string;
  tag?: string;
  folder?: string;
  favorites?: boolean;
}

export class PromptingBoxClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: PromptingBoxConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`PromptingBox API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Existing methods ─────────────────────────────────────────────────────

  async savePrompt(params: SavePromptParams): Promise<SavePromptResult> {
    return this.request<SavePromptResult>('/api/mcp/prompt', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async listFolders(): Promise<Folder[]> {
    return this.request<Folder[]>('/api/mcp/folder');
  }

  async listTags(): Promise<Tag[]> {
    return this.request<Tag[]>('/api/mcp/tag');
  }

  async listPrompts(): Promise<PromptListItem[]> {
    return this.request<PromptListItem[]>('/api/mcp/prompt');
  }

  async movePromptToFolder(promptId: string, folder: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/mcp/prompt/${promptId}/folder`, {
      method: 'PATCH',
      body: JSON.stringify({ folder }),
    });
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return this.request<AccountInfo>('/api/mcp/me');
  }

  // ── New: Prompt operations ───────────────────────────────────────────────

  async getPrompt(id: string): Promise<PromptDetail> {
    return this.request<PromptDetail>(`/api/mcp/prompt/${id}`);
  }

  async searchPrompts(params: SearchPromptsParams): Promise<PromptListItem[]> {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.tag) qs.set('tag', params.tag);
    if (params.folder) qs.set('folder', params.folder);
    if (params.favorites) qs.set('favorites', 'true');
    const query = qs.toString();
    return this.request<PromptListItem[]>(`/api/mcp/prompt${query ? `?${query}` : ''}`);
  }

  async updatePrompt(id: string, updates: { title?: string; content?: string }): Promise<{
    success: boolean;
    id: string;
    versionCreated: boolean;
    newVersionNumber: number | null;
  }> {
    return this.request(`/api/mcp/prompt/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  async deletePrompt(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/mcp/prompt/${id}`, {
      method: 'DELETE',
    });
  }

  async duplicatePrompt(id: string): Promise<{ id: string; title: string; url: string }> {
    return this.request(`/api/mcp/prompt/${id}/duplicate`, {
      method: 'POST',
    });
  }

  async toggleFavorite(id: string, isFavorite: boolean): Promise<{ success: boolean; isFavorite: boolean }> {
    return this.request(`/api/mcp/prompt/${id}/favorite`, {
      method: 'PUT',
      body: JSON.stringify({ isFavorite }),
    });
  }

  // ── New: Tag operations ──────────────────────────────────────────────────

  async updatePromptTags(promptId: string, tagNames: string[]): Promise<{ success: boolean; tags: Tag[] }> {
    return this.request(`/api/mcp/prompt/${promptId}/tag`, {
      method: 'PUT',
      body: JSON.stringify({ tagNames }),
    });
  }

  async deleteTag(id: string): Promise<{ success: boolean; tagName: string }> {
    return this.request(`/api/mcp/tag/${id}`, {
      method: 'DELETE',
    });
  }

  // ── New: Folder operations ───────────────────────────────────────────────

  async createFolder(name: string): Promise<{ id: string; name: string; alreadyExisted: boolean }> {
    return this.request('/api/mcp/folder', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async deleteFolder(id: string): Promise<{ success: boolean; folderName: string }> {
    return this.request(`/api/mcp/folder/${id}`, {
      method: 'DELETE',
    });
  }

  // ── New: Version operations ──────────────────────────────────────────────

  async listVersions(promptId: string): Promise<PromptVersion[]> {
    return this.request<PromptVersion[]>(`/api/mcp/prompt/${promptId}/version`);
  }

  async restoreVersion(promptId: string, versionNumber: number): Promise<{
    success: boolean;
    restoredVersion: number;
    newVersionNumber: number;
  }> {
    return this.request(`/api/mcp/prompt/${promptId}/restore`, {
      method: 'POST',
      body: JSON.stringify({ versionNumber }),
    });
  }

  // ── New: Template operations ─────────────────────────────────────────────

  async searchTemplates(params?: { search?: string; category?: string; limit?: number; page?: number }): Promise<TemplateSearchResult> {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.category) qs.set('category', params.category);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.page) qs.set('page', String(params.page));
    const query = qs.toString();
    return this.request<TemplateSearchResult>(`/api/mcp/template${query ? `?${query}` : ''}`);
  }

  async getTemplate(id: string): Promise<TemplateDetail> {
    return this.request<TemplateDetail>(`/api/mcp/template/${id}`);
  }

  async useTemplate(templateId: string): Promise<{ promptId: string; title: string; url: string }> {
    return this.request(`/api/mcp/template/${templateId}/use`, {
      method: 'POST',
    });
  }
}
