import { router } from "expo-router";
import { Check, FolderPlus, RefreshCcw, RotateCcw, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { IconAction } from "../components/IconAction";
import { Screen } from "../components/Screen";
import type { WorkspaceEntry } from "../domain/bridge";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { fontWeights } from "../theme/typography";
import { compactPath } from "../utils/format";

export function RepositoriesScreen() {
  const bridge = useBridge();
  const [search, setSearch] = useState("");
  const [pathInput, setPathInput] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [lastRemoved, setLastRemoved] = useState<WorkspaceEntry | null>(null);
  const canAdd = bridge.capabilities.workspaces.add === true;
  const canSubmitAdd = canAdd && pathInput.trim().length > 0 && !isAdding;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return bridge.workspaces;
    }
    return bridge.workspaces.filter(
      (workspace) =>
        workspace.name.toLowerCase().includes(term) ||
        workspace.path.toLowerCase().includes(term) ||
        workspace.source.toLowerCase().includes(term)
      );
  }, [bridge.workspaces, search]);

  const handleAddRepository = async () => {
    const cleanPath = pathInput.trim();
    if (!cleanPath || !canAdd || isAdding) {
      return;
    }

    setIsAdding(true);
    setAddError(null);
    const result = await bridge.addWorkspace(cleanPath);
    setIsAdding(false);

    if (!result) {
      setAddError("Could not add repository.");
      return;
    }
    if (!result.supported) {
      setAddError(result.reason ?? "Allowlist is read-only.");
      return;
    }
    if (result.reason) {
      setAddError(result.reason);
      return;
    }

    setPathInput("");
  };

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Repositories</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {bridge.allowlistFile ?? "Workspace allowlist"}
          </Text>
        </View>
        <IconAction icon={RefreshCcw} label="Refresh" onPress={() => void bridge.refreshWorkspaces()} />
      </View>

      <View style={styles.addBar}>
        <TextInput
          value={pathInput}
          autoCapitalize="none"
          autoCorrect={false}
          editable={canAdd && !isAdding}
          onChangeText={(value) => {
            setPathInput(value);
            if (addError) {
              setAddError(null);
            }
          }}
          onSubmitEditing={() => {
            if (canSubmitAdd) {
              void handleAddRepository();
            }
          }}
          placeholder="Desktop repository path"
          placeholderTextColor={colors.textSubtle}
          returnKeyType="done"
          style={[styles.addInput, !canAdd && styles.inputDisabled]}
        />
        <IconAction
          icon={FolderPlus}
          label="Add repository"
          variant="filled"
          disabled={!canSubmitAdd}
          onPress={() => void handleAddRepository()}
        />
      </View>
      {!canAdd ? (
        <Text numberOfLines={1} style={styles.statusText}>
          Allowlist is read-only
        </Text>
      ) : null}
      {addError ? (
        <Text numberOfLines={2} style={styles.errorText}>
          {addError}
        </Text>
      ) : null}

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search repositories"
        placeholderTextColor={colors.textSubtle}
        style={styles.search}
      />

      {lastRemoved ? (
        <View style={styles.undoBand}>
          <Text numberOfLines={1} style={styles.undoText}>
            Removed {lastRemoved.name} from the allowlist
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!bridge.capabilities.workspaces.restore}
            onPress={() => {
              const removed = lastRemoved;
              setLastRemoved(null);
              void bridge.restoreWorkspace(removed.path);
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
        keyExtractor={(item) => item.path}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <RepositoryRow
            workspace={item}
            onRemoved={(workspace) => setLastRemoved(workspace)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No repositories</Text>
          </View>
        }
      />
    </Screen>
  );
}

function RepositoryRow({
  workspace,
  onRemoved
}: {
  workspace: WorkspaceEntry;
  onRemoved: (workspace: WorkspaceEntry) => void;
}) {
  const bridge = useBridge();
  const active = bridge.selectedWorkspace?.path === workspace.path;
  const removable = workspace.source === "file" && bridge.capabilities.workspaces.remove;

  return (
    <View style={[styles.row, active && styles.rowActive, !workspace.exists && styles.rowUnavailable]}>
      <Pressable
        disabled={!workspace.exists}
        onPress={() => {
          void bridge.selectWorkspace(workspace).then(() => router.back());
        }}
        style={({ pressed }) => [styles.rowBody, pressed && styles.rowPressed]}
      >
        <Text numberOfLines={1} style={styles.rowTitle}>
          {workspace.name}
        </Text>
        <Text numberOfLines={2} style={styles.rowPath}>
          {compactPath(workspace.path, 58)}
        </Text>
        <Text numberOfLines={1} style={styles.rowMeta}>
          {workspace.exists ? "Available" : "Missing"} / {workspace.source}
        </Text>
      </Pressable>

      <View style={styles.rowActions}>
        {active ? <Check size={20} color={colors.accent} /> : null}
        <IconAction
          icon={Trash2}
          label="Remove from allowlist"
          disabled={!removable}
          onPress={() => {
            void bridge.removeWorkspace(workspace).then((result) => {
              if (result?.supported && result.removed) {
                onRemoved(workspace);
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
  addBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  addInput: {
    flex: 1,
    minWidth: 0,
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
  inputDisabled: {
    opacity: 0.55
  },
  statusText: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: fontWeights.body
  },
  errorText: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeights.subtitle,
    lineHeight: 16
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
  rowUnavailable: {
    opacity: 0.62
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
  rowPath: {
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
