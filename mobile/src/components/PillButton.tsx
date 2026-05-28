import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii } from "../theme/colors";
import { fontWeights } from "../theme/typography";

type PillButtonProps = {
  label: string;
  detail?: string | null | undefined;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function PillButton({ label, detail, selected = false, disabled = false, onPress }: PillButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        selected && styles.selected,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <View style={styles.textWrap}>
        <Text numberOfLines={1} style={[styles.label, selected && styles.selectedLabel]}>
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={1} style={[styles.detail, selected && styles.selectedDetail]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 116,
    maxWidth: 210,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8
  },
  selected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  disabled: {
    opacity: 0.45
  },
  pressed: {
    opacity: 0.82
  },
  textWrap: {
    minWidth: 0
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  selectedLabel: {
    color: "#FFFFFF"
  },
  detail: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  selectedDetail: {
    color: "#DCEFF3"
  }
});
