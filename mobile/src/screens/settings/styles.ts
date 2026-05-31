// Shared StyleSheet for the Settings screen and its rows (info rows, option grids,
// MCP server rows). Several keys (e.g. pressed, optionTitle) are reused across them.

import { StyleSheet } from "react-native";

import { colors, radii, spacing } from "../../theme/colors";
import { fontWeights } from "../../theme/typography";

export const styles = StyleSheet.create({
  header: {
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
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: fontWeights.title
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md
  },
  section: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.action,
    marginBottom: spacing.sm
  },
  sectionTitleNoMargin: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.action
  },
  sectionHeader: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm
  },
  input: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.body,
    marginBottom: spacing.sm
  },
  infoRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    gap: 3
  },
  infoLabel: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: fontWeights.label,
    textTransform: "uppercase"
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  optionBlock: {
    marginTop: spacing.sm
  },
  optionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.label,
    marginBottom: 7
  },
  errorText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeights.subtitle,
    lineHeight: 17,
    marginTop: spacing.xs
  },
  mcpServer: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: spacing.sm,
    marginTop: spacing.sm
  },
  mcpServerHeader: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mcpServerTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  mcpServerTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  mcpServerMeta: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  mcpToggle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  mcpResourceList: {
    gap: spacing.xs,
    paddingBottom: spacing.xs
  },
  mcpResourceRow: {
    minHeight: 48,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    justifyContent: "center",
    paddingVertical: spacing.sm
  },
  mcpResourceName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  mcpResourceUri: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  mcpEmptyText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    paddingVertical: spacing.sm
  },
  mcpTemplateText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    lineHeight: 16
  },
  mcpReadout: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    paddingTop: spacing.sm,
    marginTop: spacing.sm
  },
  mcpReadoutText: {
    color: colors.code,
    fontSize: 11,
    fontWeight: fontWeights.body,
    lineHeight: 16,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.background
  },
  options: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  option: {
    minHeight: 34,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: colors.background
  },
  optionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  optionText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  optionTextActive: {
    color: colors.accent
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm
  },
  preset: {
    width: "48%",
    minHeight: 68,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.sm
  },
  presetActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  presetLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  presetLabelActive: {
    color: colors.accent
  },
  presetDetail: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    lineHeight: 15,
    marginTop: 4
  },
  presetDetailActive: {
    color: colors.text
  },
  switchRow: {
    minHeight: 48,
    marginTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  switchLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  saveDefaults: {
    minHeight: 42,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.md
  },
  saveDefaultsText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  pressed: {
    opacity: 0.85
  }
});
