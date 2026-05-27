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
  SlidersHorizontal,
  Settings,
  Square,
  Terminal
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
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
import type { ChatMessage, PendingApproval } from "../domain/bridge";
import { EXECUTION_PRESETS, executionDetail, findExecutionPreset } from "../domain/executionModes";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";
import { compactPath } from "../utils/format";

const fallbackEfforts = ["low", "medium", "high", "xhigh"] as const;

export function HomeScreen() {
  const bridge = useBridge();
  const [draft, setDraft] = useState("");
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
              accessibilityLabel="Ajustes avancados"
              onPress={() => router.push("/settings")}
              style={({ pressed }) => [styles.advancedButton, pressed && styles.advancedButtonPressed]}
            >
              <SlidersHorizontal size={16} color={colors.text} />
              <Text style={styles.advancedButtonText}>Avancado</Text>
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
  advancedButton: {
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
  advancedButtonPressed: {
    opacity: 0.82
  },
  advancedButtonText: {
    color: colors.text,
    fontSize: 12,
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
