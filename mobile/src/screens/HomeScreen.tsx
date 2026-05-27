import { router } from "expo-router";
import {
  Bot,
  FolderGit2,
  Gauge,
  ListTree,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Settings,
  Square,
  Terminal,
  X
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
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

import { IconAction } from "../components/IconAction";
import { PillButton } from "../components/PillButton";
import { Screen } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import type {
  ChatMessage,
  CodexAccountResponse,
  PendingApproval,
  RateLimitSnapshot,
  RateLimitWindow
} from "../domain/bridge";
import { EXECUTION_PRESETS, executionDetail, findExecutionPreset } from "../domain/executionModes";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { compactPath } from "../utils/format";

const fallbackEfforts = ["low", "medium", "high", "xhigh"] as const;

export function HomeScreen() {
  const bridge = useBridge();
  const [draft, setDraft] = useState("");
  const [limitsVisible, setLimitsVisible] = useState(false);
  const selectedModel = useMemo(
    () => bridge.models.find((model) => model.id === bridge.selectedModelId) ?? null,
    [bridge.models, bridge.selectedModelId]
  );
  const effortOptions = selectedModel?.supportedReasoningEfforts?.map((item) => item.reasoningEffort);
  const efforts = effortOptions && effortOptions.length > 0 ? effortOptions : [...fallbackEfforts];
  const activeExecutionPreset = findExecutionPreset({
    sandboxMode: bridge.sandboxMode,
    approvalPolicy: bridge.approvalPolicy,
    networkAccessEnabled: bridge.networkAccessEnabled
  });
  const currentExecutionDetail =
    activeExecutionPreset?.detail ??
    executionDetail({
      sandboxMode: bridge.sandboxMode,
      approvalPolicy: bridge.approvalPolicy,
      networkAccessEnabled: bridge.networkAccessEnabled
    });

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
              {bridge.selectedWorkspace ? compactPath(bridge.selectedWorkspace.path) : "Sem repositorio"}
            </Text>
          </View>
          <StatusPill
            label={bridge.health?.codex_ready ? "online" : "offline"}
            tone={bridge.health?.codex_ready ? "ok" : bridge.error ? "error" : "warn"}
          />
          <IconAction icon={RefreshCcw} label="Atualizar" onPress={() => void bridge.refreshAll()} />
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

        <View style={styles.selectorBlock}>
          <View style={styles.selectorHeader}>
            <FolderGit2 size={16} color={colors.textMuted} />
            <Text style={styles.selectorTitle}>Repositorio</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {bridge.workspaces.map((workspace) => (
              <PillButton
                key={workspace.path}
                label={workspace.name}
                detail={workspace.exists ? compactPath(workspace.path, 32) : "indisponivel"}
                selected={bridge.selectedWorkspace?.path === workspace.path}
                disabled={!workspace.exists}
                onPress={() => void bridge.selectWorkspace(workspace)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.selectorBlock}>
          <View style={styles.selectorHeader}>
            <Bot size={16} color={colors.textMuted} />
            <Text style={styles.selectorTitle}>Modelo</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {bridge.models.map((model) => (
              <PillButton
                key={model.id}
                label={model.displayName ?? model.id}
                detail={model.defaultReasoningEffort ?? model.description ?? model.model}
                selected={bridge.selectedModelId === model.id}
                onPress={() => bridge.setSelectedModelId(model.id)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.threadBar}>
          <Pressable style={styles.threadButton} onPress={() => router.push("/conversations")}>
            <ListTree size={18} color={colors.text} />
            <View style={styles.threadTextWrap}>
              <Text numberOfLines={1} style={styles.threadTitle}>
                {bridge.selectedThread?.title ?? "Nova conversa"}
              </Text>
              <Text numberOfLines={1} style={styles.threadSubtitle}>
                {bridge.threads.length} no historico deste repositorio
              </Text>
            </View>
          </Pressable>
          <IconAction icon={MessageSquarePlus} label="Nova conversa" onPress={() => void bridge.createNewThread()} />
        </View>

        <View style={styles.selectorBlock}>
          <View style={styles.selectorHeader}>
            <ShieldCheck size={16} color={colors.textMuted} />
            <Text style={styles.selectorTitle}>Modo de execucao</Text>
            <Text numberOfLines={1} style={styles.selectorMeta}>
              {activeExecutionPreset?.label ?? "Personalizado"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limits"
              onPress={() => {
                setLimitsVisible(true);
                void bridge.refreshAccount();
              }}
              style={({ pressed }) => [styles.limitsButton, pressed && styles.limitsButtonPressed]}
            >
              <Gauge size={16} color={colors.text} />
              <Text style={styles.limitsButtonText}>Limits</Text>
            </Pressable>
          </View>
          <Text numberOfLines={1} style={styles.executionSummary}>
            {currentExecutionDetail}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {EXECUTION_PRESETS.map((preset) => (
              <PillButton
                key={preset.id}
                label={preset.label}
                detail={preset.detail}
                selected={activeExecutionPreset?.id === preset.id}
                onPress={() =>
                  bridge.setExecutionSettings({
                    sandboxMode: preset.sandboxMode,
                    approvalPolicy: preset.approvalPolicy,
                    networkAccessEnabled: preset.networkAccessEnabled
                  })
                }
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.selectorBlock}>
          <View style={styles.selectorHeader}>
            <Gauge size={16} color={colors.textMuted} />
            <Text style={styles.selectorTitle}>Esforco</Text>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.effortRow}
          >
            {efforts.map((effort) => (
              <Pressable
                key={effort}
                onPress={() => bridge.setReasoningEffort(effort)}
                style={[styles.effortChip, bridge.reasoningEffort === effort && styles.effortChipActive]}
              >
                <Text
                  style={[
                    styles.effortChipText,
                    bridge.reasoningEffort === effort && styles.effortChipTextActive
                  ]}
                >
                  {effort}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
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

        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Mensagem para o Codex"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
          />
          {bridge.isRunning ? (
            <IconAction icon={Square} label="Cancelar" variant="danger" onPress={() => void bridge.cancelRun()} />
          ) : (
            <IconAction
              icon={Send}
              label="Enviar"
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

function LimitsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const bridge = useBridge();
  const limits = getCodexLimits(bridge.account);
  const account = bridge.account?.account ?? null;
  const planType = limits?.planType ?? account?.planType ?? null;
  const subtitle = [account?.email, planType ? planTypeLabel(planType) : null]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
  const credits = limits?.credits ?? null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.limitsModal}>
          <View style={styles.limitsHeader}>
            <View style={styles.limitsTitleWrap}>
              <Text style={styles.limitsTitle}>Limits</Text>
              <Text numberOfLines={1} style={styles.limitsSubtitle}>
                {subtitle || "Conta Codex"}
              </Text>
            </View>
            <IconAction
              icon={RefreshCcw}
              label="Atualizar limits"
              disabled={bridge.isRefreshingAccount}
              onPress={() => void bridge.refreshAccount()}
            />
            <IconAction icon={X} label="Fechar limits" onPress={onClose} />
          </View>

          {bridge.isRefreshingAccount ? (
            <View style={styles.limitsLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.limitsLoadingText}>Atualizando limits...</Text>
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
              <Text style={styles.limitsEmptyTitle}>Limits indisponiveis</Text>
              <Text style={styles.limitsEmptyText}>
                O bridge ainda nao recebeu dados de rate limit desta conta.
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
          <Text style={styles.limitUnavailable}>Sem dados</Text>
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
          <Text style={styles.limitRemaining}>{formatPercent(remainingPercent)} disponivel</Text>
          <Text style={styles.limitUsed}>{formatPercent(usedPercent)} usado</Text>
        </View>
      </View>
      <View style={styles.limitBarTrack}>
        <View style={[styles.limitBarFill, { width: `${usedPercent}%` }]} />
      </View>
      <Text style={styles.limitReset}>{resetLabel(limitWindow.resetsAt)}</Text>
    </View>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageRole, isUser && styles.userRole]}>
          {isUser ? "Voce" : "Codex"}
          {message.pending ? " ." : ""}
        </Text>
        <Text style={[styles.messageText, isUser && styles.userText]}>
          {message.text || "Processando..."}
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
      <Text style={styles.approvalTitle}>Aprovacao pendente</Text>
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
      <Text style={styles.emptyTitle}>Pronto</Text>
      <Text style={styles.emptyText}>Selecione repositorio, modelo e conversa.</Text>
    </View>
  );
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
    return "Janela de 5h";
  }
  if (minutes === 10080) {
    return "Janela weekly";
  }
  if (!minutes) {
    return "Janela atual";
  }
  if (minutes % 60 === 0) {
    return `Janela de ${minutes / 60}h`;
  }
  return `Janela de ${minutes} min`;
}

function resetLabel(resetsAt: number | null) {
  if (!resetsAt) {
    return "Reset nao informado";
  }

  const milliseconds = resetsAt > 10_000_000_000 ? resetsAt : resetsAt * 1000;
  const formatted = new Date(milliseconds).toLocaleString("pt-BR", {
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
    return "Ilimitados";
  }
  if (credits.balance) {
    return credits.balance;
  }
  return credits.hasCredits ? "Ativos" : "Indisponiveis";
}

function limitReachedLabel(rateLimitReachedType: string) {
  return rateLimitReachedType.replace(/_/g, " ");
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
    fontWeight: "800",
    letterSpacing: 0
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
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
    fontWeight: "600"
  },
  selectorBlock: {
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingBottom: spacing.sm
  },
  selectorHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 7
  },
  selectorTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  selectorMeta: {
    flex: 1,
    minWidth: 0,
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right"
  },
  limitsButton: {
    minHeight: 32,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  limitsButtonPressed: {
    opacity: 0.82
  },
  limitsButtonText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "800"
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.38)",
    justifyContent: "center",
    padding: spacing.lg
  },
  limitsModal: {
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
    fontWeight: "800"
  },
  limitsSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
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
    fontWeight: "800"
  },
  limitsError: {
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md
  },
  limitsErrorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: "700"
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
    fontWeight: "800"
  },
  limitMeterSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  limitPercentWrap: {
    alignItems: "flex-end"
  },
  limitRemaining: {
    color: colors.success,
    fontSize: 14,
    fontWeight: "800"
  },
  limitUsed: {
    color: colors.textMuted,
    fontSize: 12,
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
    marginTop: spacing.sm
  },
  limitUnavailable: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700"
  },
  limitsEmpty: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  limitsEmptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "800"
  },
  limitsEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
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
    fontWeight: "800",
    textTransform: "uppercase"
  },
  creditsValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "800"
  },
  limitReached: {
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
    padding: spacing.md
  },
  limitReachedText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "800"
  },
  executionSummary: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm
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
    fontWeight: "800"
  },
  threadSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2
  },
  effortRow: {
    paddingRight: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm
  },
  effortChip: {
    height: 32,
    minWidth: 66,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  effortChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent
  },
  effortChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800"
  },
  effortChipTextActive: {
    color: colors.accent
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
    fontWeight: "800"
  },
  activityDetail: {
    color: colors.textMuted,
    fontSize: 11,
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
    fontWeight: "800"
  },
  approvalDetail: {
    color: colors.text,
    fontSize: 13,
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
    fontWeight: "800"
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
    fontWeight: "800",
    marginBottom: 4
  },
  userRole: {
    color: "#DCEFF3"
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
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
    fontWeight: "800"
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
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
    lineHeight: 20
  }
});
