import { Bot, Database, RefreshCcw, Zap } from "lucide-react-native";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { IconAction } from "../../components/IconAction";
import type { ComposerMention } from "../../domain/mentions";
import { colors } from "../../theme/colors";
import { styles } from "./styles";

export function MentionPalette({
  items,
  query,
  loading,
  error,
  onRefresh,
  onSelect
}: {
  items: ComposerMention[];
  query: string;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelect: (mention: ComposerMention) => void;
}) {
  const apps = items.filter((item) => item.kind === "app");
  const skills = items.filter((item) => item.kind === "skill");
  const resources = items.filter((item) => item.kind === "mcp_resource");

  return (
    <View style={styles.mentionPalette}>
      <View style={styles.mentionPaletteHeader}>
        <Text numberOfLines={1} style={styles.mentionPaletteTitle}>
          ${query}
        </Text>
        {loading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
        <IconAction icon={RefreshCcw} label="Refresh mentions" onPress={onRefresh} />
      </View>
      {error ? (
        <Text numberOfLines={2} style={styles.mentionError}>
          {error}
        </Text>
      ) : null}
      <ScrollView style={styles.mentionList} keyboardShouldPersistTaps="handled">
        <MentionSection title="Apps" items={apps} icon="app" onSelect={onSelect} />
        <MentionSection title="Skills" items={skills} icon="skill" onSelect={onSelect} />
        <MentionSection title="MCP resources" items={resources} icon="mcp" onSelect={onSelect} />
        {!loading && items.length === 0 ? (
          <Text style={styles.mentionEmpty}>No matches</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MentionSection({
  title,
  items,
  icon,
  onSelect
}: {
  title: string;
  items: ComposerMention[];
  icon: "app" | "skill" | "mcp";
  onSelect: (mention: ComposerMention) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.mentionSection}>
      <Text style={styles.mentionSectionTitle}>{title}</Text>
      {items.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onSelect(item)}
          style={({ pressed }) => [styles.mentionItem, pressed && styles.menuItemPressed]}
        >
          <View style={styles.mentionIcon}>{mentionIcon(icon)}</View>
          <View style={styles.mentionItemText}>
            <Text numberOfLines={1} style={styles.mentionItemLabel}>
              {item.label}
            </Text>
            <Text numberOfLines={1} style={styles.mentionItemDetail}>
              {item.detail ?? item.token}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.mentionToken}>
            {item.token}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function mentionIcon(icon: "app" | "skill" | "mcp") {
  if (icon === "skill") {
    return <Bot size={14} color={colors.accent} />;
  }
  if (icon === "mcp") {
    return <Database size={14} color={colors.accent} />;
  }
  return <Zap size={14} color={colors.accent} />;
}
