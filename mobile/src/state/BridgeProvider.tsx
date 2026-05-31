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
  CodexApp,
  ChatMessage,
  ChatMessagePart,
  CodexConfigResponse,
  CodexModel,
  CodexSkill,
  McpResourceReadResponse,
  McpServerStatus,
  PendingApproval,
  ReasoningEffort,
  RunInputItem,
  SandboxMode,
  ThreadArchiveResponse,
  WorkspaceMutationResponse,
  WorkspaceEntry
} from "../domain/bridge";
import {
  appendActivityOutputPart,
  appendTextPart,
  answerApprovalPart,
  completePendingParts,
  completeTextPart,
  failAssistantMessage,
  upsertActivityPart,
  upsertApprovalPart
} from "../domain/chatMessageParts";
import { messagesFromThread } from "../domain/threadHistory";
import { loadPreferences, savePreferences } from "../storage/preferences";
import { SshTunnelManager, type TunnelStatusSnapshot } from "../transport/SshTunnelManager";
import { asNumber, asString, createId, errorMessage, lowerString, normalizeUrl, trimMiddle } from "../utils/value";

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
  apps: CodexApp[];
  skills: CodexSkill[];
  mcpServers: McpServerStatus[];
  mcpResource: McpResourceReadResponse | null;
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
  isRefreshingMentions: boolean;
  isRefreshingMcp: boolean;
  isLoadingThreadContent: boolean;
  isRunning: boolean;
  error: string | null;
  accountError: string | null;
  mentionError: string | null;
  mcpError: string | null;
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
  refreshMentions: () => Promise<void>;
  refreshMcpServers: () => Promise<void>;
  readMcpResource: (server: string, uri: string) => Promise<void>;
  reloadMcpServers: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  refreshThreads: () => Promise<void>;
  selectWorkspace: (workspace: WorkspaceEntry) => Promise<void>;
  selectThread: (thread: BridgeThread) => Promise<void>;
  renameThread: (thread: BridgeThread, title: string) => Promise<BridgeThread | null>;
  archiveThread: (thread: BridgeThread) => Promise<ThreadArchiveResponse | null>;
  restoreThread: (thread: BridgeThread) => Promise<ThreadArchiveResponse | null>;
  removeWorkspace: (workspace: WorkspaceEntry) => Promise<WorkspaceMutationResponse | null>;
  restoreWorkspace: (path: string) => Promise<WorkspaceMutationResponse | null>;
  createNewThread: () => Promise<void>;
  sendMessage: (message: string, inputItems?: RunInputItem[]) => Promise<void>;
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
  mcp: {
    list: false,
    read: false,
    reload: false
  },
  apps: {
    list: false
  },
  skills: {
    list: false
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
  const [apps, setApps] = useState<CodexApp[]>([]);
  const [skills, setSkills] = useState<CodexSkill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerStatus[]>([]);
  const [mcpResource, setMcpResource] = useState<McpResourceReadResponse | null>(null);
  const [capabilities, setCapabilities] = useState<BridgeCapabilities>(DEFAULT_CAPABILITIES);
  const [selectedWorkspace, setSelectedWorkspaceState] = useState<WorkspaceEntry | null>(null);
  const [selectedThread, setSelectedThreadState] = useState<BridgeThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [activeRuns, setActiveRuns] = useState<BridgeRunSummary[]>([]);
  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [isRefreshingMentions, setIsRefreshingMentions] = useState(false);
  const [isRefreshingMcp, setIsRefreshingMcp] = useState(false);
  const [isLoadingThreadContent, setIsLoadingThreadContent] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const preferencesRef = useRef<BridgePreferences>(DEFAULT_PREFERENCES);
  const selectedThreadRef = useRef<BridgeThread | null>(null);
  const threadContentRequestId = useRef(0);
  const composingNewThreadRef = useRef(false);
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

  const setSelectedThread = useCallback((thread: BridgeThread | null) => {
    selectedThreadRef.current = thread;
    setSelectedThreadState(thread);
  }, []);

  const nextThreadContentRequest = useCallback(() => {
    threadContentRequestId.current += 1;
    return threadContentRequestId.current;
  }, []);

  const isCurrentThreadContentRequest = useCallback(
    (requestId: number) => requestId === threadContentRequestId.current,
    []
  );

  const updatePreferences = useCallback((patch: Partial<BridgePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      preferencesRef.current = next;
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
    async (thread: BridgeThread | null, requestId = nextThreadContentRequest()) => {
      if (!thread) {
        if (isCurrentThreadContentRequest(requestId)) {
          setIsLoadingThreadContent(false);
          setMessages([]);
          setActivities([]);
          setPendingApprovals([]);
        }
        return null;
      }

      if (isCurrentThreadContentRequest(requestId)) {
        setIsLoadingThreadContent(true);
      }
      try {
        const response = await client.getThread(thread.id, { includeTurns: true });
        if (isCurrentThreadContentRequest(requestId)) {
          setSelectedThread(response.thread);
          setMessages(messagesFromThread(response.thread));
        }
        return response.thread;
      } catch {
        if (isCurrentThreadContentRequest(requestId)) {
          setMessages(messagesFromThread(thread));
        }
        return thread;
      } finally {
        if (isCurrentThreadContentRequest(requestId)) {
          setIsLoadingThreadContent(false);
        }
      }
    },
    [client, isCurrentThreadContentRequest, nextThreadContentRequest, setSelectedThread]
  );

  const loadThreadsForWorkspace = useCallback(
    async (workspacePath: string, preferredThreadId?: string | null) => {
      const requestId = nextThreadContentRequest();
      const response = await client.listThreads({ cwd: workspacePath, limit: 30 });
      if (!isCurrentThreadContentRequest(requestId)) {
        return response.data;
      }

      setThreads(response.data);

      const requestedThreadId =
        preferredThreadId === undefined ? preferencesRef.current.selectedThreadId : preferredThreadId;
      const currentThreadId = selectedThreadRef.current?.id ?? null;
      const nextThread =
        composingNewThreadRef.current
          ? null
          : response.data.find((thread) => thread.id === requestedThreadId) ??
            response.data.find((thread) => thread.id === currentThreadId) ??
            response.data[0] ??
            null;

      setSelectedThread(nextThread);
      updatePreferences({ selectedThreadId: nextThread?.id ?? null });
      await loadThreadContent(nextThread, requestId);
      return response.data;
    },
    [
      client,
      isCurrentThreadContentRequest,
      loadThreadContent,
      nextThreadContentRequest,
      setSelectedThread,
      updatePreferences
    ]
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

  const refreshMcpServers = useCallback(async () => {
    setIsRefreshingMcp(true);
    setMcpError(null);

    try {
      const response = await client.listMcpServers({ detail: "full", limit: 50 });
      setMcpServers(response.data);
    } catch (caught) {
      setMcpServers([]);
      setMcpError(errorMessage(caught));
    } finally {
      setIsRefreshingMcp(false);
    }
  }, [client]);

  const readMcpResource = useCallback(
    async (server: string, uri: string) => {
      setIsRefreshingMcp(true);
      setMcpError(null);

      try {
        const response = await client.readMcpResource({
          server,
          uri,
          threadId: selectedThreadRef.current?.id ?? null
        });
        setMcpResource(response);
      } catch (caught) {
        setMcpResource(null);
        setMcpError(errorMessage(caught));
      } finally {
        setIsRefreshingMcp(false);
      }
    },
    [client]
  );

  const reloadMcpServers = useCallback(async () => {
    setIsRefreshingMcp(true);
    setMcpError(null);

    try {
      await client.reloadMcpServers();
      const response = await client.listMcpServers({ detail: "full", limit: 50 });
      setMcpServers(response.data);
    } catch (caught) {
      setMcpError(errorMessage(caught));
    } finally {
      setIsRefreshingMcp(false);
    }
  }, [client]);

  const refreshMentions = useCallback(async () => {
    setIsRefreshingMentions(true);
    setMentionError(null);

    let currentCapabilities: BridgeCapabilities;
    try {
      currentCapabilities = await client.capabilities();
      setCapabilities(currentCapabilities);
    } catch (caught) {
      setApps([]);
      setSkills([]);
      setMcpServers([]);
      setMentionError(`capabilities: ${errorMessage(caught)}`);
      setIsRefreshingMentions(false);
      return;
    }

    const supportsApps = currentCapabilities.apps?.list === true;
    const supportsSkills = currentCapabilities.skills?.list === true;
    const supportsMcp = currentCapabilities.mcp?.list === true;

    if (!supportsApps && !supportsSkills && !supportsMcp) {
      setApps([]);
      setSkills([]);
      setMcpServers([]);
      setMentionError("Current bridge does not expose apps, skills, or MCP routes. Restart the updated backend.");
      setIsRefreshingMentions(false);
      return;
    }

    const cwd = selectedWorkspace?.path;
    const threadId = selectedThreadRef.current?.id ?? null;
    const [appsResult, skillsResult, mcpResult] = await Promise.allSettled([
      supportsApps ? client.listApps({ limit: 50, threadId }) : Promise.resolve(null),
      supportsSkills ? client.listSkills({ ...(cwd ? { cwd } : {}), forceReload: false }) : Promise.resolve(null),
      supportsMcp ? client.listMcpServers({ detail: "full", limit: 50 }) : Promise.resolve(null)
    ]);

    if (appsResult.status === "fulfilled" && appsResult.value) {
      setApps(appsResult.value.data.filter((app) => app.isAccessible !== false && app.isEnabled !== false));
    } else {
      setApps([]);
    }

    if (skillsResult.status === "fulfilled" && skillsResult.value) {
      setSkills(
        skillsResult.value.data
          .flatMap((entry) => entry.skills)
          .filter((skill) => skill.enabled !== false)
      );
    } else {
      setSkills([]);
    }

    if (mcpResult.status === "fulfilled" && mcpResult.value) {
      setMcpServers(mcpResult.value.data);
    } else {
      setMcpServers([]);
    }

    const failures = [
      supportsApps && appsResult.status === "rejected" ? `apps: ${errorMessage(appsResult.reason)}` : null,
      supportsSkills && skillsResult.status === "rejected" ? `skills: ${errorMessage(skillsResult.reason)}` : null,
      supportsMcp && mcpResult.status === "rejected" ? `mcp: ${errorMessage(mcpResult.reason)}` : null
    ].filter((item): item is string => Boolean(item));
    const hasLoadedMentionSource =
      (supportsApps && appsResult.status === "fulfilled") ||
      (supportsSkills && skillsResult.status === "fulfilled") ||
      (supportsMcp && mcpResult.status === "fulfilled");

    setMentionError(failures.length > 0 && !hasLoadedMentionSource ? failures.join("; ") : null);
    setIsRefreshingMentions(false);
  }, [client, selectedWorkspace?.path]);

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

      const currentPreferences = preferencesRef.current;
      const workspace =
        workspaceResponse?.data.find((entry) => entry.path === currentPreferences.selectedWorkspacePath) ??
        workspaceResponse?.data.find((entry) => entry.exists) ??
        workspaceResponse?.data[0] ??
        null;

      setSelectedWorkspaceState(workspace);
      if (workspace) {
        updatePreferences({ selectedWorkspacePath: workspace.path });
        await loadThreadsForWorkspace(workspace.path, currentPreferences.selectedThreadId);
      } else {
        setThreads([]);
        setSelectedThread(null);
        setMessages([]);
      }

      const configModel = readConfigString(configResponse, "model");
      const defaultModel = modelResponse?.data.find((model) => model.isDefault)?.id;
      const modelId = currentPreferences.selectedModelId ?? configModel ?? defaultModel ?? modelResponse?.data[0]?.id;
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
            ? `Bridge unavailable at ${currentPreferences.baseUrl}. Start the backend or adjust the URL in Settings.`
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
    setSelectedThread,
    updatePreferences
  ]);

  useEffect(() => {
    let mounted = true;
    void loadPreferences().then((loaded) => {
      if (!mounted) {
        return;
      }
      preferencesRef.current = loaded;
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
      composingNewThreadRef.current = false;
      nextThreadContentRequest();
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
    [client, detachActiveStream, loadThreadsForWorkspace, nextThreadContentRequest, setSelectedThread, updatePreferences]
  );

  const selectThread = useCallback(async (thread: BridgeThread) => {
    composingNewThreadRef.current = false;
    nextThreadContentRequest();
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
  }, [
    activeRuns,
    client,
    detachActiveStream,
    loadThreadContent,
    nextThreadContentRequest,
    setSelectedThread,
    updatePreferences
  ]);

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
        setSelectedThreadState((current) => {
          const next = current?.id === response.thread.id ? response.thread : current;
          selectedThreadRef.current = next;
          return next;
        });
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
          setSelectedThreadState((current) => {
            if (current?.id !== thread.id) {
              return current;
            }
            const next = threads.find((item) => item.id !== thread.id) ?? null;
            selectedThreadRef.current = next;
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
            composingNewThreadRef.current = false;
            nextThreadContentRequest();
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
    [
      client,
      loadThreadsForWorkspace,
      nextThreadContentRequest,
      selectedWorkspace?.path,
      setSelectedThread,
      updatePreferences
    ]
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
      return;
    }

    composingNewThreadRef.current = true;
    nextThreadContentRequest();
    detachActiveStream();
    setError(null);
    setSelectedThread(null);
    updatePreferences({ selectedThreadId: null });
    setIsLoadingThreadContent(false);
    setMessages([]);
    setActivities([]);
    setPendingApprovals([]);
  }, [detachActiveStream, nextThreadContentRequest, selectedWorkspace, setSelectedThread, updatePreferences]);

  const createPersistedThread = useCallback(async () => {
    if (!selectedWorkspace) {
      setError("No repository selected.");
      return null;
    }

    const requestId = nextThreadContentRequest();
    setError(null);

    try {
      const response = await client.createThread({
        title: "New mobile conversation",
        workspace: selectedWorkspace.path
      });
      if (!isCurrentThreadContentRequest(requestId)) {
        return null;
      }
      composingNewThreadRef.current = false;
      setThreads((current) => [response.thread, ...current.filter((thread) => thread.id !== response.thread.id)]);
      setSelectedThread(response.thread);
      updatePreferences({ selectedThreadId: response.thread.id });
      return response.thread;
    } catch (caught) {
      if (isCurrentThreadContentRequest(requestId)) {
        setError(errorMessage(caught));
      }
      return null;
    }
  }, [
    client,
    isCurrentThreadContentRequest,
    nextThreadContentRequest,
    selectedWorkspace,
    setSelectedThread,
    updatePreferences
  ]);

  const sendMessage = useCallback(
    async (message: string, inputItems: RunInputItem[] = []) => {
      const cleanMessage = message.trim();
      if (!cleanMessage || isRunning || !selectedWorkspace) {
        return;
      }

      setError(null);
      setPendingApprovals([]);
      const thread = selectedThreadRef.current ?? (await createPersistedThread());
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
        parts: [],
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
          network_access_enabled: preferences.networkAccessEnabled,
          ...(inputItems.length > 0 ? { input_items: inputItems } : {})
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
      createPersistedThread,
      isRunning,
      loadThreadsForWorkspace,
      preferences.approvalPolicy,
      preferences.networkAccessEnabled,
      preferences.reasoningEffort,
      preferences.sandboxMode,
      preferences.selectedModelId,
      preferences.serviceTier,
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
        appendAssistantText(assistantMessageId, text, asString(data.item_id));
      }
      return;
    }

    if (event.event === "agent_message") {
      const text = asString(data.text);
      completeAssistantText(assistantMessageId, text, asString(data.item_id));
      return;
    }

    if (event.event === "tool_start") {
      const activity = {
        id: asString(data.item_id) ?? createId("tool"),
        title: toolTitle(data),
        detail: toolDetail(data),
        status: "running"
      } as const;
      addOrUpdateActivity(activity);
      addOrUpdateAssistantActivity(assistantMessageId, activity);
      return;
    }

    if (event.event === "tool_end") {
      const activity = {
        id: asString(data.item_id) ?? createId("tool"),
        title: toolTitle(data),
        detail: toolDetail(data),
        status: isFailedStatus(data.status) ? "failed" : "done"
      } as const;
      addOrUpdateActivity(activity);
      addOrUpdateAssistantActivity(assistantMessageId, activity);
      return;
    }

    if (event.event === "command_output") {
      const activity = {
        id: asString(data.item_id) ?? createId("command"),
        title: "Command output",
        detail: trimMiddle(asString(data.output) ?? "", 180),
        status: "running"
      } as const;
      addOrUpdateActivity(activity);
      appendAssistantActivityOutput(
        assistantMessageId,
        activity.id,
        asString(data.output) ?? "",
        activity.detail
      );
      return;
    }

    if (event.event === "reasoning_summary") {
      const text = asString(data.text) ?? asString(data.summary);
      if (text) {
        const activity = {
          id: asString(data.item_id) ?? createId("reasoning"),
          title: "Reasoning",
          detail: trimMiddle(text, 180),
          status: "info"
        } as const;
        addOrUpdateActivity(activity);
        addOrUpdateAssistantActivity(assistantMessageId, activity);
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
      addOrUpdateAssistantApproval(assistantMessageId, approval);
      return;
    }

    if (event.event === "file_change") {
      const activity = {
        id: asString(data.item_id) ?? createId("file"),
        title: "File change",
        detail: asString(data.status) ?? undefined,
        status: "info"
      } as const;
      addOrUpdateActivity(activity);
      addOrUpdateAssistantActivity(assistantMessageId, activity);
      return;
    }

    if (event.event === "todo_list") {
      const activity = {
        id: asString(data.item_id) ?? createId("todo"),
        title: "Plan updated",
        detail: "Task list changed",
        status: "info"
      } as const;
      addOrUpdateActivity(activity);
      addOrUpdateAssistantActivity(assistantMessageId, activity);
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
        current.map((item) =>
          item.id === assistantMessageId
            ? { ...item, pending: false, parts: completePendingParts(item.parts) }
            : item
        )
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
        : [...current, { id: assistantMessageId, role: "assistant", text: "", parts: [], pending: true }]
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

  const appendAssistantText = useCallback((messageId: string, text: string, itemId?: string | null) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId ? appendTextPart(item, text, itemId) : item
      )
    );
  }, []);

  const completeAssistantText = useCallback((messageId: string, text?: string | null, itemId?: string | null) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId ? completeTextPart(item, text, itemId) : item
      )
    );
  }, []);

  const addOrUpdateAssistantActivity = useCallback((messageId: string, activity: ActivityItem) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId ? upsertActivityPart(item, activity) : item
      )
    );
  }, []);

  const appendAssistantActivityOutput = useCallback(
    (messageId: string, activityId: string, output: string, fallbackDetail?: string) => {
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? appendActivityOutputPart(item, activityId, output, fallbackDetail)
            : item
        )
      );
    },
    []
  );

  const addOrUpdateAssistantApproval = useCallback((messageId: string, approval: PendingApproval) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId ? upsertApprovalPart(item, approval) : item
      )
    );
  }, []);

  const markApprovalAnswered = useCallback((approvalId: string, decision: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.role === "assistant" ? answerApprovalPart(item, approvalId, decision) : item
      )
    );
  }, []);

  const markAssistantFailed = useCallback((messageId: string, message: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? failAssistantMessage(item, message)
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
      markApprovalAnswered(approval.approval_id, decision);
      addOrUpdateActivity({
        id: approval.approval_id,
        title: "Approval answered",
        detail: decision,
        status: "done"
      });
    },
    [addOrUpdateActivity, client, markApprovalAnswered]
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
      apps,
      skills,
      mcpServers,
      mcpResource,
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
      isRefreshingMentions,
      isRefreshingMcp,
      isLoadingThreadContent,
      isRunning,
      error,
      accountError,
      mentionError,
      mcpError,
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
      refreshMentions,
      refreshMcpServers,
      readMcpResource,
      reloadMcpServers,
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
      apps,
      archiveThread,
      buildConfig,
      cancelRun,
      capabilities,
      config,
      createNewThread,
      error,
      health,
      isBooting,
      isLoadingThreadContent,
      isRefreshingAccount,
      isRefreshingMentions,
      isRefreshingMcp,
      isRefreshing,
      isRunning,
      mentionError,
      mcpError,
      mcpResource,
      mcpServers,
      messages,
      models,
      pendingApprovals,
      preferences,
      readMcpResource,
      refreshAll,
      refreshAccount,
      refreshMentions,
      refreshMcpServers,
      refreshWorkspaces,
      refreshThreads,
      reloadMcpServers,
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
      skills,
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

function isActiveRunStatus(status: string) {
  return status === "starting" || status === "running" || status === "waiting_approval";
}

function isFailedStatus(status: unknown) {
  const normalized = lowerString(status);
  return normalized === "failed" || normalized === "error" || normalized === "errored";
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
