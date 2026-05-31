import { Pressable, Text, View } from "react-native";

import type { McpResource, McpServerStatus } from "../../domain/bridge";
import { styles } from "./styles";

export function McpServerRow({
  server,
  expanded,
  onToggle,
  onReadResource
}: {
  server: McpServerStatus;
  expanded: boolean;
  onToggle: () => void;
  onReadResource: (resource: McpResource) => void;
}) {
  const resourceCount = server.resources.length;
  const templateCount = server.resourceTemplates.length;
  const toolCount = Object.keys(server.tools ?? {}).length;

  return (
    <View style={styles.mcpServer}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.mcpServerHeader, pressed && styles.pressed]}>
        <View style={styles.mcpServerTitleWrap}>
          <Text numberOfLines={1} style={styles.mcpServerTitle}>
            {server.name}
          </Text>
          <Text numberOfLines={1} style={styles.mcpServerMeta}>
            {server.authStatus} / {resourceCount} resources / {templateCount} templates / {toolCount} tools
          </Text>
        </View>
        <Text style={styles.mcpToggle}>{expanded ? "Hide" : "Show"}</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.mcpResourceList}>
          {server.resources.length > 0 ? (
            server.resources.map((resource) => (
              <Pressable
                key={resource.uri}
                onPress={() => onReadResource(resource)}
                style={({ pressed }) => [styles.mcpResourceRow, pressed && styles.pressed]}
              >
                <Text numberOfLines={1} style={styles.mcpResourceName}>
                  {resource.title ?? resource.name}
                </Text>
                <Text numberOfLines={2} style={styles.mcpResourceUri}>
                  {resource.uri}
                </Text>
              </Pressable>
            ))
          ) : (
            <Text style={styles.mcpEmptyText}>No readable resources reported.</Text>
          )}
          {server.resourceTemplates.length > 0 ? (
            <Text numberOfLines={3} style={styles.mcpTemplateText}>
              Templates: {server.resourceTemplates.map((template) => template.uriTemplate).join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
