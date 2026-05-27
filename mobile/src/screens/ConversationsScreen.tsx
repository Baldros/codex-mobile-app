import { router } from "expo-router";
import { Check, MessageSquarePlus, RefreshCcw } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { IconAction } from "../components/IconAction";
import { Screen } from "../components/Screen";
import type { BridgeThread } from "../domain/bridge";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { formatDateTime } from "../utils/format";

export function ConversationsScreen() {
  const bridge = useBridge();
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return bridge.threads;
    }
    return bridge.threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(term) ||
        thread.preview.toLowerCase().includes(term) ||
        thread.id.toLowerCase().includes(term)
    );
  }, [bridge.threads, search]);

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Conversas</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {bridge.selectedWorkspace?.name ?? "Sem repositorio"}
          </Text>
        </View>
        <IconAction icon={RefreshCcw} label="Atualizar" onPress={() => void bridge.refreshThreads()} />
        <IconAction
          icon={MessageSquarePlus}
          label="Nova conversa"
          variant="filled"
          onPress={() => {
            void bridge.createNewThread().then(() => router.back());
          }}
        />
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Buscar conversa"
        placeholderTextColor={colors.textSubtle}
        style={styles.search}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <ConversationRow thread={item} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Sem conversas</Text>
          </View>
        }
      />
    </Screen>
  );
}

function ConversationRow({ thread }: { thread: BridgeThread }) {
  const bridge = useBridge();
  const active = bridge.selectedThread?.id === thread.id;

  return (
    <Pressable
      onPress={() => {
        bridge.selectThread(thread);
        router.back();
      }}
      style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && styles.rowPressed]}
    >
      <View style={styles.rowBody}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {thread.title || "Sem titulo"}
        </Text>
        <Text numberOfLines={2} style={styles.rowPreview}>
          {thread.preview || thread.id}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {formatDateTime(thread.updated_at)} · {thread.source ?? "codex"}
        </Text>
      </View>
      {active ? <Check size={20} color={colors.accent} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  titleWrap: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  search: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm
  },
  row: {
    minHeight: 94,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  rowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  rowPressed: {
    opacity: 0.8
  },
  rowBody: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800"
  },
  rowPreview: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 5,
    lineHeight: 18
  },
  rowMeta: {
    color: colors.textSubtle,
    fontSize: 11,
    marginTop: 7
  },
  empty: {
    minHeight: 240,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyTitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "700"
  }
});
