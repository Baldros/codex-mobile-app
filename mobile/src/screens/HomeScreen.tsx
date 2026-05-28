import { router } from "expo-router";
import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderGit2,
  Gauge,
  ListTree,
  Menu,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  Settings,
  Square,
  Terminal,
  X,
  Zap
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconAction } from "../components/IconAction";
import { Screen } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import {
  effortsForModel,
  fastTierOptionsForModel,
  isServiceTierAvailable,
  type FastTierOption
} from "../domain/composerOptions";
import type { ChatMessage, CodexModel, PendingApproval, ReasoningEffort } from "../domain/bridge";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { fontWeights } from "../theme/typography";
import { compactPath } from "../utils/format";

type MenuPanel = "main" | "models" | "effort" | "fast";

export function HomeScreen() {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const selectedModel = useMemo(
    () => bridge.models.find((model) => model.id === bridge.selectedModelId) ?? null,
    [bridge.models, bridge.selectedModelId]
  );
  const canSend = draft.trim().length > 0 && !bridge.isRunning && Boolean(bridge.selectedWorkspace);

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={styles.keyboard}
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.appTitle}>Codex Mobile</Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {bridge.selectedWorkspace ? compactPath(bridge.selectedWorkspace.path) : "No repository"}
            </Text>
          </View>
          <StatusPill
            label={bridge.health?.codex_ready ? "online" : "offline"}
            tone={bridge.health?.codex_ready ? "ok" : bridge.error ? "error" : "warn"}
          />
          <IconAction icon={FolderGit2} label="Repositories" onPress={() => router.push("/repositories")} />
          <IconAction icon={RefreshCcw} label="Refresh" onPress={() => void bridge.refreshAll()} />
          <IconAction icon={Settings} label="Settings" onPress={() => router.push("/settings")} />
        </View>

        {bridge.error ? (
          <View style={styles.errorBand}>
            <Text numberOfLines={2} style={styles.errorText}>
              {bridge.error}
            </Text>
          </View>
        ) : null}

        <View style={styles.threadBar}>
          <Pressable style={styles.threadButton} onPress={() => router.push("/conversations")}>
            <ListTree size={18} color={colors.text} />
            <View style={styles.threadTextWrap}>
              <Text numberOfLines={1} style={styles.threadTitle}>
                {bridge.selectedThread?.title ?? "New conversation"}
              </Text>
              <Text numberOfLines={1} style={styles.threadSubtitle}>
                {bridge.threads.length} conversations in this repository
              </Text>
            </View>
          </Pressable>
          <IconAction icon={MessageSquarePlus} label="New conversation" onPress={() => void bridge.createNewThread()} />
        </View>

        {bridge.activities.length > 0 ? (
          <View style={styles.activityRail}>
            <Terminal size={15} color={colors.textMuted} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {bridge.activities.map((activity) => (
                <View key={activity.id} style={styles.activityItem}>
                  <Text numberOfLines={1} style={styles.activityTitle}>
                    {activity.title}
                  </Text>
                  {activity.detail ? (
                    <Text numberOfLines={1} style={styles.activityDetail}>
                      {activity.detail}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {bridge.pendingApprovals.map((approval) => (
          <ApprovalPanel key={approval.approval_id} approval={approval} />
        ))}

        <FlatList
          data={bridge.messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          style={styles.messages}
          ListEmptyComponent={<EmptyChat />}
        />

        <View style={[styles.composer, { paddingBottom: spacing.md + insets.bottom }]}>
          <ComposerMenu selectedModel={selectedModel} />
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Message Codex"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
          />
          {bridge.isRunning ? (
            <IconAction icon={Square} label="Cancel" variant="danger" onPress={() => void bridge.cancelRun()} />
          ) : (
            <IconAction
              icon={Send}
              label="Send"
              variant="filled"
              disabled={!canSend}
              onPress={() => {
                const value = draft;
                setDraft("");
                void bridge.sendMessage(value);
              }}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ComposerMenu({ selectedModel }: { selectedModel: CodexModel | null }) {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [panel, setPanel] = useState<MenuPanel>("main");
  const efforts = effortsForModel(selectedModel);
  const fastTiers = fastTierOptionsForModel(selectedModel);
  const currentFastTier = fastTiers.find((tier) => tier.id === bridge.serviceTier) ?? null;
  const fastEnabled = fastTiers.length > 0;

  const close = () => {
    setVisible(false);
    setPanel("main");
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Composer options"
        onPress={() => setVisible(true)}
        style={({ pressed }) => [styles.composerMenuButton, pressed && styles.composerMenuButtonPressed]}
      >
        <Menu size={21} color={colors.text} />
      </Pressable>

      <Modal transparent visible={visible} animationType="fade" onRequestClose={close}>
        <Pressable style={[styles.menuOverlay, { paddingBottom: spacing.lg + insets.bottom }]} onPress={close}>
          <Pressable style={styles.menuPanel} onPress={(event) => event.stopPropagation()}>
            <View style={styles.menuHeader}>
              {panel === "main" ? (
                <View style={styles.menuTitleIcon}>
                  <Menu size={18} color={colors.text} />
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  onPress={() => setPanel("main")}
                  style={styles.menuBackButton}
                >
                  <ChevronLeft size={20} color={colors.text} />
                </Pressable>
              )}
              <Text style={styles.menuTitle}>{panelTitle(panel)}</Text>
              <IconAction icon={X} label="Close menu" onPress={close} />
            </View>

            {panel === "main" ? (
              <View style={styles.menuItems}>
                <MenuItem
                  icon={<Bot size={18} color={colors.textMuted} />}
                  label="Models"
                  detail={selectedModel?.displayName ?? bridge.selectedModelId ?? "Default"}
                  onPress={() => setPanel("models")}
                  showChevron
                />
                <MenuItem
                  icon={<Gauge size={18} color={colors.textMuted} />}
                  label="Effort"
                  detail={bridge.reasoningEffort}
                  onPress={() => setPanel("effort")}
                  showChevron
                />
                <MenuItem
                  icon={<Zap size={18} color={fastEnabled ? colors.textMuted : colors.textSubtle} />}
                  label="Fast"
                  detail={currentFastTier?.label ?? (fastEnabled ? "Off" : "Unavailable")}
                  disabled={!fastEnabled}
                  onPress={() => setPanel("fast")}
                  showChevron
                />
                <MenuItem
                  icon={<ListTree size={18} color={colors.textSubtle} />}
                  label="Plan"
                  detail="Unavailable"
                  disabled
                  onPress={() => undefined}
                />
              </View>
            ) : null}

            {panel === "models" ? (
              <ScrollView style={styles.optionList}>
                {bridge.models.map((model) => (
                  <SelectableItem
                    key={model.id}
                    label={model.displayName ?? model.id}
                    detail={model.defaultReasoningEffort ?? model.description ?? model.model}
                    selected={bridge.selectedModelId === model.id}
                    onPress={() => {
                      bridge.setSelectedModelId(model.id);
                      if (!isServiceTierAvailable(model, bridge.serviceTier)) {
                        bridge.setServiceTier(null);
                      }
                      close();
                    }}
                  />
                ))}
              </ScrollView>
            ) : null}

            {panel === "effort" ? (
              <View style={styles.menuItems}>
                {efforts.map((effort) => (
                  <SelectableItem
                    key={effort}
                    label={effort}
                    selected={bridge.reasoningEffort === effort}
                    onPress={() => {
                      bridge.setReasoningEffort(effort as ReasoningEffort);
                      close();
                    }}
                  />
                ))}
              </View>
            ) : null}

            {panel === "fast" ? (
              <View style={styles.menuItems}>
                <SelectableItem
                  label="Off"
                  detail="Use the model default tier"
                  selected={!bridge.serviceTier}
                  onPress={() => {
                    bridge.setServiceTier(null);
                    close();
                  }}
                />
                {fastTiers.length > 0 ? (
                  fastTiers.map((tier) => (
                    <FastTierItem
                      key={tier.id}
                      tier={tier}
                      selected={bridge.serviceTier === tier.id}
                      onPress={() => {
                        bridge.setServiceTier(tier.id);
                        close();
                      }}
                    />
                  ))
                ) : (
                  <SelectableItem label="No speed tiers" detail="Unavailable for this model" disabled />
                )}
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({
  icon,
  label,
  detail,
  disabled = false,
  showChevron = false,
  onPress
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string | null | undefined;
  disabled?: boolean;
  showChevron?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        disabled && styles.menuItemDisabled,
        pressed && !disabled && styles.menuItemPressed
      ]}
    >
      {icon}
      <View style={styles.menuItemText}>
        <Text style={[styles.menuItemLabel, disabled && styles.mutedText]}>{label}</Text>
        {detail ? (
          <Text numberOfLines={1} style={[styles.menuItemDetail, disabled && styles.mutedText]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {showChevron ? <ChevronRight size={18} color={disabled ? colors.textSubtle : colors.textMuted} /> : null}
    </Pressable>
  );
}

function SelectableItem({
  label,
  detail,
  selected = false,
  disabled = false,
  onPress = () => undefined
}: {
  label: string;
  detail?: string | null | undefined;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.selectable,
        selected && styles.selectableActive,
        disabled && styles.menuItemDisabled,
        pressed && !disabled && styles.menuItemPressed
      ]}
    >
      <View style={styles.menuItemText}>
        <Text numberOfLines={1} style={[styles.selectableLabel, selected && styles.selectableLabelActive]}>
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={styles.menuItemDetail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Check size={18} color={colors.accent} /> : null}
    </Pressable>
  );
}

function FastTierItem({
  tier,
  selected,
  onPress
}: {
  tier: FastTierOption;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <SelectableItem
      label={tier.label}
      detail={tier.description ?? tier.id}
      selected={selected}
      disabled={!tier.available}
      onPress={onPress}
    />
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageRole, isUser && styles.userRole]}>
          {isUser ? "You" : "Codex"}
          {message.pending ? " ." : ""}
        </Text>
        <Text style={[styles.messageText, isUser && styles.userText]}>
          {message.text || "Working..."}
        </Text>
      </View>
    </View>
  );
}

function ApprovalPanel({ approval }: { approval: PendingApproval }) {
  const bridge = useBridge();
  const decisions = approval.available_decisions ?? ["accept", "decline", "cancel"];

  return (
    <View style={styles.approvalPanel}>
      <Text style={styles.approvalTitle}>Approval pending</Text>
      <Text numberOfLines={2} style={styles.approvalDetail}>
        {Array.isArray(approval.command) ? approval.command.join(" ") : approval.command ?? approval.reason ?? approval.method}
      </Text>
      <View style={styles.approvalActions}>
        {decisions.map((decision) => (
          <Pressable
            key={decision}
            onPress={() => void bridge.respondApproval(approval, decision)}
            style={[
              styles.approvalButton,
              decision.startsWith("accept") ? styles.approvalAccept : styles.approvalDecline
            ]}
          >
            <Text
              style={[
                styles.approvalButtonText,
                decision.startsWith("accept") ? styles.approvalAcceptText : styles.approvalDeclineText
              ]}
            >
              {decision}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function EmptyChat() {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Ready</Text>
      <Text style={styles.emptyText}>Choose a repository and start a conversation.</Text>
    </View>
  );
}

function panelTitle(panel: MenuPanel) {
  switch (panel) {
    case "models":
      return "Models";
    case "effort":
      return "Effort";
    case "fast":
      return "Fast";
    default:
      return "Options";
  }
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1
  },
  header: {
    minHeight: 68,
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
  appTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: fontWeights.title,
    letterSpacing: 0
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  errorBand: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  threadBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  threadButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  threadTextWrap: {
    flex: 1,
    minWidth: 0
  },
  threadTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  threadSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  activityRail: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  activityItem: {
    maxWidth: 190,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginRight: spacing.sm
  },
  activityTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  activityDetail: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  approvalPanel: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    padding: spacing.md
  },
  approvalTitle: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  approvalDetail: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.body,
    marginTop: 4
  },
  approvalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  approvalButton: {
    minHeight: 34,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    justifyContent: "center"
  },
  approvalAccept: {
    backgroundColor: colors.success
  },
  approvalDecline: {
    backgroundColor: colors.surface
  },
  approvalButtonText: {
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  approvalAcceptText: {
    color: "#FFFFFF"
  },
  approvalDeclineText: {
    color: colors.text
  },
  messages: {
    flex: 1
  },
  messageList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    flexGrow: 1
  },
  messageRow: {
    flexDirection: "row"
  },
  messageRowUser: {
    justifyContent: "flex-end"
  },
  messageBubble: {
    maxWidth: "88%",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1
  },
  userBubble: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  messageRole: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.action,
    marginBottom: 4
  },
  userRole: {
    color: "#DCEFF3"
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.body,
    lineHeight: 21
  },
  userText: {
    color: "#FFFFFF"
  },
  empty: {
    flex: 1,
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: fontWeights.title
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: fontWeights.body,
    marginTop: 6,
    textAlign: "center"
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm
  },
  composerMenuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    alignItems: "center",
    justifyContent: "center"
  },
  composerMenuButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }]
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 118,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.body,
    lineHeight: 20
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.26)",
    justifyContent: "flex-end",
    padding: spacing.lg
  },
  menuPanel: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    padding: spacing.md,
    gap: spacing.md,
    maxHeight: "72%"
  },
  menuHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  menuTitleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  menuBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  menuTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: fontWeights.title
  },
  menuItems: {
    gap: spacing.sm
  },
  optionList: {
    maxHeight: 360
  },
  menuItem: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  menuItemDisabled: {
    opacity: 0.42
  },
  menuItemPressed: {
    opacity: 0.82
  },
  menuItemText: {
    flex: 1,
    minWidth: 0
  },
  menuItemLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  menuItemDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  mutedText: {
    color: colors.textSubtle
  },
  selectable: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  selectableActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  selectableLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.subtitle
  },
  selectableLabelActive: {
    color: colors.accent,
    fontWeight: fontWeights.action
  }
});
