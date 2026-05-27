import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii } from "../theme/colors";

type StatusPillProps = {
  label: string;
  tone?: "ok" | "warn" | "error" | "neutral";
};

export function StatusPill({ label, tone = "neutral" }: StatusPillProps) {
  return (
    <View style={[styles.base, toneStyles[tone]]}>
      <View style={[styles.dot, dotStyles[tone]]} />
      <Text numberOfLines={1} style={[styles.label, labelStyles[tone]]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 28,
    borderRadius: radii.sm,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    maxWidth: 150
  }
});

const toneStyles = StyleSheet.create({
  ok: { backgroundColor: colors.successSoft },
  warn: { backgroundColor: colors.warningSoft },
  error: { backgroundColor: colors.dangerSoft },
  neutral: { backgroundColor: colors.surfaceMuted }
});

const dotStyles = StyleSheet.create({
  ok: { backgroundColor: colors.success },
  warn: { backgroundColor: colors.warning },
  error: { backgroundColor: colors.danger },
  neutral: { backgroundColor: colors.textSubtle }
});

const labelStyles = StyleSheet.create({
  ok: { color: colors.success },
  warn: { color: colors.warning },
  error: { color: colors.danger },
  neutral: { color: colors.textMuted }
});
