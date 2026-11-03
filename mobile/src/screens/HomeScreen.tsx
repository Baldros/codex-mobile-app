import { router } from "expo-router";
import {
  ChevronDown,
  FolderPlus,
  FolderGit2,
  ListTree,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  Settings,
  Square,
  X
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconAction } from "../components/IconAction";
import { Screen } from "../components/Screen";
import { StatusPill } from "../components/StatusPill";
import type { ChatMessage } from "../domain/bridge";
import { attachmentInputItems, messageForDraft } from "../domain/attachments";
import { activeMentionTrigger, buildMentionItems, type ComposerMention } from "../domain/mentions";
import { useBridge } from "../state/BridgeProvider";
import { colors, spacing } from "../theme/colors";
import { compactPath } from "../utils/format";
import { ComposerMenu } from "./home/ComposerMenu";
import { EmptyChat } from "./home/EmptyChat";
import { FolderPickerModal } from "./home/FolderPickerModal";
import { LimitsModal } from "./home/LimitsModal";
import { MentionPalette } from "./home/MentionPalette";
import { MessageBubble } from "./home/MessageBubble";
import { styles } from "./home/styles";
import { useStickyChatScroll } from "./home/useStickyChatScroll";

export function HomeScreen() {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<ComposerMention[]>([]);
  const [limitsVisible, setLimitsVisible] = useState(false);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const mentionLoadRequested = useRef(false);
  const selectedModel = useMemo(
    () => bridge.models.find((model) => model.id === bridge.selectedModelId) ?? null,
    [bridge.models, bridge.selectedModelId]
  );
  const canSend =
    (draft.trim().length > 0 || bridge.pendingAttachments.length > 0) &&
    !bridge.isRunning &&
    !bridge.isComposerLocked &&
    !bridge.hasUncertainSubmission &&
    !bridge.isUploadingAttachment &&
    bridge.failedUploadCount === 0 &&
    bridge.connectionStatus === "connected" &&
    Boolean(bridge.selectedWorkspace);
  const mentionTrigger = useMemo(() => activeMentionTrigger(draft), [draft]);
  const mentionItems = useMemo(
    () =>
      buildMentionItems(
        bridge.apps,
        bridge.skills,
        bridge.mcpServers,
        mentionTrigger?.query ?? ""
      ),
    [bridge.apps, bridge.skills, bridge.mcpServers, mentionTrigger?.query]
  );
  // With the keyboard open on Android the stack is already lifted to the keyboard top
  // (KeyboardAvoidingView paddingBottom), so the composer only needs its own breathing room —
  // symmetric with the composer's top padding. When closed it clears the navigation bar inset.
  const composerBottomPadding =
    Platform.OS === "android" && keyboardVisible ? spacing.md : spacing.md + insets.bottom;
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
  const scroll = useStickyChatScroll(
    `${bridge.selectedWorkspace?.path ?? "none"}:${bridge.selectedThread?.id ?? "new"}`,
    `${bridge.messages.length}:${latestMessageMarker}`,
    keyboardVisible ? keyboardHeight : 0
  );

  useEffect(() => {
    if (pendingRequestId && bridge.lastConfirmedRequestId === pendingRequestId) {
      setDraft("");
      setSelectedMentions([]);
      setPendingRequestId(null);
    }
  }, [bridge.lastConfirmedRequestId, pendingRequestId]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return undefined;
    }

    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      // height excludes the navigation bar (RN reports imeInsets.bottom - barInsets.bottom).
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    mentionLoadRequested.current = false;
  }, [bridge.selectedWorkspace?.path, bridge.selectedThread?.id]);

  useEffect(() => {
    if (!mentionTrigger || mentionLoadRequested.current) {
      return;
    }

    mentionLoadRequested.current = true;
    void bridge.refreshMentions();
  }, [bridge, mentionTrigger]);

  const handleDraftChange = (next: string) => {
    setDraft(next);
    setSelectedMentions((current) => current.filter((mention) => next.includes(mention.token)));
  };

  const handleMentionSelect = (mention: ComposerMention) => {
    const trigger = activeMentionTrigger(draft);
    if (!trigger) {
      return;
    }

    const nextDraft = `${draft.slice(0, trigger.start)}${mention.token} ${draft.slice(trigger.end)}`;
    setDraft(nextDraft);
    setSelectedMentions((current) =>
      current.some((item) => item.id === mention.id) ? current : [...current, mention]
    );
  };

  const removeMention = (mention: ComposerMention) => {
    setSelectedMentions((current) => current.filter((item) => item.id !== mention.id));
    setDraft((current) => current.replace(mention.token, "").replace(/\s{2,}/g, " "));
  };

  const handleSend = async () => {
    const value = draft;
    const inputItems = [
      ...selectedMentions.map((mention) => mention.inputItem),
      ...attachmentInputItems(bridge.pendingAttachments)
    ];
    const result = await bridge.sendMessage(messageForDraft(value, bridge.pendingAttachments.length), inputItems);
    if (result.status === "accepted") {
      setDraft((current) => current === value ? "" : current);
      setSelectedMentions([]);
      setPendingRequestId(null);
    } else if (result.status === "uncertain") {
      setPendingRequestId(result.requestId ?? null);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        // Android (edge-to-edge + adjustResize) does not resize the root view; RN only emits
        // keyboard events. Avoid behavior="height": its self-referential reset can stick a stale
        // offset after the keyboard closes. Instead lift the stack deterministically by the measured
        // keyboard height (+ the navigation-bar inset it overlaps), gated on keyboardVisible so it
        // resets to zero on keyboardDidHide / blur. iOS keeps the reliable padding behavior.
        behavior={Platform.select({ ios: "padding", default: undefined })}
        style={[
          styles.keyboard,
          Platform.OS === "android" && keyboardVisible
            ? { paddingBottom: keyboardHeight + insets.bottom }
            : null
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.appTitle}>Codex Mobile</Text>
            <Text numberOfLines={1} style={styles.subtitle}>
              {bridge.selectedWorkspace ? compactPath(bridge.selectedWorkspace.path) : "No repository"}
            </Text>
          </View>
          <StatusPill
            label={bridge.connectionStatus === "connected"
              ? (bridge.health?.codex_ready ? "online" : "Codex unavailable")
              : bridge.connectionStatus === "connecting" ? "connecting" : "reconnecting"}
            tone={bridge.connectionStatus === "connected" && bridge.health?.codex_ready ? "ok" : "warn"}
          />
          <IconAction icon={FolderGit2} label="Repositories" onPress={() => router.push("/repositories")} />
          <IconAction icon={RefreshCcw} label="Refresh" onPress={() => void bridge.refreshAll()} />
          <IconAction icon={Settings} label="Settings" onPress={() => router.push("/settings")} />
        </View>

        <LimitsModal visible={limitsVisible} onClose={() => setLimitsVisible(false)} />
        <FolderPickerModal visible={folderPickerVisible} onClose={() => setFolderPickerVisible(false)} />

        {bridge.error || bridge.connectionStatus !== "connected" || bridge.hasUncertainSubmission ? (
          <View style={styles.errorBand}>
            <Text numberOfLines={2} style={styles.errorText}>
              {bridge.connectionStatus !== "connected" ? "Waiting for Bridge. Conversations remain available while it reconnects." :
                bridge.error ?? "A previous send is still being checked. Review the conversation before sending again."}
            </Text>
            {bridge.hasUncertainSubmission ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear uncertain submission" onPress={() =>
                Alert.alert("Submission not confirmed", "Sending again may start a duplicate run. Check the conversation first.", [
                  { text: "Keep waiting", style: "cancel" },
                  { text: "Clear pending send", onPress: () => { bridge.clearUncertainSubmission(); setPendingRequestId(null); } }
                ])}>
                <Text style={styles.errorText}>Clear pending send</Text>
              </Pressable>
            ) : null}
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
          <View style={styles.threadActions}>
            <IconAction icon={MessageSquarePlus} label="New conversation" onPress={() => void bridge.createNewThread()} />
            <IconAction
              icon={FolderPlus}
              label="Add folder"
              onPress={() => setFolderPickerVisible(true)}
            />
          </View>
        </View>

        <View style={styles.messageArea}>
        <FlatList
          ref={scroll.listRef}
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
          onScroll={scroll.onScroll}
          onScrollBeginDrag={scroll.onScrollBeginDrag}
          onScrollEndDrag={scroll.onScrollEndDrag}
          onMomentumScrollBegin={scroll.onMomentumScrollBegin}
          onMomentumScrollEnd={scroll.onMomentumScrollEnd}
          onContentSizeChange={scroll.onContentSizeChange}
          scrollEventThrottle={16}
          ListEmptyComponent={
            <EmptyChat
              isLoading={bridge.isLoadingThreadContent}
              hasSelectedThread={Boolean(bridge.selectedThread)}
              hasWorkspace={Boolean(bridge.selectedWorkspace)}
            />
          }
        />
        {scroll.showJump ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Jump to latest message" onPress={scroll.jumpToBottom}
            style={styles.jumpToBottom}>
            <ChevronDown size={20} color={colors.text} />
          </Pressable>
        ) : null}
        </View>

        {mentionTrigger ? (
          <MentionPalette
            items={mentionItems}
            query={mentionTrigger.query}
            loading={bridge.isRefreshingMentions}
            error={bridge.mentionError}
            onRefresh={() => void bridge.refreshMentions()}
            onSelect={handleMentionSelect}
          />
        ) : null}

        <View style={[styles.composer, { paddingBottom: composerBottomPadding }]}>
          <View style={styles.composerRow}>
            <ComposerMenu
              selectedModel={selectedModel}
              onAttachFile={() => void bridge.pickAttachment()}
              attachmentEnabled={bridge.capabilities.uploads?.enabled === true && bridge.connectionStatus === "connected"}
              onOpenLimits={() => {
                setLimitsVisible(true);
                void bridge.refreshAccount();
              }}
            />
            <View style={styles.composerInputWrap}>
              {bridge.pendingAttachments.length > 0 || bridge.isUploadingAttachment || bridge.failedUploadCount > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionChips}>
                  {bridge.pendingAttachments.map((attachment) => (
                    <Pressable key={attachment.id} accessibilityRole="button" accessibilityLabel={`Remove ${attachment.name}`}
                      onPress={() => void bridge.removePendingAttachment(attachment.id)} style={styles.mentionChip}>
                      <Text numberOfLines={1} style={styles.mentionChipText}>{attachment.name}</Text>
                      <X size={12} color={colors.accent} />
                    </Pressable>
                  ))}
                  {bridge.isUploadingAttachment ? <Text style={styles.mentionChipText}>Uploading...</Text> : null}
                  {bridge.failedUploadCount > 0 ? (
                    <View style={styles.mentionChip}>
                      <Pressable accessibilityRole="button" accessibilityLabel="Retry failed uploads" onPress={() => void bridge.retryPendingUploads()}>
                        <Text style={styles.mentionChipText}>Retry {bridge.failedUploadCount} failed upload(s)</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel="Remove failed uploads" onPress={bridge.clearFailedUploads}>
                        <X size={12} color={colors.accent} />
                      </Pressable>
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}
              {selectedMentions.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionChips}>
                  {selectedMentions.map((mention) => (
                    <Pressable
                      key={mention.id}
                      onPress={() => removeMention(mention)}
                      style={({ pressed }) => [styles.mentionChip, pressed && styles.menuItemPressed]}
                    >
                      <Text numberOfLines={1} style={styles.mentionChipText}>
                        {mention.token}
                      </Text>
                      <X size={12} color={colors.accent} />
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
              <TextInput
                value={draft}
                onChangeText={handleDraftChange}
                multiline
                placeholder="Message Codex"
                placeholderTextColor={colors.textSubtle}
                onBlur={() => setKeyboardVisible(false)}
                onFocus={() => {
                  if (Platform.OS === "android" && Keyboard.isVisible()) {
                    setKeyboardVisible(true);
                  }
                }}
                style={styles.input}
              />
            </View>
            {bridge.isRunning ? (
              <IconAction icon={Square} label="Cancel" variant="danger" onPress={() => void bridge.cancelRun()} />
            ) : (
              <IconAction
                icon={Send}
                label="Send"
                variant="filled"
                disabled={!canSend}
                onPress={handleSend}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
