import { router } from "expo-router";
import { Archive, Check, MessageSquarePlus, Pencil, RefreshCcw, RotateCcw, Save, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { IconAction } from "../components/IconAction";
import { Screen } from "../components/Screen";
import type { BridgeThread } from "../domain/bridge";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { fontWeights } from "../theme/typography";
import { formatDateTime } from "../utils/format";

export function ConversationsScreen() {
  const bridge = useBridge();
  const [search, setSearch] = useState("");
  const [lastArchived, setLastArchived] = useState<BridgeThread | null>(null);
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
          <Text style={styles.title}>Conversations</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {bridge.selectedWorkspace?.name ?? "No repository"}
          </Text>
        </View>
        <IconAction icon={RefreshCcw} label="Refresh" onPress={() => void bridge.refreshThreads()} />
        <IconAction
          icon={MessageSquarePlus}
          label="New conversation"
          variant="filled"
          onPress={() => {
            void bridge.createNewThread().then(() => router.back());
          }}
        />
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search conversations"
        placeholderTextColor={colors.textSubtle}
        style={styles.search}
      />

      {lastArchived ? (
        <View style={styles.undoBand}>
          <Text numberOfLines={1} style={styles.undoText}>
            Archived {lastArchived.title || "Untitled"}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              const archived = lastArchived;
              setLastArchived(null);
              void bridge.restoreThread(archived);
            }}
            style={styles.undoButton}
          >
            <RotateCcw size={16} color={colors.accent} />
            <Text style={styles.undoButtonText}>Undo</Text>
          </Pressable>
        </View>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ConversationRow
            thread={item}
            onArchived={(thread) => setLastArchived(thread)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No conversations</Text>
          </View>
        }
      />
    </Screen>
  );
}

function ConversationRow({
  thread,
  onArchived
}: {
  thread: BridgeThread;
  onArchived: (thread: BridgeThread) => void;
}) {
  const bridge = useBridge();
  const active = bridge.selectedThread?.id === thread.id;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(thread.title || "");
  const canRename = bridge.capabilities.threads.rename;
  const canArchive = bridge.capabilities.threads.archive;

  if (renaming) {
    return (
      <View style={[styles.row, active && styles.rowActive]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          autoFocus
          placeholder="Conversation title"
          placeholderTextColor={colors.textSubtle}
          style={styles.renameInput}
        />
        <IconAction
          icon={Save}
          label="Save title"
          variant="filled"
          disabled={!draft.trim()}
          onPress={() => {
            void bridge.renameThread(thread, draft).then((updated) => {
              if (updated) {
                setRenaming(false);
              }
            });
          }}
        />
        <IconAction
          icon={X}
          label="Cancel rename"
          onPress={() => {
            setDraft(thread.title || "");
            setRenaming(false);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.row, active && styles.rowActive]}>
      <Pressable
        onPress={() => {
          void bridge.selectThread(thread).then(() => router.back());
        }}
        style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
      >
        <Text numberOfLines={2} style={styles.rowTitle}>
          {thread.title || "Untitled"}
        </Text>
        <Text numberOfLines={2} style={styles.rowPreview}>
          {thread.preview || thread.id}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {formatDateTime(thread.updated_at)} / {thread.source ?? "codex"}
        </Text>
      </Pressable>

      <View style={styles.rowActions}>
        {active ? <Check size={20} color={colors.accent} /> : null}
        <IconAction
          icon={Pencil}
          label="Rename"
          disabled={!canRename}
          onPress={() => setRenaming(true)}
        />
        <IconAction
          icon={Archive}
          label="Archive"
          disabled={!canArchive}
          onPress={() => {
            void bridge.archiveThread(thread).then((result) => {
              if (result?.supported && result.archived) {
                onArchived(thread);
              }
            });
          }}
        />
      </View>
    </View>
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
    fontWeight: fontWeights.title
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
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
    fontSize: 15,
    fontWeight: fontWeights.body
  },
  undoBand: {
    minHeight: 44,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  undoText: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  undoButton: {
    minHeight: 32,
    borderRadius: radii.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface
  },
  undoButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: fontWeights.action
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
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.action
  },
  rowPreview: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.body,
    marginTop: 5,
    lineHeight: 18
  },
  rowMeta: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 7
  },
  renameInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.body
  },
  empty: {
    minHeight: 240,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyTitle: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: fontWeights.subtitle
  }
});
