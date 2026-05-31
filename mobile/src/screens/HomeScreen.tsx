import { router } from "expo-router";
import {
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
import { activeMentionTrigger, buildMentionItems, type ComposerMention } from "../domain/mentions";
import { useBridge } from "../state/BridgeProvider";
import { colors, spacing } from "../theme/colors";
import { compactPath } from "../utils/format";
import { ComposerMenu } from "./home/ComposerMenu";
import { EmptyChat } from "./home/EmptyChat";
import { LimitsModal } from "./home/LimitsModal";
import { MentionPalette } from "./home/MentionPalette";
import { MessageBubble } from "./home/MessageBubble";
import { styles } from "./home/styles";

export function HomeScreen() {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<ComposerMention[]>([]);
  const [limitsVisible, setLimitsVisible] = useState(false);
  const messageListRef = useRef<FlatList<ChatMessage> | null>(null);
  const mentionLoadRequested = useRef(false);
  const selectedModel = useMemo(
    () => bridge.models.find((model) => model.id === bridge.selectedModelId) ?? null,
    [bridge.models, bridge.selectedModelId]
  );
  const canSend = draft.trim().length > 0 && !bridge.isRunning && Boolean(bridge.selectedWorkspace);
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

  useEffect(() => {
    if (bridge.messages.length === 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      messageListRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [bridge.messages.length, latestMessageMarker]);

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

  const handleSend = () => {
    const value = draft;
    const inputItems = selectedMentions.map((mention) => mention.inputItem);
    setDraft("");
    setSelectedMentions([]);
    void bridge.sendMessage(value, inputItems);
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
              onOpenLimits={() => {
                setLimitsVisible(true);
                void bridge.refreshAccount();
              }}
            />
            <View style={styles.composerInputWrap}>
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
