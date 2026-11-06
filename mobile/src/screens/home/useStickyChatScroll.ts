import { useCallback, useEffect, useRef, useState } from "react";
import type { FlatList, NativeScrollEvent, NativeSyntheticEvent } from "react-native";

import type { ChatMessage } from "../../domain/bridge";

const BOTTOM_THRESHOLD = 64;
const MAX_SETTLE_TICKS = 15;

export function isNearBottom(event: NativeScrollEvent) {
  return event.contentSize.height - (event.contentOffset.y + event.layoutMeasurement.height) <= BOTTOM_THRESHOLD;
}

export function useStickyChatScroll(threadKey: string, contentKey: string, keyboardKey: number) {
  const listRef = useRef<FlatList<ChatMessage> | null>(null);
  const sticky = useRef(true);
  const userScrolling = useRef(false);
  const settling = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleCount = useRef(0);
  const clearGesture = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showJump, setShowJump] = useState(false);

  const stopSettling = useCallback(() => {
    if (settling.current) clearTimeout(settling.current);
    settling.current = null;
  }, []);

  const settleBottom = useCallback(() => {
    stopSettling();
    if (!sticky.current || userScrolling.current || settleCount.current >= MAX_SETTLE_TICKS) return;
    listRef.current?.scrollToEnd({ animated: false });
    settleCount.current += 1;
    settling.current = setTimeout(settleBottom, 150);
  }, [stopSettling]);

  const jumpToBottom = useCallback(() => {
    sticky.current = true;
    userScrolling.current = false;
    setShowJump(false);
    settleCount.current = 0;
    settleBottom();
  }, [settleBottom]);

  const updateFromGesture = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = isNearBottom(event.nativeEvent);
    if (sticky.current !== next) {
      sticky.current = next;
      setShowJump(!next);
    }
    if (!next) stopSettling();
  }, [stopSettling]);

  const onScrollBeginDrag = useCallback(() => {
    userScrolling.current = true;
    stopSettling();
  }, [stopSettling]);

  const onScrollEndDrag = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateFromGesture(event);
    if (clearGesture.current) clearTimeout(clearGesture.current);
    clearGesture.current = setTimeout(() => { userScrolling.current = false; }, 80);
  }, [updateFromGesture]);

  const onMomentumScrollBegin = useCallback(() => {
    if (clearGesture.current) clearTimeout(clearGesture.current);
    userScrolling.current = true;
  }, []);

  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    updateFromGesture(event);
    userScrolling.current = false;
  }, [updateFromGesture]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (userScrolling.current) updateFromGesture(event);
  }, [updateFromGesture]);

  const onContentSizeChange = useCallback(() => {
    if (!sticky.current) return;
    settleCount.current = 0;
    settleBottom();
  }, [settleBottom]);

  useEffect(() => {
    sticky.current = true;
    setShowJump(false);
    settleCount.current = 0;
    settleBottom();
  }, [threadKey, settleBottom]);

  useEffect(() => {
    if (sticky.current) {
      settleCount.current = 0;
      settleBottom();
    }
  }, [contentKey, keyboardKey, settleBottom]);

  useEffect(() => () => {
    stopSettling();
    if (clearGesture.current) clearTimeout(clearGesture.current);
  }, [stopSettling]);

  return { listRef, showJump, jumpToBottom, onScroll, onScrollBeginDrag, onScrollEndDrag,
    onMomentumScrollBegin, onMomentumScrollEnd, onContentSizeChange };
}
