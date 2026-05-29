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
  ShieldCheck,
  Settings,
  Square,
  Terminal,
  X,
  Zap
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { MarkdownText } from "../components/MarkdownText";
import { Screen } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import {
  effortsForModel,
  fastTierOptionsForModel,
  isServiceTierAvailable,
  type FastTierOption
} from "../domain/composerOptions";
import type {
  ChatMessage,
  ChatMessagePart,
  CodexAccountResponse,
  CodexModel,
  PendingApproval,
  RateLimitSnapshot,
  RateLimitWindow,
  ReasoningEffort
} from "../domain/bridge";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { fontWeights } from "../theme/typography";
import { compactPath } from "../utils/format";

type MenuPanel = "main" | "models" | "effort" | "fast";

export function HomeScreen() {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [limitsVisible, setLimitsVisible] = useState(false);
  const messageListRef = useRef<FlatList<ChatMessage> | null>(null);
  const selectedModel = useMemo(
    () => bridge.models.find((model) => model.id === bridge.selectedModelId) ?? null,
    [bridge.models, bridge.selectedModelId]
  );
  const canSend = draft.trim().length > 0 && !bridge.isRunning && Boolean(bridge.selectedWorkspace);
  const composerBottomPadding = spacing.md + insets.bottom;
  const latestMessageMarker = useMemo(() => {
    const last = bridge.messages[bridge.messages.length - 1];
    if (!last) {
      return "empty";
    }
    const partMarker = last.parts
      ?.map((part) => {
        if (part.type === "text") {
          return `${part.id}:${part.text.length}:${part.pending ? "p" : "d"}`;
        }
        if (part.type === "activity") {
          return `${part.id}:${part.status}:${part.detail ?? ""}:${part.output?.length ?? 0}`;
        }
        return `${part.id}:${part.status}:${part.decision ?? ""}`;
      })
      .join("|");
    return `${last.id}:${last.text.length}:${last.pending ? "p" : "d"}:${partMarker ?? ""}`;
  }, [bridge.messages]);

  useEffect(() => {
    if (bridge.messages.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [bridge.messages.length, latestMessageMarker]);

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

        <LimitsModal visible={limitsVisible} onClose={() => setLimitsVisible(false)} />

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

        <FlatList
          ref={messageListRef}
          data={bridge.messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              onRespondApproval={(approval, decision) => void bridge.respondApproval(approval, decision)}
            />
          )}
          contentContainerStyle={styles.messageList}
          style={styles.messages}
          ListEmptyComponent={
            <EmptyChat
              isLoading={bridge.isLoadingThreadContent}
              hasSelectedThread={Boolean(bridge.selectedThread)}
              hasWorkspace={Boolean(bridge.selectedWorkspace)}
            />
          }
        />

        <View style={[styles.composer, { paddingBottom: composerBottomPadding }]}>
          <ComposerMenu
            selectedModel={selectedModel}
            onOpenLimits={() => {
              setLimitsVisible(true);
              void bridge.refreshAccount();
            }}
          />
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

function ComposerMenu({
  selectedModel,
  onOpenLimits
}: {
  selectedModel: CodexModel | null;
  onOpenLimits: () => void;
}) {
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
                  icon={<ShieldCheck size={18} color={colors.textMuted} />}
                  label="Limits"
                  detail={limitsMenuDetail(bridge)}
                  onPress={() => {
                    close();
                    onOpenLimits();
                  }}
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

function LimitsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const limits = getCodexLimits(bridge.account);
  const account = bridge.account?.account ?? null;
  const planType = limits?.planType ?? account?.planType ?? null;
  const subtitle = [account?.email, planType ? planTypeLabel(planType) : null]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
  const credits = limits?.credits ?? null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.limitsOverlay, { paddingTop: spacing.lg + insets.top, paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.limitsPanel}>
          <View style={styles.limitsHeader}>
            <View style={styles.limitsTitleWrap}>
              <Text style={styles.limitsTitle}>Limits</Text>
              <Text numberOfLines={1} style={styles.limitsSubtitle}>
                {subtitle || "Codex account"}
              </Text>
            </View>
            <IconAction
              icon={RefreshCcw}
              label="Refresh limits"
              disabled={bridge.isRefreshingAccount}
              onPress={() => void bridge.refreshAccount()}
            />
            <IconAction icon={X} label="Close limits" onPress={onClose} />
          </View>

          {bridge.isRefreshingAccount ? (
            <View style={styles.limitsLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.limitsLoadingText}>Refreshing limits...</Text>
            </View>
          ) : null}

          {bridge.accountError ? (
            <View style={styles.limitsError}>
              <Text style={styles.limitsErrorText}>{bridge.accountError}</Text>
            </View>
          ) : null}

          {limits ? (
            <View style={styles.limitMeters}>
              <LimitMeter label="5h" limitWindow={limits.primary} />
              <LimitMeter label="Weekly" limitWindow={limits.secondary} />
            </View>
          ) : bridge.isRefreshingAccount ? null : (
            <View style={styles.limitsEmpty}>
              <Text style={styles.limitsEmptyTitle}>Limits unavailable</Text>
              <Text style={styles.limitsEmptyText}>
                The bridge has not received rate limit data for this account yet.
              </Text>
            </View>
          )}

          {credits ? (
            <View style={styles.creditsRow}>
              <Text style={styles.creditsLabel}>Credits</Text>
              <Text style={styles.creditsValue}>{creditsLabel(credits)}</Text>
            </View>
          ) : null}

          {limits?.rateLimitReachedType ? (
            <View style={styles.limitReached}>
              <Text style={styles.limitReachedText}>{limitReachedLabel(limits.rateLimitReachedType)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function LimitMeter({ label, limitWindow }: { label: string; limitWindow: RateLimitWindow | null }) {
  if (!limitWindow) {
    return (
      <View style={styles.limitMeter}>
        <View style={styles.limitMeterHeader}>
          <Text style={styles.limitMeterTitle}>{label}</Text>
          <Text style={styles.limitUnavailable}>No data</Text>
        </View>
      </View>
    );
  }

  const usedPercent = clampPercent(limitWindow.usedPercent);
  const remainingPercent = Math.max(0, 100 - usedPercent);

  return (
    <View style={styles.limitMeter}>
      <View style={styles.limitMeterHeader}>
        <View>
          <Text style={styles.limitMeterTitle}>{label}</Text>
          <Text style={styles.limitMeterSubtitle}>{windowDurationLabel(limitWindow.windowDurationMins)}</Text>
        </View>
        <View style={styles.limitPercentWrap}>
          <Text style={styles.limitRemaining}>{formatPercent(remainingPercent)} available</Text>
          <Text style={styles.limitUsed}>{formatPercent(usedPercent)} used</Text>
        </View>
      </View>
      <View style={styles.limitBarTrack}>
        <View style={[styles.limitBarFill, { width: `${usedPercent}%` }]} />
      </View>
      <Text style={styles.limitReset}>{resetLabel(limitWindow.resetsAt)}</Text>
    </View>
  );
}

function MessageBubble({
  message,
  onRespondApproval
}: {
  message: ChatMessage;
  onRespondApproval: (approval: PendingApproval, decision: string) => void;
}) {
  const isUser = message.role === "user";
  const parts = messageParts(message);

  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageRole, isUser && styles.userRole]}>
          {isUser ? "You" : "Codex"}
          {message.pending ? " ." : ""}
        </Text>
        {isUser ? (
          <MarkdownText text={message.text} variant="inverted" />
        ) : parts.length > 0 ? (
          <View style={styles.messageParts}>
            {parts.map((part, index) => (
              <MessagePart
                key={part.id}
                part={part}
                isFirst={index === 0}
                onRespondApproval={onRespondApproval}
              />
            ))}
          </View>
        ) : (
          <View style={styles.workingRow}>
            <ActivityIndicator color={colors.accent} size="small" />
            <Text style={styles.workingText}>Working...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MessagePart({
  part,
  isFirst,
  onRespondApproval
}: {
  part: ChatMessagePart;
  isFirst: boolean;
  onRespondApproval: (approval: PendingApproval, decision: string) => void;
}) {
  if (part.type === "text") {
    const text = part.text || (part.pending ? "Working..." : "");
    return (
      <MarkdownText text={text} containerStyle={!isFirst && styles.messagePartSpacing} />
    );
  }

  if (part.type === "approval") {
    return (
      <ApprovalTimelinePart
        part={part}
        isFirst={isFirst}
        onRespondApproval={onRespondApproval}
      />
    );
  }

  return <ActivityTimelinePart part={part} isFirst={isFirst} />;
}

function ActivityTimelinePart({
  part,
  isFirst
}: {
  part: Extract<ChatMessagePart, { type: "activity" }>;
  isFirst: boolean;
}) {
  const tone = activityTone(part.status);

  return (
    <View style={[styles.timelineRow, !isFirst && styles.messagePartSpacing]}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineNode, { backgroundColor: tone.color }]} />
      </View>
      <View style={[styles.timelineCard, { borderColor: tone.border, backgroundColor: tone.background }]}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineTitleWrap}>
            <Terminal size={14} color={tone.color} />
            <Text numberOfLines={1} style={styles.timelineTitle}>
              {part.title}
            </Text>
          </View>
          <View style={[styles.timelineStatus, { backgroundColor: tone.pill }]}>
            {part.status === "running" ? <ActivityIndicator color={tone.color} size="small" /> : null}
            {part.status === "done" ? <Check size={12} color={tone.color} /> : null}
            {part.status === "failed" ? <X size={12} color={tone.color} /> : null}
            <Text style={[styles.timelineStatusText, { color: tone.color }]}>{tone.label}</Text>
          </View>
        </View>
        {part.detail ? (
          <Text numberOfLines={3} style={styles.timelineDetail}>
            {part.detail}
          </Text>
        ) : null}
        {part.output ? (
          <Text numberOfLines={4} style={styles.timelineOutput}>
            {part.output}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ApprovalTimelinePart({
  part,
  isFirst,
  onRespondApproval
}: {
  part: Extract<ChatMessagePart, { type: "approval" }>;
  isFirst: boolean;
  onRespondApproval: (approval: PendingApproval, decision: string) => void;
}) {
  const approval = part.approval;
  const decisions = approval.available_decisions ?? ["accept", "decline", "cancel"];
  const isPending = part.status === "pending";

  return (
    <View style={[styles.timelineRow, !isFirst && styles.messagePartSpacing]}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineNode, { backgroundColor: colors.warning }]} />
      </View>
      <View style={[styles.timelineCard, styles.approvalTimelineCard]}>
        <View style={styles.timelineHeader}>
          <View style={styles.timelineTitleWrap}>
            <ShieldCheck size={14} color={colors.warning} />
            <Text style={styles.timelineTitle}>Approval</Text>
          </View>
          <View style={styles.approvalPendingPill}>
            <Text style={styles.approvalPendingText}>
              {isPending ? "Pending" : part.decision ?? "Answered"}
            </Text>
          </View>
        </View>
        <Text numberOfLines={3} style={styles.timelineDetail}>
          {approvalDetail(approval)}
        </Text>
        {isPending ? (
          <View style={styles.approvalActions}>
            {decisions.map((decision) => (
              <Pressable
                key={decision}
                onPress={() => onRespondApproval(approval, decision)}
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
        ) : null}
      </View>
    </View>
  );
}

function EmptyChat({
  isLoading,
  hasSelectedThread,
  hasWorkspace
}: {
  isLoading: boolean;
  hasSelectedThread: boolean;
  hasWorkspace: boolean;
}) {
  const title = isLoading ? "Loading conversation" : hasSelectedThread ? "No readable messages" : "New conversation";
  const text = isLoading
    ? "Fetching this thread history."
    : hasSelectedThread
      ? "This thread opened, but no text turns were returned by the bridge."
      : hasWorkspace
        ? "Send a message to create this conversation."
        : "Choose a repository and start a conversation.";

  return (
    <View style={styles.empty}>
      {isLoading ? <ActivityIndicator color={colors.accent} /> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

function messageParts(message: ChatMessage): ChatMessagePart[] {
  if (message.parts && message.parts.length > 0) {
    return message.parts;
  }
  if (message.text.trim()) {
    return [
      {
        id: `${message.id}_text`,
        type: "text",
        text: message.text,
        ...(message.pending !== undefined ? { pending: message.pending } : {})
      }
    ];
  }
  return [];
}

function activityTone(status: Extract<ChatMessagePart, { type: "activity" }>["status"]) {
  if (status === "running") {
    return {
      color: colors.warning,
      border: "rgba(183, 110, 0, 0.22)",
      background: "rgba(255, 243, 214, 0.72)",
      pill: "rgba(183, 110, 0, 0.10)",
      label: "Running"
    };
  }
  if (status === "failed") {
    return {
      color: colors.danger,
      border: "rgba(180, 35, 24, 0.22)",
      background: colors.dangerSoft,
      pill: "rgba(180, 35, 24, 0.10)",
      label: "Failed"
    };
  }
  if (status === "done") {
    return {
      color: colors.success,
      border: "rgba(31, 122, 77, 0.20)",
      background: colors.successSoft,
      pill: "rgba(31, 122, 77, 0.10)",
      label: "Done"
    };
  }
  return {
    color: colors.accent,
    border: "rgba(23, 107, 135, 0.18)",
    background: colors.accentSoft,
    pill: "rgba(23, 107, 135, 0.10)",
    label: "Info"
  };
}

function approvalDetail(approval: PendingApproval) {
  if (approval.command) {
    return Array.isArray(approval.command) ? approval.command.join(" ") : approval.command;
  }
  return approval.reason ?? approval.method ?? approval.approval_type ?? "Approval requested";
}

function limitsMenuDetail(bridge: {
  account: CodexAccountResponse | null;
  accountError: string | null;
  isRefreshingAccount: boolean;
}) {
  if (bridge.isRefreshingAccount) {
    return "Refreshing";
  }
  if (bridge.accountError) {
    return "Needs attention";
  }
  const limits = getCodexLimits(bridge.account);
  const planType = limits?.planType ?? bridge.account?.account?.planType;
  return planType ? planTypeLabel(planType) : "Usage and credits";
}

function getCodexLimits(account: CodexAccountResponse | null): RateLimitSnapshot | null {
  return account?.rateLimits?.rateLimitsByLimitId?.codex ?? account?.rateLimits?.rateLimits ?? null;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatPercent(value: number) {
  return `${clampPercent(value)}%`;
}

function windowDurationLabel(minutes: number | null) {
  if (minutes === 300) {
    return "5h window";
  }
  if (minutes === 10080) {
    return "Weekly window";
  }
  if (!minutes) {
    return "Current window";
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h window`;
  }
  return `${minutes} min window`;
}

function resetLabel(resetsAt: number | null) {
  if (!resetsAt) {
    return "Reset not reported";
  }

  const milliseconds = resetsAt > 10_000_000_000 ? resetsAt : resetsAt * 1000;
  const formatted = new Date(milliseconds).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `Reset ${formatted}`;
}

function planTypeLabel(planType: string) {
  return planType.replace(/_/g, " ");
}

function creditsLabel(credits: NonNullable<RateLimitSnapshot["credits"]>) {
  if (credits.unlimited) {
    return "Unlimited";
  }
  if (credits.balance) {
    return credits.balance;
  }
  return credits.hasCredits ? "Active" : "Unavailable";
}

function limitReachedLabel(rateLimitReachedType: string) {
  return rateLimitReachedType.replace(/_/g, " ");
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
  messageParts: {
    gap: spacing.sm
  },
  messagePartSpacing: {
    marginTop: spacing.xs
  },
  workingRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  workingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm
  },
  timelineRail: {
    width: 14,
    alignItems: "center",
    paddingTop: 11
  },
  timelineNode: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  timelineCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  timelineHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  timelineTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  timelineTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  timelineStatus: {
    minHeight: 24,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  timelineStatusText: {
    fontSize: 10,
    fontWeight: fontWeights.action
  },
  timelineDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    lineHeight: 17,
    marginTop: spacing.xs
  },
  timelineOutput: {
    color: colors.code,
    fontSize: 11,
    fontWeight: fontWeights.body,
    lineHeight: 16,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.64)"
  },
  approvalTimelineCard: {
    borderColor: "rgba(183, 110, 0, 0.24)",
    backgroundColor: colors.warningSoft
  },
  approvalPendingPill: {
    minHeight: 24,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    backgroundColor: "rgba(183, 110, 0, 0.10)"
  },
  approvalPendingText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: fontWeights.action
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
  limitsOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.38)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  limitsPanel: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  limitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  limitsTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  limitsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: fontWeights.title
  },
  limitsSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  limitsLoading: {
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  limitsLoadingText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  limitsError: {
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md
  },
  limitsErrorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  limitMeters: {
    gap: spacing.sm
  },
  limitMeter: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md
  },
  limitMeterHeader: {
    minHeight: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  limitMeterTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: fontWeights.action
  },
  limitMeterSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  limitPercentWrap: {
    alignItems: "flex-end"
  },
  limitRemaining: {
    color: colors.success,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  limitUsed: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  limitBarTrack: {
    height: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    marginTop: spacing.md
  },
  limitBarFill: {
    height: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.accent
  },
  limitReset: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: spacing.sm
  },
  limitUnavailable: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  limitsEmpty: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  limitsEmptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  limitsEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.body,
    marginTop: 4,
    lineHeight: 18
  },
  creditsRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  creditsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.label,
    textTransform: "uppercase"
  },
  creditsValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  limitReached: {
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
    padding: spacing.md
  },
  limitReachedText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: fontWeights.action
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
