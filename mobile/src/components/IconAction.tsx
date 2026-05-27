import type { LucideIcon } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet } from "react-native";

import { colors, radii } from "../theme/colors";

type IconActionProps = {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "plain" | "filled" | "danger";
};

export function IconAction({
  icon: Icon,
  label,
  onPress,
  disabled = false,
  variant = "plain"
}: IconActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed
      ]}
    >
      <Icon
        size={20}
        strokeWidth={2.2}
        color={variant === "filled" ? "#FFFFFF" : variant === "danger" ? colors.danger : colors.text}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface
  },
  plain: {},
  filled: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.dangerSoft
  },
  disabled: {
    opacity: 0.45
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.85
  }
});
