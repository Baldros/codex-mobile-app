import { router } from "expo-router";
import { Database, RefreshCcw, Save, X } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
import { colors, spacing } from "../theme/colors";
import { McpServerRow } from "./settings/McpServerRow";
import { InfoRow, OptionGrid } from "./settings/SettingsRows";
import { styles } from "./settings/styles";

const fallbackEfforts: ReasoningEffort[] = ["low", "medium", "high", "xhigh"];

export function SettingsScreen() {
  const bridge = useBridge();
  const insets = useSafeAreaInsets();
  const [baseUrlDraft, setBaseUrlDraft] = useState(bridge.baseUrl);
  const [expandedMcpServer, setExpandedMcpServer] = useState<string | null>(null);
  const [didAutoLoadMcp, setDidAutoLoadMcp] = useState(false);
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

  useEffect(() => {
    if (
      bridge.capabilities.mcp?.list &&
      !didAutoLoadMcp &&
      bridge.mcpServers.length === 0 &&
      !bridge.mcpError &&
      !bridge.isRefreshingMcp
    ) {
      setDidAutoLoadMcp(true);
      void bridge.refreshMcpServers();
    }
  }, [bridge, didAutoLoadMcp]);

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
          label="Save URL"
          variant="filled"
          onPress={() => {
            bridge.setBaseUrl(baseUrlDraft);
            void bridge.refreshAll();
          }}
        />
        <IconAction icon={X} label="Close" onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Execution Mode</Text>
          <InfoRow
            label={activeExecutionPreset?.label ?? "Custom"}
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
          <InfoRow label="Status" value={bridge.health?.status ?? "no response"} />
          <InfoRow label="Auth" value={bridge.health?.auth ?? "-"} />
          <InfoRow label="CLI" value={bridge.health?.codex_cli_version ?? "-"} />
          <InfoRow label="Allowlist" value={bridge.allowlistFile ?? "-"} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitleNoMargin}>MCP</Text>
            {bridge.isRefreshingMcp ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            <IconAction
              icon={RefreshCcw}
              label="Refresh MCP"
              disabled={!bridge.capabilities.mcp?.list || bridge.isRefreshingMcp}
              onPress={() => void bridge.refreshMcpServers()}
            />
            <IconAction
              icon={Database}
              label="Reload MCP"
              disabled={!bridge.capabilities.mcp?.reload || bridge.isRefreshingMcp}
              onPress={() => void bridge.reloadMcpServers()}
            />
          </View>
          <InfoRow
            label="Capability"
            value={
              bridge.capabilities.mcp?.list
                ? `${bridge.mcpServers.length} server(s)`
                : "Unavailable in this runtime"
            }
          />
          {bridge.mcpError ? (
            <Text numberOfLines={3} style={styles.errorText}>
              {bridge.mcpError}
            </Text>
          ) : null}
          {bridge.mcpServers.map((server) => (
            <McpServerRow
              key={server.name}
              server={server}
              expanded={expandedMcpServer === server.name}
              onToggle={() =>
                setExpandedMcpServer((current) => (current === server.name ? null : server.name))
              }
              onReadResource={(resource) => void bridge.readMcpResource(server.name, resource.uri)}
            />
          ))}
          {bridge.mcpResource ? (
            <View style={styles.mcpReadout}>
              <Text style={styles.optionTitle}>Resource content</Text>
              <Text numberOfLines={10} style={styles.mcpReadoutText}>
                {mcpResourceText(bridge.mcpResource.contents)}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tunnel build</Text>
          <InfoRow label="Gateway" value={bridge.buildConfig.gateway} />
          <InfoRow label="State" value={bridge.tunnelStatus.state} />
          <InfoRow label="Local URL" value={bridge.buildConfig.sshTunnel.localUrl} />
          <InfoRow
            label="Remote API"
            value={`${bridge.buildConfig.sshTunnel.remoteApiHost}:${bridge.buildConfig.sshTunnel.remoteApiPort}`}
          />
          <InfoRow
            label="SSH endpoints"
            value={
              bridge.buildConfig.sshTunnel.endpointCandidates
                .map((endpoint) => endpoint.displayValue)
                .join(", ") || "-"
            }
          />
          <InfoRow label="SSH user" value={bridge.buildConfig.sshTunnel.username || "-"} />
          <InfoRow label="Auth mode" value={bridge.buildConfig.sshTunnel.authMode ?? "-"} />
          <InfoRow label="Active endpoint" value={bridge.tunnelStatus.activeEndpoint ?? "-"} />
          <InfoRow
            label="Health"
            value={
              bridge.tunnelStatus.lastHealthCheckMs === null
                ? "-"
                : `${bridge.tunnelStatus.lastHealthCheckMs}ms`
            }
          />
          <InfoRow label="Config" value={bridge.tunnelConfigIssue ?? "ok"} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
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
          <Text style={styles.sectionTitle}>Model</Text>
          <InfoRow label="Current" value={selectedModel?.displayName ?? bridge.selectedModelId ?? "-"} />
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
            <Text style={styles.saveDefaultsText}>Save defaults to Codex</Text>
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

function stringValue(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

function mcpResourceText(contents: Array<{ text?: string; blob?: string; uri: string; mimeType?: string | null }>) {
  if (contents.length === 0) {
    return "No content returned.";
  }

  return contents
    .map((content) => {
      if (content.text) {
        return content.text;
      }
      if (content.blob) {
        return `[binary ${content.mimeType ?? "content"}] ${content.uri}`;
      }
      return content.uri;
    })
    .join("\n\n");
}
