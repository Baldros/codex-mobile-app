import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren
} from "react";

import { BridgeClient, approvalSummary } from "../api/bridgeClient";
import { DEFAULT_PREFERENCES } from "../config/defaults";
import type {
  ActivityItem,
  ApprovalPolicy,
  BridgeHealth,
  BridgePreferences,
  BridgeSseEvent,
  BridgeThread,
  CodexAccountResponse,
  ChatMessage,
  CodexConfigResponse,
  CodexModel,
  PendingApproval,
  ReasoningEffort,
  SandboxMode,
  WorkspaceEntry
} from "../domain/bridge";
import { loadPreferences, savePreferences } from "../storage/preferences";

type BridgeContextValue = {
  preferences: BridgePreferences;
  baseUrl: string;
  health: BridgeHealth | null;
  workspaces: WorkspaceEntry[];
  allowlistFile: string | null;
  threads: BridgeThread[];
  models: CodexModel[];
  config: CodexConfigResponse | null;
  account: CodexAccountResponse | null;
  selectedWorkspace: WorkspaceEntry | null;
  selectedThread: BridgeThread | null;
  selectedModelId: string | null;
  reasoningEffort: ReasoningEffort;
  approvalPolicy: ApprovalPolicy;
  sandboxMode: SandboxMode;
  serviceTier: string | null;
  networkAccessEnabled: boolean;
  messages: ChatMessage[];
  activities: ActivityItem[];
  pendingApprovals: PendingApproval[];
  isBooting: boolean;
  isRefreshing: boolean;
  isRefreshingAccount: boolean;
  isRunning: boolean;
  error: string | null;
  accountError: string | null;
  setBaseUrl: (baseUrl: string) => void;
  setSelectedModelId: (modelId: string) => void;
  setReasoningEffort: (effort: ReasoningEffort) => void;
  setApprovalPolicy: (policy: ApprovalPolicy) => void;
  setSandboxMode: (mode: SandboxMode) => void;
  setServiceTier: (tier: string | null) => void;
  setNetworkAccessEnabled: (enabled: boolean) => void;
  setExecutionSettings: (
    settings: Partial<
      Pick<
        BridgePreferences,
        | "approvalPolicy"
        | "networkAccessEnabled"
        | "reasoningEffort"
        | "sandboxMode"
        | "selectedModelId"
        | "serviceTier"
      >
    >
  ) => void;
  refreshAll: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  refreshThreads: () => Promise<void>;
  selectWorkspace: (workspace: WorkspaceEntry) => Promise<void>;
  selectThread: (thread: BridgeThread) => void;
  createNewThread: () => Promise<BridgeThread | null>;
  sendMessage: (message: string) => Promise<void>;
  cancelRun: () => Promise<void>;
  respondApproval: (approval: PendingApproval, decision: string) => Promise<void>;
  saveCodexDefaults: () => Promise<void>;
};

const BridgeContext = createContext<BridgeContextValue | null>(null);

export function BridgeProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<BridgePreferences>(DEFAULT_PREFERENCES);
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [allowlistFile, setAllowlistFile] = useState<string | null>(null);
  const [threads, setThreads] = useState<BridgeThread[]>([]);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [config, setConfig] = useState<CodexConfigResponse | null>(null);
  const [account, setAccount] = useState<CodexAccountResponse | null>(null);
  const [selectedWorkspace, setSelectedWorkspaceState] = useState<WorkspaceEntry | null>(null);
  const [selectedThread, setSelectedThread] = useState<BridgeThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const activeAbortController = useRef<AbortController | null>(null);
  const activeRunId = useRef<string | null>(null);

  const client = useMemo(() => new BridgeClient(preferences.baseUrl), [preferences.baseUrl]);

  const updatePreferences = useCallback((patch: Partial<BridgePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void savePreferences(next);
      return next;
    });
  }, []);

  const loadThreadsForWorkspace = useCallback(
    async (workspacePath: string) => {
      const response = await client.listThreads({ cwd: workspacePath, limit: 30 });
      setThreads(response.data);

      setSelectedThread((current) => {
        if (current && response.data.some((thread) => thread.id === current.id)) {
          return current;
        }
        return response.data[0] ?? null;
      });
    },
    [client]
  );

  const refreshAccount = useCallback(async () => {
    setIsRefreshingAccount(true);
    setAccountError(null);

    try {
      const response = await client.readAccount();
      setAccount(response);
      setAccountError(response.rateLimitsError ?? null);
    } catch (caught) {
      setAccount(null);
      setAccountError(errorMessage(caught));
    } finally {
      setIsRefreshingAccount(false);
    }
  }, [client]);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);

    try {
      const [healthResult, workspaceResult, modelResult, configResult, accountResult] = await Promise.allSettled([
        client.health(),
        client.listWorkspaces(),
        client.listModels(),
        client.readConfig(),
        client.readAccount()
      ]);

      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
      } else {
        setHealth(null);
      }

      const workspaceResponse =
        workspaceResult.status === "fulfilled" ? workspaceResult.value : null;
      const modelResponse = modelResult.status === "fulfilled" ? modelResult.value : null;
      const configResponse = configResult.status === "fulfilled" ? configResult.value : null;
      const accountResponse = accountResult.status === "fulfilled" ? accountResult.value : null;

      if (workspaceResponse) {
        setWorkspaces(workspaceResponse.data);
        setAllowlistFile(workspaceResponse.allowlist_file);
      } else {
        setWorkspaces([]);
        setAllowlistFile(null);
      }

      if (modelResponse) {
        setModels(modelResponse.data);
      } else {
        setModels([]);
      }
      setConfig(configResponse);
      setAccount(accountResponse);
      setAccountError(
        accountResult.status === "rejected"
          ? errorMessage(accountResult.reason)
          : accountResponse?.rateLimitsError ?? null
      );

      const workspace =
        workspaceResponse?.data.find((entry) => entry.path === preferences.selectedWorkspacePath) ??
        workspaceResponse?.data.find((entry) => entry.exists) ??
        workspaceResponse?.data[0] ??
        null;

      setSelectedWorkspaceState(workspace);
      if (workspace) {
        updatePreferences({ selectedWorkspacePath: workspace.path });
        await loadThreadsForWorkspace(workspace.path);
      } else {
        setThreads([]);
        setSelectedThread(null);
      }

      const configModel = readConfigString(configResponse, "model");
      const defaultModel = modelResponse?.data.find((model) => model.isDefault)?.id;
      const modelId = preferences.selectedModelId ?? configModel ?? defaultModel ?? modelResponse?.data[0]?.id;
      if (modelId) {
        updatePreferences({ selectedModelId: modelId });
      }

      const failures = [
        healthResult.status === "rejected" ? "health" : null,
        workspaceResult.status === "rejected" ? "workspaces" : null,
        modelResult.status === "rejected" ? "models" : null,
        configResult.status === "rejected" ? "config" : null
      ].filter((item): item is string => Boolean(item));

      if (failures.length > 0) {
        const allBridgeCallsFailed = failures.length === 4;
        setError(
          allBridgeCallsFailed
            ? `Bridge indisponivel em ${preferences.baseUrl}. Inicie o backend ou ajuste a URL em Settings.`
            : `Falha ao carregar: ${failures.join(", ")}.`
        );
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
      setIsBooting(false);
    }
  }, [client, loadThreadsForWorkspace, preferences.selectedModelId, preferences.selectedWorkspacePath, updatePreferences]);

  useEffect(() => {
    let mounted = true;
    void loadPreferences().then((loaded) => {
      if (!mounted) {
        return;
      }
      setPreferences(loaded);
      setIsBooting(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isBooting) {
      void refreshAll();
    }
  }, [isBooting, refreshAll]);

  const refreshThreads = useCallback(async () => {
    if (!selectedWorkspace) {
      return;
    }

    setIsRefreshing(true);
    setError(null);
    try {
      await loadThreadsForWorkspace(selectedWorkspace.path);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
    }
  }, [loadThreadsForWorkspace, selectedWorkspace]);

  const selectWorkspace = useCallback(
    async (workspace: WorkspaceEntry) => {
      setSelectedWorkspaceState(workspace);
      setSelectedThread(null);
      setMessages([]);
      setActivities([]);
      setPendingApprovals([]);
      updatePreferences({ selectedWorkspacePath: workspace.path });
      await loadThreadsForWorkspace(workspace.path);
    },
    [loadThreadsForWorkspace, updatePreferences]
  );

  const selectThread = useCallback((thread: BridgeThread) => {
    setSelectedThread(thread);
    setMessages([]);
    setActivities([]);
    setPendingApprovals([]);
  }, []);

  const createNewThread = useCallback(async () => {
    if (!selectedWorkspace) {
      setError("Nenhum repositorio selecionado.");
      return null;
    }

    setError(null);
    const response = await client.createThread({
      title: "Nova conversa mobile",
      workspace: selectedWorkspace.path
    });
    setThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)]);
    setSelectedThread(response.thread);
    setMessages([]);
    setActivities([]);
    setPendingApprovals([]);
    return response.thread;
  }, [client, selectedWorkspace]);

  const sendMessage = useCallback(
    async (message: string) => {
      const cleanMessage = message.trim();
      if (!cleanMessage || isRunning || !selectedWorkspace) {
        return;
      }

      setError(null);
      setPendingApprovals([]);
      const thread = selectedThread ?? (await createNewThread());
      if (!thread) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createId("user"),
        role: "user",
        text: cleanMessage
      };
      const assistantMessageId = createId("assistant");
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        text: "",
        pending: true
      };

      setMessages((current) => [...current, userMessage, assistantMessage]);
      setIsRunning(true);
      activeRunId.current = null;
      const abortController = new AbortController();
      activeAbortController.current = abortController;

      try {
        const runBody = {
          message: cleanMessage,
          cwd: selectedWorkspace.path,
          model_reasoning_effort: preferences.reasoningEffort,
          approval_policy: preferences.approvalPolicy,
          sandbox_mode: preferences.sandboxMode,
          network_access_enabled: preferences.networkAccessEnabled
        };
        const requestBody =
          preferences.selectedModelId || preferences.serviceTier
            ? {
                ...runBody,
                ...(preferences.selectedModelId ? { model: preferences.selectedModelId } : {}),
                ...(preferences.serviceTier ? { service_tier: preferences.serviceTier } : {})
              }
            : runBody;

        await client.streamRun(
          thread.id,
          requestBody,
          (event) => handleRunEvent(event, assistantMessageId),
          abortController.signal
        );
        await loadThreadsForWorkspace(selectedWorkspace.path);
      } catch (caught) {
        if (!abortController.signal.aborted) {
          setError(errorMessage(caught));
          markAssistantFailed(assistantMessageId, errorMessage(caught));
        }
      } finally {
        setIsRunning(false);
        activeAbortController.current = null;
        activeRunId.current = null;
      }
    },
    [
      client,
      createNewThread,
      isRunning,
      loadThreadsForWorkspace,
      preferences.approvalPolicy,
      preferences.networkAccessEnabled,
      preferences.reasoningEffort,
      preferences.sandboxMode,
      preferences.selectedModelId,
      preferences.serviceTier,
      selectedThread,
      selectedWorkspace
    ]
  );

  const handleRunEvent = useCallback((event: BridgeSseEvent, assistantMessageId: string) => {
    const data = event.data as Record<string, unknown>;

    if (event.event === "run_started") {
      activeRunId.current = asString(data.run_id);
      addOrUpdateActivity({
        id: asString(data.run_id) ?? createId("run"),
        title: "Run iniciada",
        status: "running"
      });
      return;
    }

    if (event.event === "agent_message_delta") {
      const text = asString(data.text) ?? "";
      if (text.length > 0) {
        appendAssistantText(assistantMessageId, text);
      }
      return;
    }

    if (event.event === "agent_message") {
      const text = asString(data.text);
      setMessages((current) =>
        current.map((item) =>
          item.id === assistantMessageId
            ? { ...item, text: text && text.length > 0 ? text : item.text, pending: false }
            : item
        )
      );
      return;
    }

    if (event.event === "tool_start") {
      addOrUpdateActivity({
        id: asString(data.item_id) ?? createId("tool"),
        title: toolTitle(data),
        detail: toolDetail(data),
        status: "running"
      });
      return;
    }

    if (event.event === "tool_end") {
      addOrUpdateActivity({
        id: asString(data.item_id) ?? createId("tool"),
        title: toolTitle(data),
        detail: toolDetail(data),
        status: asString(data.status) === "failed" ? "failed" : "done"
      });
      return;
    }

    if (event.event === "command_output") {
      addOrUpdateActivity({
        id: asString(data.item_id) ?? createId("command"),
        title: "Saida de comando",
        detail: trimMiddle(asString(data.output) ?? "", 180),
        status: "running"
      });
      return;
    }

    if (event.event === "reasoning_summary") {
      const text = asString(data.text) ?? asString(data.summary);
      if (text) {
        addOrUpdateActivity({
          id: asString(data.item_id) ?? createId("reasoning"),
          title: "Raciocinio",
          detail: trimMiddle(text, 180),
          status: "info"
        });
      }
      return;
    }

    if (event.event === "approval_requested") {
      const approval = data as PendingApproval;
      setPendingApprovals((current) => [
        ...current.filter((item) => item.approval_id !== approval.approval_id),
        approval
      ]);
      addOrUpdateActivity({
        id: approval.approval_id,
        title: "Aprovacao pendente",
        detail: approvalSummary(approval),
        status: "running"
      });
      return;
    }

    if (event.event === "file_change") {
      addOrUpdateActivity({
        id: asString(data.item_id) ?? createId("file"),
        title: "Alteracao de arquivo",
        detail: asString(data.status) ?? undefined,
        status: "info"
      });
      return;
    }

    if (event.event === "error") {
      setError(asString(data.message) ?? "Erro no stream.");
      markAssistantFailed(assistantMessageId, asString(data.message) ?? "Erro no stream.");
      return;
    }

    if (event.event === "done") {
      setMessages((current) =>
        current.map((item) => (item.id === assistantMessageId ? { ...item, pending: false } : item))
      );
      addOrUpdateActivity({
        id: asString(data.run_id) ?? activeRunId.current ?? createId("done"),
        title: "Run finalizada",
        detail: asString(data.status) ?? "completed",
        status: asString(data.status) === "failed" ? "failed" : "done"
      });
    }
  }, []);

  const addOrUpdateActivity = useCallback((activity: ActivityItem) => {
    setActivities((current) => {
      const next = current.filter((item) => item.id !== activity.id);
      return [activity, ...next].slice(0, 12);
    });
  }, []);

  const appendAssistantText = useCallback((messageId: string, text: string) => {
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, text: `${item.text}${text}` } : item))
    );
  }, []);

  const markAssistantFailed = useCallback((messageId: string, message: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? { ...item, text: item.text || message, pending: false }
          : item
      )
    );
  }, []);

  const cancelRun = useCallback(async () => {
    activeAbortController.current?.abort();
    if (selectedThread && activeRunId.current) {
      await client.cancelRun(selectedThread.id, activeRunId.current).catch(() => null);
    }
    setIsRunning(false);
  }, [client, selectedThread]);

  const respondApproval = useCallback(
    async (approval: PendingApproval, decision: string) => {
      await client.respondApproval(approval.approval_id, decision);
      setPendingApprovals((current) =>
        current.filter((item) => item.approval_id !== approval.approval_id)
      );
      addOrUpdateActivity({
        id: approval.approval_id,
        title: "Aprovacao respondida",
        detail: decision,
        status: "done"
      });
    },
    [addOrUpdateActivity, client]
  );

  const saveCodexDefaults = useCallback(async () => {
    setError(null);
    try {
      const writes: Promise<unknown>[] = [];
      if (preferences.selectedModelId) {
        writes.push(client.writeConfig("model", preferences.selectedModelId));
      }
      writes.push(client.writeConfig("model_reasoning_effort", preferences.reasoningEffort));
      writes.push(client.writeConfig("approval_policy", preferences.approvalPolicy));
      writes.push(client.writeConfig("sandbox_mode", preferences.sandboxMode));
      writes.push(
        client.writeConfig("sandbox_workspace_write.network_access", preferences.networkAccessEnabled)
      );
      if (preferences.serviceTier) {
        writes.push(client.writeConfig("service_tier", preferences.serviceTier));
      }
      await Promise.all(writes);
      setConfig(await client.readConfig());
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [client, preferences]);

  const value = useMemo<BridgeContextValue>(
    () => ({
      preferences,
      baseUrl: preferences.baseUrl,
      health,
      workspaces,
      allowlistFile,
      threads,
      models,
      config,
      account,
      selectedWorkspace,
      selectedThread,
      selectedModelId: preferences.selectedModelId ?? null,
      reasoningEffort: preferences.reasoningEffort,
      approvalPolicy: preferences.approvalPolicy,
      sandboxMode: preferences.sandboxMode,
      serviceTier: preferences.serviceTier,
      networkAccessEnabled: preferences.networkAccessEnabled,
      messages,
      activities,
      pendingApprovals,
      isBooting,
      isRefreshing,
      isRefreshingAccount,
      isRunning,
      error,
      accountError,
      setBaseUrl: (baseUrl) => updatePreferences({ baseUrl: baseUrl.trim() }),
      setSelectedModelId: (modelId) => updatePreferences({ selectedModelId: modelId }),
      setReasoningEffort: (reasoningEffort) => updatePreferences({ reasoningEffort }),
      setApprovalPolicy: (approvalPolicy) => updatePreferences({ approvalPolicy }),
      setSandboxMode: (sandboxMode) => updatePreferences({ sandboxMode }),
      setServiceTier: (serviceTier) => updatePreferences({ serviceTier }),
      setNetworkAccessEnabled: (networkAccessEnabled) => updatePreferences({ networkAccessEnabled }),
      setExecutionSettings: updatePreferences,
      refreshAll,
      refreshAccount,
      refreshThreads,
      selectWorkspace,
      selectThread,
      createNewThread,
      sendMessage,
      cancelRun,
      respondApproval,
      saveCodexDefaults
    }),
    [
      activities,
      allowlistFile,
      account,
      accountError,
      cancelRun,
      config,
      createNewThread,
      error,
      health,
      isBooting,
      isRefreshingAccount,
      isRefreshing,
      isRunning,
      messages,
      models,
      pendingApprovals,
      preferences,
      refreshAll,
      refreshAccount,
      refreshThreads,
      respondApproval,
      saveCodexDefaults,
      selectThread,
      selectWorkspace,
      sendMessage,
      selectedThread,
      selectedWorkspace,
      threads,
      updatePreferences,
      workspaces
    ]
  );

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

export function useBridge() {
  const context = useContext(BridgeContext);
  if (!context) {
    throw new Error("useBridge must be used within BridgeProvider.");
  }
  return context;
}

function readConfigString(config: CodexConfigResponse | null, key: string) {
  const value = config?.config?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function toolTitle(data: Record<string, unknown>) {
  const kind = asString(data.kind);
  if (kind === "command_execution") {
    return "Comando";
  }
  if (kind === "webSearch" || kind === "web_search") {
    return "Busca web";
  }
  if (kind === "mcpToolCall" || kind === "mcp_tool_call") {
    return asString(data.tool) ?? "Ferramenta MCP";
  }
  return kind ?? "Ferramenta";
}

function toolDetail(data: Record<string, unknown>) {
  const command = data.command;
  if (Array.isArray(command)) {
    return command.join(" ");
  }
  if (typeof command === "string") {
    return command;
  }
  return asString(data.query) ?? asString(data.cwd) ?? undefined;
}

function trimMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
