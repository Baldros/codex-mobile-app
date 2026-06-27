import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ImagePlus,
  Menu,
  Minimize2,
  ShieldCheck,
  X,
  Zap
} from "lucide-react-native";
import React, { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconAction } from "../../components/IconAction";
import {
  effortsForModel,
  fastTierOptionsForModel,
  isServiceTierAvailable,
  type FastTierOption
} from "../../domain/composerOptions";
import type { CodexModel, ReasoningEffort } from "../../domain/bridge";
import { useBridge } from "../../state/BridgeProvider";
import { colors, spacing } from "../../theme/colors";
import { limitsMenuDetail } from "./limits";
import { styles } from "./styles";

type MenuPanel = "main" | "models" | "effort" | "fast";

export function ComposerMenu({
  selectedModel,
  imageCount,
  isPickingImages,
  onPickImages,
  onOpenLimits
}: {
  selectedModel: CodexModel | null;
  imageCount: number;
  isPickingImages: boolean;
  onPickImages: () => void;
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
  const compactBusy = Boolean(
    bridge.selectedThread && bridge.compactingThreadId === bridge.selectedThread.id
  );
  const compactDisabled =
    !bridge.selectedThread ||
    !bridge.capabilities.threads.compact ||
    bridge.isRunning ||
    bridge.isComposerLocked ||
    compactBusy;
  const imageDisabled =
    !bridge.selectedWorkspace ||
    bridge.isRunning ||
    bridge.isComposerLocked ||
    isPickingImages;

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
                  icon={
                    isPickingImages ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <ImagePlus
                        size={18}
                        color={imageDisabled ? colors.textSubtle : colors.textMuted}
                      />
                    )
                  }
                  label="Send image"
                  detail={imageMenuDetail({
                    selectedWorkspace: Boolean(bridge.selectedWorkspace),
                    isRunning: bridge.isRunning,
                    isComposerLocked: bridge.isComposerLocked,
                    isPickingImages,
                    imageCount
                  })}
                  disabled={imageDisabled}
                  onPress={() => {
                    close();
                    onPickImages();
                  }}
                />
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
                <Text style={styles.menuSectionTitle}>Conversation</Text>
                <MenuItem
                  icon={
                    compactBusy ? (
                      <ActivityIndicator color={colors.warning} size="small" />
                    ) : (
                      <Minimize2
                        size={18}
                        color={compactDisabled ? colors.textSubtle : colors.textMuted}
                      />
                    )
                  }
                  label="Compact conversation"
                  detail={compactMenuDetail(bridge)}
                  disabled={compactDisabled}
                  onPress={() => {
                    close();
                    void bridge.compactThread();
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

function imageMenuDetail({
  selectedWorkspace,
  isRunning,
  isComposerLocked,
  isPickingImages,
  imageCount
}: {
  selectedWorkspace: boolean;
  isRunning: boolean;
  isComposerLocked: boolean;
  isPickingImages: boolean;
  imageCount: number;
}) {
  if (isPickingImages) {
    return "Uploading...";
  }
  if (!selectedWorkspace) {
    return "No repository";
  }
  if (isRunning || isComposerLocked) {
    return "Busy";
  }
  if (imageCount > 0) {
    return imageCount === 1 ? "1 attached" : `${imageCount} attached`;
  }
  return "Gallery";
}

function compactMenuDetail(bridge: ReturnType<typeof useBridge>) {
  if (bridge.compactingThreadId && bridge.compactingThreadId === bridge.selectedThread?.id) {
    return "Compacting...";
  }
  if (!bridge.selectedThread) {
    return "No conversation";
  }
  if (!bridge.capabilities.threads.compact) {
    return "Unavailable";
  }
  if (bridge.isRunning || bridge.isComposerLocked) {
    return "Busy";
  }
  return null;
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
