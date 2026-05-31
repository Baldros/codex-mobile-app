import { RefreshCcw, X } from "lucide-react-native";
import { ActivityIndicator, Modal, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconAction } from "../../components/IconAction";
import type { RateLimitWindow } from "../../domain/bridge";
import { useBridge } from "../../state/BridgeProvider";
import { colors, spacing } from "../../theme/colors";
import {
  clampPercent,
  creditsLabel,
  formatPercent,
  getCodexLimits,
  limitReachedLabel,
  planTypeLabel,
  resetLabel,
  windowDurationLabel
} from "./limits";
import { styles } from "./styles";

export function LimitsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const limits = getCodexLimits(bridge.account);
  const account = bridge.account?.account ?? null;
  const planType = limits?.planType ?? account?.planType ?? null;
  const subtitle = [account?.email, planType ? planTypeLabel(planType) : null]
    .filter((item): item is string => Boolean(item))
    .join(" / ");
  const credits = limits?.credits ?? null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.limitsOverlay, { paddingTop: spacing.lg + insets.top, paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.limitsPanel}>
          <View style={styles.limitsHeader}>
            <View style={styles.limitsTitleWrap}>
              <Text style={styles.limitsTitle}>Limits</Text>
              <Text numberOfLines={1} style={styles.limitsSubtitle}>
                {subtitle || "Codex account"}
              </Text>
            </View>
            <IconAction
              icon={RefreshCcw}
              label="Refresh limits"
              disabled={bridge.isRefreshingAccount}
              onPress={() => void bridge.refreshAccount()}
            />
            <IconAction icon={X} label="Close limits" onPress={onClose} />
          </View>

          {bridge.isRefreshingAccount ? (
            <View style={styles.limitsLoading}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.limitsLoadingText}>Refreshing limits...</Text>
            </View>
          ) : null}

          {bridge.accountError ? (
            <View style={styles.limitsError}>
              <Text style={styles.limitsErrorText}>{bridge.accountError}</Text>
            </View>
          ) : null}

          {limits ? (
            <View style={styles.limitMeters}>
              <LimitMeter label="5h" limitWindow={limits.primary} />
              <LimitMeter label="Weekly" limitWindow={limits.secondary} />
            </View>
          ) : bridge.isRefreshingAccount ? null : (
            <View style={styles.limitsEmpty}>
              <Text style={styles.limitsEmptyTitle}>Limits unavailable</Text>
              <Text style={styles.limitsEmptyText}>
                The bridge has not received rate limit data for this account yet.
              </Text>
            </View>
          )}

          {credits ? (
            <View style={styles.creditsRow}>
              <Text style={styles.creditsLabel}>Credits</Text>
              <Text style={styles.creditsValue}>{creditsLabel(credits)}</Text>
            </View>
          ) : null}

          {limits?.rateLimitReachedType ? (
            <View style={styles.limitReached}>
              <Text style={styles.limitReachedText}>{limitReachedLabel(limits.rateLimitReachedType)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function LimitMeter({ label, limitWindow }: { label: string; limitWindow: RateLimitWindow | null }) {
  if (!limitWindow) {
    return (
      <View style={styles.limitMeter}>
        <View style={styles.limitMeterHeader}>
          <Text style={styles.limitMeterTitle}>{label}</Text>
          <Text style={styles.limitUnavailable}>No data</Text>
        </View>
      </View>
    );
  }

  const usedPercent = clampPercent(limitWindow.usedPercent);
  const remainingPercent = Math.max(0, 100 - usedPercent);

  return (
    <View style={styles.limitMeter}>
      <View style={styles.limitMeterHeader}>
        <View>
          <Text style={styles.limitMeterTitle}>{label}</Text>
          <Text style={styles.limitMeterSubtitle}>{windowDurationLabel(limitWindow.windowDurationMins)}</Text>
        </View>
        <View style={styles.limitPercentWrap}>
          <Text style={styles.limitRemaining}>{formatPercent(remainingPercent)} available</Text>
          <Text style={styles.limitUsed}>{formatPercent(usedPercent)} used</Text>
        </View>
      </View>
      <View style={styles.limitBarTrack}>
        <View style={[styles.limitBarFill, { width: `${usedPercent}%` }]} />
      </View>
      <Text style={styles.limitReset}>{resetLabel(limitWindow.resetsAt)}</Text>
    </View>
  );
}
