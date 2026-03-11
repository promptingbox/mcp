#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PromptingBoxClient } from './api-client.js';
import { registerTools } from './tools.js';

const API_KEY = process.env.PROMPTINGBOX_API_KEY;
const BASE_URL = process.env.PROMPTINGBOX_BASE_URL; // optional override

if (!API_KEY) {
  process.stderr.write(
    'Error: PROMPTINGBOX_API_KEY environment variable is required.\n' +
    'Get your API key at https://www.promptingbox.com/workspace/settings?view=mcp\n'
  );
  process.exit(1);
}

const client = new PromptingBoxClient({ apiKey: API_KEY, baseUrl: BASE_URL });

const CURRENT_VERSION = '0.5.0';

// Cache account info so we can surface it in every response
let accountEmail: string | null = null;

async function getAccountLabel(): Promise<string> {
  if (accountEmail) return accountEmail;
  try {
    const info = await client.getAccountInfo();
    accountEmail = info.email;
    return accountEmail;
  } catch {
    return 'unknown (could not verify)';
  }
}

// ── Version update check (once per process lifetime) ─────────────────────────
let updateNotice: string | null = null;
let updateChecked = false;

function isNewer(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) > (c[i] ?? 0)) return true;
    if ((l[i] ?? 0) < (c[i] ?? 0)) return false;
  }
  return false;
}

async function checkForUpdate(): Promise<string | null> {
  if (updateChecked) return updateNotice;
  updateChecked = true;
  try {
    const versionUrl = `${BASE_URL || 'https://www.promptingbox.com'}/api/mcp/version`;
    const res = await fetch(versionUrl);
    if (!res.ok) return null;
    const data = await res.json() as { mcp?: string };
    const latest = data.mcp;
    if (!latest) return null;
    if (isNewer(latest, CURRENT_VERSION)) {
      updateNotice = [
        ``,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `  New version available: v${CURRENT_VERSION} → v${latest}`,
        `  Run: npm install -g @promptingbox/mcp`,
        `  Changelog: https://www.promptingbox.com/docs/mcp`,
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ].join('\n');
    }
    return updateNotice;
  } catch {
    return null;
  }
}

/** Combined response suffix: account label + update notice (if available) */
async function getResponseSuffix(): Promise<string> {
  const [email, update] = await Promise.all([
    getAccountLabel(),
    checkForUpdate(),
  ]);
  let suffix = `🔑 Account: ${email}`;
  if (update) suffix += `\n${update}`;
  return suffix;
}

const server = new McpServer({
  name: 'promptingbox',
  version: CURRENT_VERSION,
});

const baseUrl = BASE_URL ?? 'https://www.promptingbox.com';

// Register all tools using the shared module
registerTools(server, client, baseUrl, getResponseSuffix);

// ── start server ─────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('PromptingBox MCP server running on stdio\n');
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
