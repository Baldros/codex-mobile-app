import { router } from "expo-router";
import { Save, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

import { IconAction } from "../components/IconAction";
import { Screen } from "../components/Screen";
import type { ApprovalPolicy, ReasoningEffort, SandboxMode } from "../domain/bridge";
import {
  EXECUTION_PRESETS,
  approvalPolicies,
  executionDetail,
  findExecutionPreset,
  sandboxModes
} from "../domain/executionModes";
import { useBridge } from "../state/BridgeProvider";
import { colors, radii, spacing } from "../theme/colors";

const fallbackEfforts: ReasoningEffort[] = ["low", "medium", "high", "xhigh"];

export function SettingsScreen() {
  const bridge = useBridge();
  const [baseUrlDraft, setBaseUrlDraft] = useState(bridge.baseUrl);
  const selectedModel = useMemo(
    () => bridge.models.find((model) => model.id === bridge.selectedModelId) ?? null,
    [bridge.models, bridge.selectedModelId]
  );
  const serviceTiers = selectedModel?.serviceTiers ?? [];
  const effortOptions = selectedModel?.supportedReasoningEfforts?.map((item) => item.reasoningEffort);
  const efforts = effortOptions && effortOptions.length > 0 ? effortOptions : fallbackEfforts;
  const activeExecutionPreset = findExecutionPreset({
    sandboxMode: bridge.sandboxMode,
    approvalPolicy: bridge.approvalPolicy,
    networkAccessEnabled: bridge.networkAccessEnabled
  });

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Settings</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {bridge.health?.active_transport ?? "bridge"}
          </Text>
        </View>
        <IconAction
          icon={Save}
          label="Salvar URL"
          variant="filled"
          onPress={() => {
            bridge.setBaseUrl(baseUrlDraft);
            void bridge.refreshAll();
          }}
        />
        <IconAction icon={X} label="Fechar" onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modo de execucao</Text>
          <InfoRow
            label={activeExecutionPreset?.label ?? "Personalizado"}
            value={executionDetail({
              sandboxMode: bridge.sandboxMode,
              approvalPolicy: bridge.approvalPolicy,
              networkAccessEnabled: bridge.networkAccessEnabled
            })}
          />
          <View style={styles.presetGrid}>
            {EXECUTION_PRESETS.map((preset) => (
              <Pressable
                key={preset.id}
                onPress={() =>
                  bridge.setExecutionSettings({
                    sandboxMode: preset.sandboxMode,
                    approvalPolicy: preset.approvalPolicy,
                    networkAccessEnabled: preset.networkAccessEnabled
                  })
                }
                style={[
                  styles.preset,
                  activeExecutionPreset?.id === preset.id && styles.presetActive
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.presetLabel,
                    activeExecutionPreset?.id === preset.id && styles.presetLabelActive
                  ]}
                >
                  {preset.label}
                </Text>
                <Text
                  numberOfLines={2}
                  style={[
                    styles.presetDetail,
                    activeExecutionPreset?.id === preset.id && styles.presetDetailActive
                  ]}
                >
                  {preset.detail}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bridge</Text>
          <TextInput
            value={baseUrlDraft}
            onChangeText={setBaseUrlDraft}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <InfoRow label="Status" value={bridge.health?.status ?? "sem resposta"} />
          <InfoRow label="Auth" value={bridge.health?.auth ?? "-"} />
          <InfoRow label="CLI" value={bridge.health?.codex_cli_version ?? "-"} />
          <InfoRow label="Allowlist" value={bridge.allowlistFile ?? "-"} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Avancado</Text>
          <OptionGrid
            title="Approval"
            options={approvalPolicies}
            selected={bridge.approvalPolicy}
            onSelect={(value) => bridge.setApprovalPolicy(value as ApprovalPolicy)}
          />
          <OptionGrid
            title="Sandbox"
            options={sandboxModes}
            selected={bridge.sandboxMode}
            onSelect={(value) => bridge.setSandboxMode(value as SandboxMode)}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Network</Text>
            <Switch value={bridge.networkAccessEnabled} onValueChange={bridge.setNetworkAccessEnabled} />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Modelo</Text>
          <InfoRow label="Atual" value={selectedModel?.displayName ?? bridge.selectedModelId ?? "-"} />
          <OptionGrid
            title="Reasoning effort"
            options={efforts}
            selected={bridge.reasoningEffort}
            onSelect={(value) => bridge.setReasoningEffort(value as ReasoningEffort)}
          />
          {serviceTiers.length > 0 ? (
            <OptionGrid
              title="Service tier"
              options={["default", ...serviceTiers.map((tier) => tier.id)]}
              selected={bridge.serviceTier ?? "default"}
              onSelect={(value) => bridge.setServiceTier(value === "default" ? null : value)}
            />
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.saveDefaults, pressed && styles.pressed]}
            onPress={() => void bridge.saveCodexDefaults()}
          >
            <Text style={styles.saveDefaultsText}>Salvar defaults no Codex</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Config ativa</Text>
          <InfoRow label="model" value={stringValue(bridge.config?.config.model)} />
          <InfoRow
            label="model_reasoning_effort"
            value={stringValue(bridge.config?.config.model_reasoning_effort)}
          />
          <InfoRow label="service_tier" value={stringValue(bridge.config?.config.service_tier)} />
          <InfoRow label="approval_policy" value={stringValue(bridge.config?.config.approval_policy)} />
          <InfoRow label="sandbox_mode" value={stringValue(bridge.config?.config.sandbox_mode)} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.infoValue}>
        {value}
      </Text>
    </View>
  );
}

function OptionGrid({
  title,
  options,
  selected,
  onSelect
}: {
  title: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <View style={styles.optionBlock}>
      <Text style={styles.optionTitle}>{title}</Text>
      <View style={styles.options}>
        {options.map((option) => (
          <Pressable
            key={option}
            onPress={() => onSelect(option)}
            style={[styles.option, selected === option && styles.optionActive]}
          >
            <Text style={[styles.optionText, selected === option && styles.optionTextActive]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

const styles = StyleSheet.create({
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
    fontWeight: "800"
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
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
    fontWeight: "800",
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
    fontWeight: "800",
    textTransform: "uppercase"
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: "600"
  },
  optionBlock: {
    marginTop: spacing.sm
  },
  optionTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 7
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
    fontWeight: "800"
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
    fontWeight: "800"
  },
  presetLabelActive: {
    color: colors.accent
  },
  presetDetail: {
    color: colors.textMuted,
    fontSize: 11,
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
    fontWeight: "800"
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
    fontWeight: "800"
  },
  pressed: {
    opacity: 0.85
  }
});
