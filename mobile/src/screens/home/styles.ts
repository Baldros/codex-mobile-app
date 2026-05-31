// Shared StyleSheet for the Home (chat) screen and its sub-components. Kept in one
// module because several styles (e.g. menuItemPressed) are reused across the
// composer menu, mention palette, and message timeline.

import { StyleSheet } from "react-native";

import { colors, radii, spacing } from "../../theme/colors";
import { fontWeights } from "../../theme/typography";

export const styles = StyleSheet.create({
  keyboard: {
    flex: 1
  },
  header: {
    minHeight: 68,
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
  appTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: fontWeights.title,
    letterSpacing: 0
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  errorBand: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  threadBar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  threadButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  threadTextWrap: {
    flex: 1,
    minWidth: 0
  },
  threadTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  threadSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  approvalActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  approvalButton: {
    minHeight: 34,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    justifyContent: "center"
  },
  approvalAccept: {
    backgroundColor: colors.success
  },
  approvalDecline: {
    backgroundColor: colors.surface
  },
  approvalButtonText: {
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  approvalAcceptText: {
    color: "#FFFFFF"
  },
  approvalDeclineText: {
    color: colors.text
  },
  messages: {
    flex: 1
  },
  messageList: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
    flexGrow: 1
  },
  messageRow: {
    flexDirection: "row"
  },
  messageRowUser: {
    justifyContent: "flex-end"
  },
  messageBubble: {
    maxWidth: "88%",
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1
  },
  userBubble: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  messageHeader: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: 4
  },
  messageRole: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.action,
    marginBottom: 0
  },
  userRole: {
    color: "#DCEFF3"
  },
  deliveryBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(255, 255, 255, 0.92)",
    alignItems: "center",
    justifyContent: "center"
  },
  messageErrorDrawer: {
    alignSelf: "stretch",
    marginTop: spacing.sm
  },
  messageErrorTab: {
    width: 30,
    height: 28,
    marginLeft: -spacing.md - 1,
    marginBottom: -1,
    borderTopLeftRadius: radii.sm,
    borderBottomLeftRadius: radii.sm,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderWidth: 1,
    borderRightWidth: 0,
    borderColor: "rgba(180, 35, 24, 0.30)",
    backgroundColor: colors.dangerSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  messageErrorTabOpen: {
    backgroundColor: "#FFFFFF"
  },
  messageErrorPanel: {
    borderRadius: radii.sm,
    borderTopLeftRadius: 0,
    borderWidth: 1,
    borderColor: "rgba(180, 35, 24, 0.30)",
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  messageErrorTitle: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  messageErrorText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: fontWeights.body,
    lineHeight: 17,
    marginTop: spacing.xs
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.body,
    lineHeight: 21
  },
  userText: {
    color: "#FFFFFF"
  },
  messageParts: {
    gap: spacing.sm
  },
  messagePartSpacing: {
    marginTop: spacing.xs
  },
  workingRow: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  workingText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm
  },
  timelineRail: {
    width: 14,
    alignItems: "center",
    paddingTop: 11
  },
  timelineNode: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  timelineCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  timelineCardPressable: {
    opacity: 1
  },
  timelineHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  timelineTitleWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  timelineTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.text,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  timelineStatus: {
    minHeight: 24,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  timelineStatusText: {
    fontSize: 10,
    fontWeight: fontWeights.action
  },
  timelineDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    lineHeight: 17,
    marginTop: spacing.xs
  },
  timelineOutput: {
    color: colors.code,
    fontSize: 11,
    fontWeight: fontWeights.body,
    lineHeight: 16,
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: "rgba(255, 255, 255, 0.64)"
  },
  toolDetailsOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.42)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl
  },
  toolDetailsPanel: {
    maxHeight: "86%",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: "hidden"
  },
  toolDetailsHeader: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  toolDetailsTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  toolDetailsTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: fontWeights.title
  },
  toolDetailsSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  toolDetailsClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  toolDetailsScroll: {
    maxHeight: "100%"
  },
  toolDetailsContent: {
    padding: spacing.md,
    gap: spacing.sm
  },
  toolDetailSection: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    overflow: "hidden"
  },
  toolDetailSectionHeader: {
    minHeight: 42,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface
  },
  toolDetailSectionTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  toolDetailSectionBody: {
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted
  },
  toolDetailRows: {
    gap: spacing.sm
  },
  toolDetailCode: {
    color: colors.code,
    fontSize: 11,
    fontWeight: fontWeights.body,
    lineHeight: 16,
    padding: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted
  },
  toolKeyValueRow: {
    gap: spacing.xs
  },
  toolKey: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: fontWeights.label,
    textTransform: "uppercase"
  },
  toolValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: fontWeights.body,
    lineHeight: 17
  },
  toolChangeBlock: {
    gap: spacing.xs
  },
  toolChangePath: {
    color: colors.text,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  toolChangeKind: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body
  },
  approvalTimelineCard: {
    borderColor: "rgba(183, 110, 0, 0.24)",
    backgroundColor: colors.warningSoft
  },
  approvalPendingPill: {
    minHeight: 24,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
    backgroundColor: "rgba(183, 110, 0, 0.10)"
  },
  approvalPendingText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: fontWeights.action
  },
  empty: {
    flex: 1,
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: fontWeights.title
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: fontWeights.body,
    marginTop: 6,
    textAlign: "center"
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm
  },
  composerInputWrap: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs
  },
  composerMenuButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(16, 24, 40, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.72)",
    alignItems: "center",
    justifyContent: "center"
  },
  composerMenuButtonPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.98 }]
  },
  input: {
    minHeight: 44,
    maxHeight: 118,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
    fontWeight: fontWeights.body,
    lineHeight: 20
  },
  mentionChips: {
    gap: spacing.xs,
    paddingRight: spacing.sm
  },
  mentionChip: {
    maxWidth: 180,
    minHeight: 28,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  mentionChipText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: fontWeights.action
  },
  mentionPalette: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.98)",
    padding: spacing.sm,
    maxHeight: 280
  },
  mentionPaletteHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mentionPaletteTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  mentionError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: fontWeights.subtitle,
    marginBottom: spacing.xs
  },
  mentionList: {
    maxHeight: 226
  },
  mentionSection: {
    gap: spacing.xs,
    marginTop: spacing.xs
  },
  mentionSectionTitle: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: fontWeights.label,
    textTransform: "uppercase"
  },
  mentionItem: {
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.surfaceMuted,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mentionIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  mentionItemText: {
    flex: 1,
    minWidth: 0
  },
  mentionItemLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  mentionItemDetail: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  mentionToken: {
    maxWidth: 110,
    color: colors.accent,
    fontSize: 11,
    fontWeight: fontWeights.action
  },
  mentionEmpty: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    paddingVertical: spacing.sm
  },
  limitsOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.38)",
    justifyContent: "center",
    paddingHorizontal: spacing.lg
  },
  limitsPanel: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.md
  },
  limitsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  limitsTitleWrap: {
    flex: 1,
    minWidth: 0
  },
  limitsTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: fontWeights.title
  },
  limitsSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  limitsLoading: {
    minHeight: 38,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  limitsLoadingText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  limitsError: {
    borderRadius: radii.md,
    backgroundColor: colors.dangerSoft,
    padding: spacing.md
  },
  limitsErrorText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  limitMeters: {
    gap: spacing.sm
  },
  limitMeter: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md
  },
  limitMeterHeader: {
    minHeight: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  limitMeterTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: fontWeights.action
  },
  limitMeterSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  limitPercentWrap: {
    alignItems: "flex-end"
  },
  limitRemaining: {
    color: colors.success,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  limitUsed: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  limitBarTrack: {
    height: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceMuted,
    overflow: "hidden",
    marginTop: spacing.md
  },
  limitBarFill: {
    height: 8,
    borderRadius: radii.sm,
    backgroundColor: colors.accent
  },
  limitReset: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: spacing.sm
  },
  limitUnavailable: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.subtitle
  },
  limitsEmpty: {
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md
  },
  limitsEmptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  limitsEmptyText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: fontWeights.body,
    marginTop: 4,
    lineHeight: 18
  },
  creditsRow: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceMuted,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  creditsLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.label,
    textTransform: "uppercase"
  },
  creditsValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  limitReached: {
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
    padding: spacing.md
  },
  limitReachedText: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: fontWeights.action
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.26)",
    justifyContent: "flex-end",
    padding: spacing.lg
  },
  menuPanel: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255, 255, 255, 0.96)",
    padding: spacing.md,
    gap: spacing.md,
    maxHeight: "72%"
  },
  menuHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  menuTitleIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  menuBackButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted
  },
  menuTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontWeight: fontWeights.title
  },
  menuItems: {
    gap: spacing.sm
  },
  optionList: {
    maxHeight: 360
  },
  menuItem: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  menuItemDisabled: {
    opacity: 0.42
  },
  menuItemPressed: {
    opacity: 0.82
  },
  menuItemText: {
    flex: 1,
    minWidth: 0
  },
  menuItemLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.action
  },
  menuItemDetail: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: fontWeights.body,
    marginTop: 2
  },
  mutedText: {
    color: colors.textSubtle
  },
  selectable: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  selectableActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft
  },
  selectableLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: fontWeights.subtitle
  },
  selectableLabelActive: {
    color: colors.accent,
    fontWeight: fontWeights.action
  }
});
