// Composer "$mention" model: detecting the active trigger in the draft and
// building the selectable items (apps, skills, MCP resources) from bridge data.

import type { CodexApp, CodexSkill, McpResource, McpServerStatus, RunInputItem } from "./bridge";

export type ComposerMentionKind = "app" | "skill" | "mcp_resource";

export type ComposerMention = {
  id: string;
  kind: ComposerMentionKind;
  token: string;
  label: string;
  detail?: string | null;
  inputItem: RunInputItem;
};

export function activeMentionTrigger(value: string) {
  const match = value.match(/(^|\s)\$([^\s$]*)$/);
  if (!match || match.index === undefined) {
    return null;
  }

  const prefix = match[1] ?? "";
  const query = match[2] ?? "";
  const start = match.index + prefix.length;
  return {
    start,
    end: value.length,
    query
  };
}

export function buildMentionItems(
  apps: CodexApp[],
  skills: CodexSkill[],
  mcpServers: McpServerStatus[],
  query: string
): ComposerMention[] {
  const normalizedQuery = query.trim().toLowerCase();
  const appItems = apps
    .map((app): ComposerMention => ({
      id: `app:${app.id}`,
      kind: "app",
      token: `$${safeToken(app.id)}`,
      label: app.name,
      detail: app.description ?? null,
      inputItem: {
        type: "mention",
        name: app.name,
        path: `app://${app.id}`
      }
    }))
    .filter((item) => mentionMatches(item, normalizedQuery))
    .slice(0, 8);

  const skillItems = skills
    .map((skill): ComposerMention => ({
      id: `skill:${skill.path}`,
      kind: "skill",
      token: `$${safeToken(skill.name)}`,
      label: skill.interface?.displayName ?? skill.name,
      detail: skill.interface?.shortDescription ?? skill.shortDescription ?? skill.description ?? null,
      inputItem: {
        type: "skill",
        name: skill.name,
        path: skill.path
      }
    }))
    .filter((item) => mentionMatches(item, normalizedQuery))
    .slice(0, 8);

  const resourceItems = mcpServers
    .flatMap((server) =>
      server.resources.map((resource) => mcpResourceMention(server.name, resource))
    )
    .filter((item) => mentionMatches(item, normalizedQuery))
    .slice(0, 10);

  return [...appItems, ...skillItems, ...resourceItems];
}

function mcpResourceMention(serverName: string, resource: McpResource): ComposerMention {
  const resourceName = resource.title ?? resource.name;
  return {
    id: `mcp:${serverName}:${resource.uri}`,
    kind: "mcp_resource",
    token: `$${safeToken(serverName)}:${safeToken(resource.name || "resource")}`,
    label: resourceName,
    detail: resource.description ?? resource.uri,
    inputItem: {
      type: "mcp_resource",
      server: serverName,
      uri: resource.uri,
      name: resource.name,
      ...(resource.title ? { title: resource.title } : {})
    }
  };
}

function mentionMatches(item: ComposerMention, query: string) {
  if (!query) {
    return true;
  }

  return [item.token, item.label, item.detail]
    .filter((value): value is string => typeof value === "string")
    .some((value) => value.toLowerCase().includes(query));
}

function safeToken(value: string) {
  const cleaned = value.trim().replace(/\s+/g, "-");
  return cleaned.length > 0 ? cleaned : "item";
}
