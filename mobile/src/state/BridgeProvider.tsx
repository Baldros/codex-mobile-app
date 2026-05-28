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
import {
  getCodexMobileBuildConfig,
  validateSshTunnelBuildConfig,
  type CodexMobileBuildConfig
} from "../config/mobileBuildConfig";
import type {
  ActivityItem,
  ApprovalPolicy,
  BridgeCapabilities,
  BridgeHealth,
  BridgePreferences,
  BridgeRunSummary,
  BridgeSseEvent,
  BridgeThread,
  CodexAccountResponse,
  ChatMessage,
  CodexConfigResponse,
  CodexModel,
  PendingApproval,
  ReasoningEffort,
  SandboxMode,
  ThreadArchiveResponse,
  WorkspaceMutationResponse,
  WorkspaceEntry
} from "../domain/bridge";
import { loadPreferences, savePreferences } from "../storage/preferences";
import { SshTunnelManager, type TunnelStatusSnapshot } from "../transport/SshTunnelManager";

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
  capabilities: BridgeCapabilities;
  buildConfig: CodexMobileBuildConfig;
  tunnelConfigIssue: string | null;
  tunnelStatus: TunnelStatusSnapshot;
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
  activeRuns: BridgeRunSummary[];
  runningThreadId: string | null;
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
  refreshWorkspaces: () => Promise<void>;
  refreshThreads: () => Promise<void>;
  selectWorkspace: (workspace: WorkspaceEntry) => Promise<void>;
  selectThread: (thread: BridgeThread) => Promise<void>;
  renameThread: (thread: BridgeThread, title: string) => Promise<BridgeThread | null>;
  archiveThread: (thread: BridgeThread) => Promise<ThreadArchiveResponse | null>;
  restoreThread: (thread: BridgeThread) => Promise<ThreadArchiveResponse | null>;
  removeWorkspace: (workspace: WorkspaceEntry) => Promise<WorkspaceMutationResponse | null>;
  restoreWorkspace: (path: string) => Promise<WorkspaceMutationResponse | null>;
  createNewThread: () => Promise<BridgeThread | null>;
  sendMessage: (message: string) => Promise<void>;
  cancelRun: () => Promise<void>;
  respondApproval: (approval: PendingApproval, decision: string) => Promise<void>;
  saveCodexDefaults: () => Promise<void>;
};

const BridgeContext = createContext<BridgeContextValue | null>(null);

const DEFAULT_CAPABILITIES: BridgeCapabilities = {
  threads: {
    rename: false,
    archive: false
  },
  workspaces: {
    remove: false,
    restore: false
  }
};

export function BridgeProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState<BridgePreferences>(DEFAULT_PREFERENCES);
  const [health, setHealth] = useState<BridgeHealth | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [allowlistFile, setAllowlistFile] = useState<string | null>(null);
  const [threads, setThreads] = useState<BridgeThread[]>([]);
  const [models, setModels] = useState<CodexModel[]>([]);
  const [config, setConfig] = useState<CodexConfigResponse | null>(null);
  const [account, setAccount] = useState<CodexAccountResponse | null>(null);
  const [capabilities, setCapabilities] = useState<BridgeCapabilities>(DEFAULT_CAPABILITIES);
  const [selectedWorkspace, setSelectedWorkspaceState] = useState<WorkspaceEntry | null>(null);
  const [selectedThread, setSelectedThread] = useState<BridgeThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [activeRuns, setActiveRuns] = useState<BridgeRunSummary[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const activeAbortController = useRef<AbortController | null>(null);
  const activeRunId = useRef<string | null>(null);
  const activeRunThreadId = useRef<string | null>(null);
  const attachedRunId = useRef<string | null>(null);
  const detachedAbortControllers = useRef(new Set<AbortController>());
  const buildConfig = useMemo(() => getCodexMobileBuildConfig(), []);
  const tunnelConfigIssue = useMemo(
    () => validateSshTunnelBuildConfig(buildConfig),
    [buildConfig]
  );
  const tunnelManager = useMemo(() => new SshTunnelManager(buildConfig), [buildConfig]);
  const [tunnelStatus, setTunnelStatus] = useState<TunnelStatusSnapshot>(
    tunnelManager.getSnapshot()
  );
  const shouldUseEmbeddedTunnel =
    buildConfig.gateway === "ssh_tunnel" &&
    normalizeUrl(preferences.baseUrl) === normalizeUrl(buildConfig.sshTunnel.localUrl);

  const client = useMemo(
    () =>
      new BridgeClient(preferences.baseUrl, {
        ensureTransportReady: shouldUseEmbeddedTunnel
          ? () => tunnelManager.ensureReady()
          : undefined
      }),
    [preferences.baseUrl, shouldUseEmbeddedTunnel, tunnelManager]
  );

  useEffect(() => tunnelManager.subscribe(setTunnelStatus), [tunnelManager]);

  const updatePreferences = useCallback((patch: Partial<BridgePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      void savePreferences(next);
      return next;
    });
  }, []);

  const detachActiveStream = useCallback(() => {
    const controller = activeAbortController.current;
    if (!controller) {
      return;
    }

    detachedAbortControllers.current.add(controller);
    controller.abort();
    activeAbortController.current = null;
    attachedRunId.current = null;
  }, []);

  const loadThreadContent = useCallback(
    async (thread: BridgeThread | null) => {
      if (!thread) {
        setMessages([]);
        setActivities([]);
        setPendingApprovals([]);
        return null;
      }

      try {
        const response = await client.getThread(thread.id, { includeTurns: true });
        setSelectedThread(response.thread);
        setMessages(messagesFromThread(response.thread));
        return response.thread;
      } catch {
        setMessages(messagesFromThread(thread));
        return thread;
      }
    },
    [client]
  );

  const loadThreadsForWorkspace = useCallback(
    async (workspacePath: string, preferredThreadId?: string | null) => {
      const response = await client.listThreads({ cwd: workspacePath, limit: 30 });
      setThreads(response.data);

      const nextThread =
        response.data.find((thread) => thread.id === preferredThreadId) ??
        response.data.find((thread) => thread.id === selectedThread?.id) ??
        response.data[0] ??
        null;

      setSelectedThread(nextThread);
      updatePreferences({ selectedThreadId: nextThread?.id ?? null });
      await loadThreadContent(nextThread);
      return response.data;
    },
    [client, loadThreadContent, selectedThread?.id, updatePreferences]
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
      const [
        healthResult,
        workspaceResult,
        modelResult,
        configResult,
        accountResult,
        capabilitiesResult,
        activeRunsResult
      ] = await Promise.allSettled([
        client.health(),
        client.listWorkspaces(),
        client.listModels(),
        client.readConfig(),
        client.readAccount(),
        client.capabilities(),
        client.listActiveRuns()
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
      setCapabilities(
        capabilitiesResult.status === "fulfilled" ? capabilitiesResult.value : DEFAULT_CAPABILITIES
      );
      if (activeRunsResult.status === "fulfilled") {
        setActiveRuns(activeRunsResult.value.data);
        setIsRunning(activeRunsResult.value.data.length > 0);
      } else {
        setActiveRuns([]);
        setIsRunning(false);
      }
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
        await loadThreadsForWorkspace(workspace.path, preferences.selectedThreadId);
      } else {
        setThreads([]);
        setSelectedThread(null);
        setMessages([]);
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
            ? `Bridge unavailable at ${preferences.baseUrl}. Start the backend or adjust the URL in Settings.`
            : `Failed to load: ${failures.join(", ")}.`
        );
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
      setIsBooting(false);
    }
  }, [
    client,
    loadThreadsForWorkspace,
    preferences.selectedModelId,
    preferences.selectedThreadId,
    preferences.selectedWorkspacePath,
    updatePreferences
  ]);

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

  const refreshWorkspaces = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const response = await client.listWorkspaces();
      setWorkspaces(response.data);
      setAllowlistFile(response.allowlist_file);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
    }
  }, [client]);

  const refreshThreads = useCallback(async () => {
    if (!selectedWorkspace) {
      return;
    }

    setIsRefreshing(true);
    setError(null);
    try {
      await loadThreadsForWorkspace(selectedWorkspace.path, selectedThread?.id);
      const active = await client.listActiveRuns();
      setActiveRuns(active.data);
      setIsRunning(active.data.length > 0);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
    }
  }, [client, loadThreadsForWorkspace, selectedThread?.id, selectedWorkspace]);

  const selectWorkspace = useCallback(
    async (workspace: WorkspaceEntry) => {
      detachActiveStream();
      setSelectedWorkspaceState(workspace);
      setSelectedThread(null);
      setMessages([]);
      setActivities([]);
      setPendingApprovals([]);
      updatePreferences({ selectedWorkspacePath: workspace.path, selectedThreadId: null });
      await loadThreadsForWorkspace(workspace.path, null);
      const active = await client.listActiveRuns();
      setActiveRuns(active.data);
      setIsRunning(active.data.length > 0);
    },
    [client, detachActiveStream, loadThreadsForWorkspace, updatePreferences]
  );

  const selectThread = useCallback(async (thread: BridgeThread) => {
    detachActiveStream();
    setSelectedThread(thread);
    setMessages([]);
    setActivities([]);
    setPendingApprovals([]);
    updatePreferences({ selectedThreadId: thread.id });
    await loadThreadContent(thread);
    const active = await client.listActiveRuns({ threadId: thread.id });
    setActiveRuns((current) => [
      ...active.data,
      ...current.filter((run) => run.thread_id !== thread.id)
    ]);
    setIsRunning(active.data.length > 0 || activeRuns.some((run) => run.thread_id !== thread.id));
  }, [activeRuns, client, detachActiveStream, loadThreadContent, updatePreferences]);

  const renameThread = useCallback(
    async (thread: BridgeThread, title: string) => {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        return null;
      }

      setError(null);
      try {
        const response = await client.renameThread(thread.id, cleanTitle);
        setThreads((current) =>
          current.map((item) => (item.id === response.thread.id ? response.thread : item))
        );
        setSelectedThread((current) =>
          current?.id === response.thread.id ? response.thread : current
        );
        return response.thread;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [client]
  );

  const archiveThread = useCallback(
    async (thread: BridgeThread) => {
      setError(null);
      try {
        const response = await client.archiveThread(thread.id, true);
        if (response.supported && response.archived) {
          setThreads((current) => current.filter((item) => item.id !== thread.id));
          if (selectedThread?.id === thread.id) {
            setMessages([]);
            setActivities([]);
            setPendingApprovals([]);
          }
          setSelectedThread((current) => {
            if (current?.id !== thread.id) {
              return current;
            }
            const next = threads.find((item) => item.id !== thread.id) ?? null;
            updatePreferences({ selectedThreadId: next?.id ?? null });
            return next;
          });
        } else if (response.reason) {
          setError(response.reason);
        }
        return response;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [client, selectedThread?.id, threads, updatePreferences]
  );

  const restoreThread = useCallback(
    async (thread: BridgeThread) => {
      setError(null);
      try {
        const response = await client.archiveThread(thread.id, false);
        if (response.supported) {
          if (response.thread) {
            setThreads((current) => [
              response.thread!,
              ...current.filter((item) => item.id !== response.thread!.id)
            ]);
          }
          await refreshThreads();
        } else if (response.reason) {
          setError(response.reason);
        }
        return response;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [client, refreshThreads]
  );

  const removeWorkspace = useCallback(
    async (workspace: WorkspaceEntry) => {
      setError(null);
      try {
        const response = await client.removeWorkspace(workspace.path);
        if (response.supported && response.removed) {
          const workspaceResponse = await client.listWorkspaces();
          setWorkspaces(workspaceResponse.data);
          setAllowlistFile(workspaceResponse.allowlist_file);

          if (selectedWorkspace?.path === workspace.path) {
            const next =
              workspaceResponse.data.find((entry) => entry.exists) ??
              workspaceResponse.data[0] ??
              null;
            setSelectedWorkspaceState(next);
            updatePreferences({ selectedWorkspacePath: next?.path ?? null, selectedThreadId: null });
            setMessages([]);
            setActivities([]);
            setPendingApprovals([]);
            if (next) {
              await loadThreadsForWorkspace(next.path, null);
            } else {
              setThreads([]);
              setSelectedThread(null);
            }
          }
        } else if (response.reason) {
          setError(response.reason);
        }
        return response;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [client, loadThreadsForWorkspace, selectedWorkspace?.path, updatePreferences]
  );

  const restoreWorkspace = useCallback(
    async (path: string) => {
      setError(null);
      try {
        const response = await client.restoreWorkspace(path);
        if (response.supported) {
          await refreshWorkspaces();
        } else if (response.reason) {
          setError(response.reason);
        }
        return response;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [client, refreshWorkspaces]
  );

  const createNewThread = useCallback(async () => {
    if (!selectedWorkspace) {
      setError("No repository selected.");
      return null;
    }

    setError(null);
    const response = await client.createThread({
      title: "New mobile conversation",
      workspace: selectedWorkspace.path
    });
    setThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)]);
    setSelectedThread(response.thread);
    updatePreferences({ selectedThreadId: response.thread.id });
    setMessages([]);
    setActivities([]);
    setPendingApprovals([]);
    return response.thread;
  }, [client, selectedWorkspace, updatePreferences]);

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
      activeRunThreadId.current = thread.id;
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
        await loadThreadsForWorkspace(selectedWorkspace.path, thread.id);
      } catch (caught) {
        if (!abortController.signal.aborted) {
          setError(errorMessage(caught));
          markAssistantFailed(assistantMessageId, errorMessage(caught));
        }
      } finally {
        const detached = detachedAbortControllers.current.delete(abortController);
        if (!detached) {
          setIsRunning(false);
          activeAbortController.current = null;
          activeRunId.current = null;
          activeRunThreadId.current = null;
          attachedRunId.current = null;
        }
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
      const runId = asString(data.run_id);
      const threadId = asString(data.thread_id) ?? activeRunThreadId.current;
      activeRunId.current = runId;
      activeRunThreadId.current = threadId;
      if (runId && threadId) {
        setActiveRuns((current) => [
          {
            run_id: runId,
            thread_id: threadId,
            status: "running",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_event_seq: asNumber(data.event_seq) ?? 0
          },
          ...current.filter((run) => run.run_id !== runId)
        ]);
      }
      setIsRunning(true);
      addOrUpdateActivity({
        id: runId ?? createId("run"),
        title: "Run started",
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
        title: "Command output",
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
          title: "Reasoning",
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
        title: "Approval pending",
        detail: approvalSummary(approval),
        status: "running"
      });
      return;
    }

    if (event.event === "file_change") {
      addOrUpdateActivity({
        id: asString(data.item_id) ?? createId("file"),
        title: "File change",
        detail: asString(data.status) ?? undefined,
        status: "info"
      });
      return;
    }

    if (event.event === "error") {
      setError(asString(data.message) ?? "Stream error.");
      markAssistantFailed(assistantMessageId, asString(data.message) ?? "Stream error.");
      return;
    }

    if (event.event === "done") {
      const runId = asString(data.run_id) ?? activeRunId.current;
      setMessages((current) =>
        current.map((item) => (item.id === assistantMessageId ? { ...item, pending: false } : item))
      );
      if (runId) {
        setActiveRuns((current) => current.filter((run) => run.run_id !== runId));
      }
      setIsRunning(false);
      activeRunId.current = null;
      activeRunThreadId.current = null;
      attachedRunId.current = null;
      addOrUpdateActivity({
        id: runId ?? createId("done"),
        title: "Run finished",
        detail: asString(data.status) ?? "completed",
        status: asString(data.status) === "failed" ? "failed" : "done"
      });
    }
  }, []);

  useEffect(() => {
    const run = activeRuns.find(
      (item) => item.thread_id === selectedThread?.id && isActiveRunStatus(item.status)
    );
    if (!run || attachedRunId.current === run.run_id) {
      return;
    }

    const assistantMessageId = `assistant_${run.run_id}`;
    setMessages((current) =>
      current.some((item) => item.id === assistantMessageId)
        ? current
        : [...current, { id: assistantMessageId, role: "assistant", text: "", pending: true }]
    );

    const abortController = new AbortController();
    activeAbortController.current = abortController;
    activeRunId.current = run.run_id;
    activeRunThreadId.current = run.thread_id;
    attachedRunId.current = run.run_id;
    setIsRunning(true);

    void client
      .streamRunEvents(
        run.run_id,
        (event) => handleRunEvent(event, assistantMessageId),
        abortController.signal,
        0
      )
      .catch((caught) => {
        if (!abortController.signal.aborted) {
          setError(errorMessage(caught));
          markAssistantFailed(assistantMessageId, errorMessage(caught));
        }
      })
      .finally(() => {
        const detached = detachedAbortControllers.current.delete(abortController);
        if (!detached && activeRunId.current === run.run_id) {
          activeAbortController.current = null;
          activeRunId.current = null;
          activeRunThreadId.current = null;
          attachedRunId.current = null;
        }
      });

    return () => {
      detachedAbortControllers.current.add(abortController);
      abortController.abort();
      if (activeAbortController.current === abortController) {
        activeAbortController.current = null;
      }
      if (attachedRunId.current === run.run_id) {
        attachedRunId.current = null;
      }
    };
  }, [activeRuns, client, handleRunEvent, selectedThread?.id]);

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
    const selectedRun =
      activeRuns.find((run) => run.thread_id === selectedThread?.id) ??
      activeRuns[0] ??
      null;
    const threadId = selectedRun?.thread_id ?? activeRunThreadId.current ?? selectedThread?.id;
    const runId = selectedRun?.run_id ?? activeRunId.current;

    activeAbortController.current?.abort();
    if (threadId && runId) {
      await client.cancelRun(threadId, runId).catch(() => null);
    }
    if (runId) {
      setActiveRuns((current) => current.filter((run) => run.run_id !== runId));
    }
    setIsRunning(false);
    activeRunId.current = null;
    activeRunThreadId.current = null;
    attachedRunId.current = null;
  }, [activeRuns, client, selectedThread?.id]);

  const respondApproval = useCallback(
    async (approval: PendingApproval, decision: string) => {
      await client.respondApproval(approval.approval_id, decision);
      setPendingApprovals((current) =>
        current.filter((item) => item.approval_id !== approval.approval_id)
      );
      addOrUpdateActivity({
        id: approval.approval_id,
        title: "Approval answered",
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
      capabilities,
      buildConfig,
      tunnelConfigIssue,
      tunnelStatus,
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
      activeRuns,
      runningThreadId: activeRuns[0]?.thread_id ?? activeRunThreadId.current,
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
      refreshWorkspaces,
      refreshThreads,
      selectWorkspace,
      selectThread,
      renameThread,
      archiveThread,
      restoreThread,
      removeWorkspace,
      restoreWorkspace,
      createNewThread,
      sendMessage,
      cancelRun,
      respondApproval,
      saveCodexDefaults
    }),
    [
      activities,
      activeRuns,
      allowlistFile,
      account,
      accountError,
      archiveThread,
      buildConfig,
      cancelRun,
      capabilities,
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
      refreshWorkspaces,
      refreshThreads,
      removeWorkspace,
      renameThread,
      respondApproval,
      restoreThread,
      restoreWorkspace,
      saveCodexDefaults,
      selectThread,
      selectWorkspace,
      sendMessage,
      selectedThread,
      selectedWorkspace,
      tunnelStatus,
      tunnelConfigIssue,
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

function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isActiveRunStatus(status: string) {
  return status === "starting" || status === "running" || status === "waiting_approval";
}

function messagesFromThread(thread: BridgeThread) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const messages: ChatMessage[] = [];

  for (const turn of turns) {
    const record = asRecord(turn);
    if (!record) {
      continue;
    }

    for (const text of textEntries(record.input ?? record.userInput ?? record.prompt)) {
      messages.push({
        id: createId("history_user"),
        role: "user",
        text
      });
    }

    const items = arrayValue(record.items ?? record.output ?? record.responses);
    for (const item of items) {
      const itemRecord = asRecord(item);
      if (!itemRecord) {
        continue;
      }

      const role = asString(itemRecord.role);
      const type = asString(itemRecord.type);
      const text = firstText(itemRecord.text, itemRecord.content, itemRecord.message);
      if (!text) {
        continue;
      }

      if (role === "user" || type === "userMessage") {
        messages.push({ id: createId("history_user"), role: "user", text });
      } else if (role === "assistant" || type === "agentMessage" || type === "assistantMessage") {
        messages.push({ id: createId("history_assistant"), role: "assistant", text });
      }
    }

    const assistantText = firstText(
      record.assistantMessage,
      record.response,
      record.outputText,
      record.finalMessage
    );
    if (assistantText) {
      messages.push({
        id: createId("history_assistant"),
        role: "assistant",
        text: assistantText
      });
    }
  }

  return messages;
}

function textEntries(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const direct = firstText(item);
      return direct ? [direct] : [];
    });
  }

  const text = firstText(value);
  return text ? [text] : [];
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (Array.isArray(value)) {
      const nested = firstText(...value);
      if (nested) {
        return nested;
      }
    }

    const record = asRecord(value);
    if (!record) {
      continue;
    }

    for (const key of ["text", "content", "value"]) {
      const nested = record[key];
      if (typeof nested === "string" && nested.trim()) {
        return nested;
      }
    }
  }

  return null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function toolTitle(data: Record<string, unknown>) {
  const kind = asString(data.kind);
  if (kind === "command_execution") {
    return "Command";
  }
  if (kind === "webSearch" || kind === "web_search") {
    return "Web search";
  }
  if (kind === "mcpToolCall" || kind === "mcp_tool_call") {
    return asString(data.tool) ?? "MCP tool";
  }
  return kind ?? "Tool";
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
