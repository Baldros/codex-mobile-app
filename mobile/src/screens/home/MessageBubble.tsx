import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileCode2,
  ShieldCheck,
  Terminal,
  X
} from "lucide-react-native";
import type React from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Modal, PanResponder, Pressable, ScrollView, Text, View } from "react-native";

import { MarkdownText } from "../../components/MarkdownText";
import type { ChatMessage, ChatMessagePart, PendingApproval } from "../../domain/bridge";
import { colors } from "../../theme/colors";
import { styles } from "./styles";

export function MessageBubble({
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
        <View style={styles.messageHeader}>
          <Text style={[styles.messageRole, isUser && styles.userRole]}>
            {isUser ? "You" : "Codex"}
            {message.pending ? " ." : ""}
          </Text>
          {isUser ? <DeliveryStatusIcon status={message.deliveryStatus} /> : null}
        </View>
        {isUser ? (
          <>
            <MarkdownText text={message.text} variant="inverted" />
            {message.deliveryStatus === "failed" ? (
              <UserMessageErrorDrawer error={message.deliveryError ?? "Message failed."} />
            ) : null}
          </>
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

function UserMessageErrorDrawer({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx < -12) {
            setExpanded(true);
          } else if (gesture.dx > 12) {
            setExpanded(false);
          }
        }
      }),
    []
  );

  return (
    <View style={styles.messageErrorDrawer}>
      <Pressable
        {...panResponder.panHandlers}
        accessibilityLabel={expanded ? "Hide send error" : "Show send error"}
        accessibilityRole="button"
        onPress={() => setExpanded((current) => !current)}
        style={[styles.messageErrorTab, expanded && styles.messageErrorTabOpen]}
      >
        <AlertCircle size={15} color={colors.danger} strokeWidth={2.6} />
      </Pressable>
      {expanded ? (
        <View style={styles.messageErrorPanel}>
          <Text style={styles.messageErrorTitle}>Send failed</Text>
          <Text numberOfLines={6} selectable style={styles.messageErrorText}>
            {error}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function DeliveryStatusIcon({
  status
}: {
  status: ChatMessage["deliveryStatus"];
}) {
  if (!status) {
    return null;
  }

  const tone = deliveryTone(status);
  const Icon = status === "sending" ? Clock3 : status === "sent" ? CheckCircle2 : AlertCircle;

  return (
    <View accessibilityLabel={tone.label} accessible style={styles.deliveryBadge}>
      <Icon size={13} color={tone.color} strokeWidth={2.6} />
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
  const [detailsVisible, setDetailsVisible] = useState(false);
  const tone = activityTone(part.status);
  const canOpenDetails = hasToolDetails(part);

  return (
    <View style={[styles.timelineRow, !isFirst && styles.messagePartSpacing]}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineNode, { backgroundColor: tone.color }]} />
      </View>
      <Pressable
        disabled={!canOpenDetails}
        onPress={() => setDetailsVisible(true)}
        style={[
          styles.timelineCard,
          canOpenDetails && styles.timelineCardPressable,
          { borderColor: tone.border, backgroundColor: tone.background }
        ]}
      >
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
          {canOpenDetails ? <ChevronRight size={15} color={colors.textMuted} /> : null}
        </View>
      </Pressable>
      <ToolDetailsModal
        visible={detailsVisible}
        part={part}
        onClose={() => setDetailsVisible(false)}
      />
    </View>
  );
}

function ToolDetailsModal({
  visible,
  part,
  onClose
}: {
  visible: boolean;
  part: Extract<ChatMessagePart, { type: "activity" }>;
  onClose: () => void;
}) {
  const sections = toolDetailSections(part);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.toolDetailsOverlay}>
        <View style={styles.toolDetailsPanel}>
          <View style={styles.toolDetailsHeader}>
            <View style={styles.toolDetailsTitleWrap}>
              <Text numberOfLines={1} style={styles.toolDetailsTitle}>{part.title}</Text>
              <Text style={styles.toolDetailsSubtitle}>{activityTone(part.status).label}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close tool details" onPress={onClose} style={styles.toolDetailsClose}>
              <X size={18} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView style={styles.toolDetailsScroll} contentContainerStyle={styles.toolDetailsContent}>
            {sections.map((section) => (
              <ToolDetailsSection
                key={section.id}
                title={section.title}
                icon={section.icon}
                {...(section.tone ? { tone: section.tone } : {})}
              >
                {section.content}
              </ToolDetailsSection>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ToolDetailsSection({
  title,
  icon,
  tone,
  children
}: {
  title: string;
  icon: "terminal" | "file" | "code" | "alert";
  tone?: "danger";
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const Icon = icon === "file" ? FileCode2 : icon === "alert" ? AlertCircle : icon === "code" ? Code2 : Terminal;
  const color = tone === "danger" ? colors.danger : colors.accent;

  return (
    <View style={styles.toolDetailSection}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
        onPress={() => setExpanded((current) => !current)}
        style={styles.toolDetailSectionHeader}
      >
        <Icon size={15} color={color} />
        <Text style={styles.toolDetailSectionTitle}>{title}</Text>
        {expanded ? <ChevronDown size={16} color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textMuted} />}
      </Pressable>
      {expanded ? <View style={styles.toolDetailSectionBody}>{children}</View> : null}
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

function hasToolDetails(part: Extract<ChatMessagePart, { type: "activity" }>) {
  return Boolean(part.detail || part.output || part.toolDetails);
}

function toolDetailSections(part: Extract<ChatMessagePart, { type: "activity" }>) {
  const details = part.toolDetails ?? {};
  const sections: Array<{
    id: string;
    title: string;
    icon: "terminal" | "file" | "code" | "alert";
    tone?: "danger";
    content: React.ReactNode;
  }> = [];

  const command = formatCommand(details.command);
  if (command || details.cwd) {
    sections.push({
      id: "command",
      title: "Command",
      icon: "terminal",
      content: (
        <View style={styles.toolDetailRows}>
          {command ? <ToolCodeBlock text={command} /> : null}
          {typeof details.cwd === "string" ? <ToolKeyValue label="cwd" value={details.cwd} /> : null}
          {details.exitCode !== undefined ? <ToolKeyValue label="exit code" value={String(details.exitCode)} /> : null}
          {details.durationMs !== undefined ? <ToolKeyValue label="duration" value={`${details.durationMs} ms`} /> : null}
        </View>
      )
    });
  }

  const changes = Array.isArray(details.changes) ? details.changes : [];
  if (changes.length > 0) {
    sections.push({
      id: "changes",
      title: "File Changes",
      icon: "file",
      content: (
        <View style={styles.toolDetailRows}>
          {changes.map((change, index) => {
            const record = asRecord(change);
            const path = stringValue(record.path) ?? `Change ${index + 1}`;
            const kind = stringValue(record.kind);
            const diff = stringValue(record.diff);
            return (
              <View key={`${path}-${index}`} style={styles.toolChangeBlock}>
                <Text style={styles.toolChangePath}>{path}</Text>
                {kind ? <Text style={styles.toolChangeKind}>{kind}</Text> : null}
                {diff ? <ToolCodeBlock text={diff} /> : null}
              </View>
            );
          })}
        </View>
      )
    });
  }

  const diff = stringValue(details.diff);
  if (diff) {
    sections.push({
      id: "diff",
      title: "Diff",
      icon: "file",
      content: <ToolCodeBlock text={diff} />
    });
  }

  const output = stringValue(details.output) ?? part.output;
  if (output) {
    sections.push({
      id: "output",
      title: "Output",
      icon: "code",
      content: <ToolCodeBlock text={output} />
    });
  }

  if (details.error !== undefined || part.status === "failed") {
    sections.push({
      id: "error",
      title: "Error",
      icon: "alert",
      tone: "danger",
      content: <ToolCodeBlock text={formatValue(details.error ?? part.detail ?? "Tool failed.")} />
    });
  }

  const metadata = metadataRows(details);
  if (metadata.length > 0) {
    sections.push({
      id: "metadata",
      title: "Metadata",
      icon: "code",
      content: (
        <View style={styles.toolDetailRows}>
          {metadata.map(([label, value]) => <ToolKeyValue key={label} label={label} value={value} />)}
        </View>
      )
    });
  }

  if (details.raw !== undefined) {
    sections.push({
      id: "raw",
      title: "Raw Event",
      icon: "code",
      content: <ToolCodeBlock text={formatValue(details.raw)} />
    });
  }

  if (sections.length === 0) {
    sections.push({
      id: "summary",
      title: "Summary",
      icon: "code",
      content: <ToolCodeBlock text={part.detail ?? "No details available."} />
    });
  }

  return sections;
}

function ToolCodeBlock({ text }: { text: string }) {
  return (
    <Text selectable style={styles.toolDetailCode}>
      {text || " "}
    </Text>
  );
}

function ToolKeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.toolKeyValueRow}>
      <Text style={styles.toolKey}>{label}</Text>
      <Text selectable style={styles.toolValue}>{value}</Text>
    </View>
  );
}

function metadataRows(details: Record<string, unknown>): Array<[string, string]> {
  return [
    ["kind", stringValue(details.kind)],
    ["status", stringValue(details.status)],
    ["server", stringValue(details.server)],
    ["tool", stringValue(details.tool)],
    ["query", stringValue(details.query)],
    ["success", details.success === undefined ? null : String(details.success)]
  ].filter((row): row is [string, string] => typeof row[1] === "string" && row[1].length > 0);
}

function formatCommand(command: unknown) {
  if (Array.isArray(command)) {
    return command.map((part) => String(part)).join(" ");
  }
  return stringValue(command);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }
  if (value === null || value === undefined) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function deliveryTone(status: NonNullable<ChatMessage["deliveryStatus"]>) {
  if (status === "sending") {
    return {
      color: colors.warning,
      label: "Message sending"
    };
  }
  if (status === "failed") {
    return {
      color: colors.danger,
      label: "Message failed"
    };
  }
  return {
    color: colors.success,
    label: "Message sent"
  };
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
