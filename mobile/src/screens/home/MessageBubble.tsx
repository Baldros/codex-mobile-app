import { AlertCircle, Check, CheckCircle2, Clock3, ShieldCheck, Terminal, X } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

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
