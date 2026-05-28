import type { ApprovalPolicy, BridgePreferences, SandboxMode } from "./bridge";

export type ExecutionPreset = {
  id: "read-only" | "workspace" | "workspace-online" | "full-assisted" | "full-auto";
  label: string;
  detail: string;
  sandboxMode: SandboxMode;
  approvalPolicy: ApprovalPolicy;
  networkAccessEnabled: boolean;
};

type ExecutionSettings = Pick<
  BridgePreferences,
  "sandboxMode" | "approvalPolicy" | "networkAccessEnabled"
>;

export const EXECUTION_PRESETS: ExecutionPreset[] = [
  {
    id: "read-only",
    label: "Read only",
    detail: "read-only / on-request",
    sandboxMode: "read-only",
    approvalPolicy: "on-request",
    networkAccessEnabled: false
  },
  {
    id: "workspace",
    label: "Workspace",
    detail: "workspace-write / on-request",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    networkAccessEnabled: false
  },
  {
    id: "workspace-online",
    label: "Workspace online",
    detail: "workspace-write / network",
    sandboxMode: "workspace-write",
    approvalPolicy: "on-request",
    networkAccessEnabled: true
  },
  {
    id: "full-assisted",
    label: "Full assisted",
    detail: "danger-full-access / on-request",
    sandboxMode: "danger-full-access",
    approvalPolicy: "on-request",
    networkAccessEnabled: false
  },
  {
    id: "full-auto",
    label: "Full direct",
    detail: "danger-full-access / never",
    sandboxMode: "danger-full-access",
    approvalPolicy: "never",
    networkAccessEnabled: false
  }
];

export const approvalPolicies: ApprovalPolicy[] = ["on-request", "never", "untrusted"];
export const sandboxModes: SandboxMode[] = ["workspace-write", "read-only", "danger-full-access"];

export function findExecutionPreset(settings: ExecutionSettings) {
  return (
    EXECUTION_PRESETS.find(
      (preset) =>
        preset.sandboxMode === settings.sandboxMode &&
        preset.approvalPolicy === settings.approvalPolicy &&
        preset.networkAccessEnabled === settings.networkAccessEnabled
    ) ?? null
  );
}

export function executionDetail(settings: ExecutionSettings) {
  const network = settings.networkAccessEnabled ? " / network" : "";
  return `${settings.sandboxMode} / ${settings.approvalPolicy}${network}`;
}
