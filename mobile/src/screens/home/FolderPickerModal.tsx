import {
  ChevronLeft,
  ChevronRight,
  Folder,
  FolderGit2,
  FolderPlus,
  HardDrive,
  X
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconAction } from "../../components/IconAction";
import type { DirectoryChildrenResponse, DirectoryEntry } from "../../domain/bridge";
import { useBridge } from "../../state/BridgeProvider";
import { colors, radii, spacing } from "../../theme/colors";
import { fontWeights } from "../../theme/typography";
import { compactPath } from "../../utils/format";
import { errorMessage } from "../../utils/value";

type FolderPickerModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function FolderPickerModal({ visible, onClose }: FolderPickerModalProps) {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [roots, setRoots] = useState<DirectoryEntry[]>([]);
  const [directory, setDirectory] = useState<DirectoryChildrenResponse | null>(null);
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [manualPath, setManualPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const canAdd = bridge.capabilities.workspaces.add === true;
  const currentItems = currentPath ? directory?.children ?? [] : roots;

  useEffect(() => {
    if (!visible) {
      return;
    }

    setManualPath("");
    setAddError(null);
    void loadRoots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const loadRoots = async () => {
    setCurrentPath(null);
    setDirectory(null);
    setLoading(true);
    setError(null);

    try {
      const response = await bridge.listFilesystemRoots();
      setRoots(response.data);
    } catch (caught) {
      setRoots([]);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const loadChildren = async (path: string) => {
    setCurrentPath(path);
    setLoading(true);
    setError(null);

    try {
      const response = await bridge.listDirectoryChildren(path);
      setDirectory(response);
      setCurrentPath(response.path);
    } catch (caught) {
      setDirectory(null);
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const addFolder = async (path: string) => {
    const cleanPath = path.trim();
    if (!cleanPath || !canAdd || adding) {
      return;
    }

    setAdding(true);
    setAddError(null);
    const result = await bridge.addWorkspace(cleanPath, { select: true });
    setAdding(false);

    if (!result) {
      setAddError("Could not add folder.");
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

    onClose();
  };

  const handleBack = () => {
    if (!currentPath) {
      onClose();
      return;
    }
    if (directory?.parent) {
      void loadChildren(directory.parent);
      return;
    }
    void loadRoots();
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <Pressable
          style={[pickerStyles.panel, { marginBottom: insets.bottom + spacing.md }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={pickerStyles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={currentPath ? "Back" : "Close folder picker"}
              onPress={handleBack}
              style={pickerStyles.headerIcon}
            >
              {currentPath ? (
                <ChevronLeft size={20} color={colors.text} />
              ) : (
                <HardDrive size={19} color={colors.text} />
              )}
            </Pressable>
            <View style={pickerStyles.titleWrap}>
              <Text style={pickerStyles.title}>Add folder</Text>
              <Text numberOfLines={1} style={pickerStyles.pathText}>
                {currentPath ? compactPath(currentPath, 64) : "Local disks"}
              </Text>
            </View>
            <IconAction icon={X} label="Close folder picker" onPress={onClose} />
          </View>

          <View style={pickerStyles.pathBand}>
            <Text numberOfLines={1} style={pickerStyles.pathBandText}>
              {currentPath ? currentPath : "Local disks"}
            </Text>
            <IconAction
              icon={FolderPlus}
              label="Add selected folder"
              variant="filled"
              disabled={!currentPath || !canAdd || adding}
              onPress={() => {
                if (currentPath) {
                  void addFolder(currentPath);
                }
              }}
            />
          </View>

          {error ? (
            <View style={pickerStyles.errorBand}>
              <Text numberOfLines={2} style={pickerStyles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          {loading ? (
            <View style={pickerStyles.loading}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <FlatList
              data={currentItems}
              keyExtractor={(item) => item.path}
              style={pickerStyles.list}
              contentContainerStyle={pickerStyles.listContent}
              renderItem={({ item }) => (
                <FolderRow
                  item={item}
                  root={!currentPath}
                  onPress={() => void loadChildren(item.path)}
                />
              )}
              ListEmptyComponent={
                <View style={pickerStyles.empty}>
                  <Text style={pickerStyles.emptyText}>No folders</Text>
                </View>
              }
            />
          )}

          {directory?.truncated ? (
            <Text numberOfLines={1} style={pickerStyles.truncatedText}>
              Showing first 300 folders
            </Text>
          ) : null}

          <View style={pickerStyles.footer}>
            <TextInput
              value={manualPath}
              autoCapitalize="none"
              autoCorrect={false}
              editable={canAdd && !adding}
              onChangeText={(value) => {
                setManualPath(value);
                if (addError) {
                  setAddError(null);
                }
              }}
              onSubmitEditing={() => void addFolder(manualPath)}
              placeholder="Paste path"
              placeholderTextColor={colors.textSubtle}
              returnKeyType="done"
              style={[pickerStyles.manualInput, !canAdd && pickerStyles.disabled]}
            />
            <IconAction
              icon={FolderPlus}
              label="Add pasted path"
              variant="filled"
              disabled={!manualPath.trim() || !canAdd || adding}
              onPress={() => void addFolder(manualPath)}
            />
          </View>
          {!canAdd ? (
            <Text numberOfLines={1} style={pickerStyles.footerStatus}>
              Allowlist is read-only
            </Text>
          ) : null}
          {addError ? (
            <Text numberOfLines={2} style={pickerStyles.footerError}>
              {addError}
            </Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function FolderRow({
  item,
  root,
  onPress
}: {
  item: DirectoryEntry;
  root: boolean;
  onPress: () => void;
}) {
  const Icon = root ? HardDrive : item.is_git_repo ? FolderGit2 : Folder;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pickerStyles.folderRow, pressed && pickerStyles.pressed]}
    >
      <View style={pickerStyles.folderIcon}>
        <Icon size={18} color={item.is_git_repo ? colors.accent : colors.textMuted} />
      </View>
      <View style={pickerStyles.folderText}>
        <Text numberOfLines={1} style={pickerStyles.folderName}>
          {item.name}
        </Text>
        {item.is_git_repo ? (
          <Text numberOfLines={1} style={pickerStyles.folderMeta}>
            Git repository
          </Text>
        ) : null}
      </View>
      <ChevronRight size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.34)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  panel: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 560,
    maxHeight: "84%",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm
  },
  header: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  titleWrap: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: fontWeights.title
  },
  pathText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  pathBand: {
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingLeft: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  pathBandText: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  errorBand: {
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeights.subtitle,
    lineHeight: 17
  },
  loading: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center"
  },
  list: {
    flexGrow: 0,
    maxHeight: 360
  },
  listContent: {
    gap: spacing.sm,
    paddingVertical: spacing.xs
  },
  folderRow: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  folderIcon: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface
  },
  folderText: {
    flex: 1,
    minWidth: 0
  },
  folderName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  folderMeta: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  pressed: {
    opacity: 0.82
  },
  empty: {
    minHeight: 180,
    justifyContent: "center",
    alignItems: "center"
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  truncatedText: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: fontWeights.body
  },
  footer: {
    minHeight: 44,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  manualInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.body
  },
  disabled: {
    opacity: 0.52
  },
  footerStatus: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: fontWeights.body
  },
  footerError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeights.subtitle,
    lineHeight: 16
  }
});
