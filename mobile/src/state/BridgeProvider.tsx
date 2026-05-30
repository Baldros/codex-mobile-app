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

function isFailedStatus(status: unknown) {
  const normalized = lowerString(status);
  return normalized === "failed" || normalized === "error" || normalized === "errored";
}

function appendTextPart(message: ChatMessage, text: string, itemId?: string | null): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = itemId ? textPartId(itemId) : null;
  const existingIndex = partId
    ? parts.findIndex((part) => part.id === partId && part.type === "text")
    : -1;

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing?.type === "text") {
      parts[existingIndex] = {
        ...existing,
        text: `${existing.text}${text}`,
        pending: true
      };
    }
  } else {
    const last = parts[parts.length - 1];
    if (!partId && last?.type === "text" && last.pending !== false) {
      parts[parts.length - 1] = {
        ...last,
        text: `${last.text}${text}`,
        pending: true
      };
    } else {
      parts.push({
        id: partId ?? createId("text"),
        type: "text",
        text,
        pending: true
      });
    }
  }

  return {
    ...message,
    text: messageTextFromParts(parts),
    parts
  };
}

function completeTextPart(message: ChatMessage, text?: string | null, itemId?: string | null): ChatMessage {
  const cleanText = text ?? "";
  const parts = ensureMessageParts(message);
  const partId = itemId ? textPartId(itemId) : null;
  const existingIndex = partId
    ? parts.findIndex((part) => part.id === partId && part.type === "text")
    : -1;

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing?.type === "text") {
      parts[existingIndex] = {
        ...existing,
        text: cleanText.length > 0 ? cleanText : existing.text,
        pending: false
      };
    }
  } else {
    const lastIndex = parts.length - 1;
    const existing = parts[lastIndex];
    if (!partId && existing?.type === "text") {
      parts[lastIndex] = {
        ...existing,
        text: cleanText.length > 0 ? cleanText : existing.text,
        pending: false
      };
    } else if (cleanText.length > 0) {
      parts.push({
        id: partId ?? createId("text"),
        type: "text",
        text: cleanText,
        pending: false
      });
    }
  }

  return {
    ...message,
    text: messageTextFromParts(parts),
    parts
  };
}

function upsertActivityPart(message: ChatMessage, activity: ActivityItem): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = activityPartId(activity.id);
  const existingIndex = parts.findIndex((part) => part.id === partId && part.type === "activity");
  const existing = existingIndex >= 0 ? parts[existingIndex] : undefined;
  const nextPart: Extract<ChatMessagePart, { type: "activity" }> = {
    id: partId,
    type: "activity",
    title: activity.title,
    detail: activity.detail,
    status: activity.status,
    output: existing?.type === "activity" ? existing.output : undefined
  };

  if (existingIndex >= 0) {
    parts[existingIndex] = nextPart;
  } else {
    parts.push(nextPart);
  }

  return { ...message, parts };
}

function appendActivityOutputPart(
  message: ChatMessage,
  activityId: string,
  output: string,
  fallbackDetail?: string
): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = activityPartId(activityId);
  const existingIndex = parts.findIndex((part) => part.id === partId && part.type === "activity");

  if (existingIndex >= 0) {
    const existing = parts[existingIndex];
    if (existing?.type === "activity") {
      const nextOutput = `${existing.output ?? ""}${output}`;
      parts[existingIndex] = {
        ...existing,
        detail: fallbackDetail ?? existing.detail,
        output: trimMiddle(nextOutput, 360),
        status: existing.status === "done" || existing.status === "failed" ? existing.status : "running"
      };
    }
  } else {
    parts.push({
      id: partId,
      type: "activity",
      title: "Command output",
      detail: fallbackDetail,
      output: trimMiddle(output, 360),
      status: "running"
    });
  }

  return { ...message, parts };
}

function upsertApprovalPart(message: ChatMessage, approval: PendingApproval): ChatMessage {
  const parts = ensureMessageParts(message);
  const partId = approvalPartId(approval.approval_id);
  const existingIndex = parts.findIndex((part) => part.id === partId && part.type === "approval");

  const nextPart = {
    id: partId,
    type: "approval" as const,
    approval,
    status: "pending" as const
  };

  if (existingIndex >= 0) {
    parts[existingIndex] = nextPart;
  } else {
    parts.push(nextPart);
  }

  return { ...message, parts };
}

function answerApprovalPart(message: ChatMessage, approvalId: string, decision: string): ChatMessage {
  const parts = ensureMessageParts(message).map((part): ChatMessagePart => {
    if (part.type !== "approval" || part.approval.approval_id !== approvalId) {
      return part;
    }
    return {
      ...part,
      status: "answered",
      decision
    };
  });
  return { ...message, parts };
}

function completePendingParts(parts: ChatMessagePart[] | undefined) {
  return (parts ?? []).map((part): ChatMessagePart =>
    part.type === "text" ? { ...part, pending: false } : part
  );
}

function failAssistantMessage(message: ChatMessage, error: string): ChatMessage {
  const parts = ensureMessageParts(message);
  if (parts.length === 0) {
    parts.push({
      id: createId("text"),
      type: "text",
      text: error,
      pending: false
    });
  }
  return {
    ...message,
    text: message.text || error,
    pending: false,
    parts: completePendingParts(parts)
  };
}

function ensureMessageParts(message: ChatMessage): ChatMessagePart[] {
  if (message.parts) {
    return [...message.parts];
  }
  if (message.text.trim()) {
    return [
      {
        id: `${message.id}_text`,
        type: "text",
        text: message.text,
        ...(message.pending !== undefined ? { pending: message.pending } : {})
      }
    ];
  }
  return [];
}

function messageTextFromParts(parts: ChatMessagePart[]) {
  return parts
    .filter((part): part is Extract<ChatMessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .filter((text) => text.trim().length > 0)
    .join("\n\n");
}

function textPartId(itemId: string) {
  return `text_${itemId}`;
}

function activityPartId(activityId: string) {
  return `activity_${activityId}`;
}

function approvalPartId(approvalId: string) {
  return `approval_${approvalId}`;
}

function messagesFromThread(thread: BridgeThread) {
  const turns = Array.isArray(thread.turns) ? thread.turns : [];
  const messages: ChatMessage[] = [];

  turns.forEach((turn, turnIndex) => {
    const record = asRecord(turn);
    if (!record) {
      return;
    }
    const turnId = asString(record.id) ?? asString(record.turnId) ?? `turn_${turnIndex}`;

    for (const text of textEntries(record.input ?? record.userInput ?? record.prompt)) {
      messages.push({
        id: historyId("history_user", turnId, messages.length),
        role: "user",
        text
      });
    }

    const items = turnItems(record);
    const toolResultsByCallId = collectToolResults(items);
    const assistantParts: ChatMessagePart[] = [];

    items.forEach((item, itemIndex) => {
      const itemRecord = asRecord(item);
      if (!itemRecord) {
        return;
      }

      const role = lowerString(itemRecord.role);
      const type = lowerString(itemRecord.type);
      const text = firstText(itemRecord.text, itemRecord.content, itemRecord.message);

      if (role === "user" || role === "human" || type === "usermessage" || type === "user_message") {
        if (text) {
          messages.push({
            id: historyId("history_user", turnId, itemIndex),
            role: "user",
            text
          });
        }
        return;
      }

      if (
        role === "assistant" ||
        role === "ai" ||
        role === "model" ||
        type === "agentmessage" ||
        type === "agent_message" ||
        type === "assistantmessage" ||
        type === "assistant_message"
      ) {
        if (text) {
          assistantParts.push({
            id: historyId("history_text", turnId, itemIndex),
            type: "text",
            text,
            pending: false
          });
        }
        for (const part of toolCallParts(itemRecord, toolResultsByCallId, turnId, itemIndex)) {
          assistantParts.push(part);
        }
        return;
      }

      const activityPart = activityPartFromHistoryItem(itemRecord, toolResultsByCallId, turnId, itemIndex);
      if (activityPart) {
        assistantParts.push(activityPart);
      }
    });

    const assistantText = firstText(
      record.assistantMessage,
      record.response,
      record.outputText,
      record.finalMessage
    );
    if (assistantText && !assistantParts.some((part) => part.type === "text" && part.text === assistantText)) {
      assistantParts.push({
        id: historyId("history_text", turnId, "final"),
        type: "text",
        text: assistantText,
        pending: false
      });
    }

    if (assistantParts.length > 0) {
      messages.push({
        id: historyId("history_assistant", turnId, messages.length),
        role: "assistant",
        text: messageTextFromParts(assistantParts),
        parts: assistantParts,
        pending: false
      });
    }
  });

  return messages;
}

function turnItems(turn: Record<string, unknown>) {
  return arrayValue(
    turn.items ??
      turn.output ??
      turn.responses ??
      turn.messages ??
      turn.events ??
      turn.steps
  );
}

function collectToolResults(items: unknown[]) {
  const results = new Map<string, string>();

  for (const item of items) {
    const record = asRecord(item);
    if (!record) {
      continue;
    }

    const role = lowerString(record.role);
    const type = lowerString(record.type);
    const callId = asString(record.tool_call_id) ?? asString(record.toolCallId) ?? asString(record.call_id);
    if (!callId || (role !== "tool" && type !== "tool" && type !== "tool_result" && type !== "toolresult")) {
      continue;
    }

    const output = firstText(record.content, record.output, record.result, record.text);
    if (output) {
      results.set(callId, output);
    }
  }

  return results;
}

function toolCallParts(
  item: Record<string, unknown>,
  toolResultsByCallId: Map<string, string>,
  turnId: string,
  itemIndex: number
): ChatMessagePart[] {
  const toolCalls = arrayValue(item.tool_calls ?? item.toolCalls);
  return toolCalls.flatMap((toolCall, toolIndex): ChatMessagePart[] => {
    const record = asRecord(toolCall);
    if (!record) {
      return [];
    }

    const id = asString(record.id) ?? asString(record.call_id) ?? historyId("tool_call", turnId, `${itemIndex}_${toolIndex}`);
    const args = stringifyPayload(record.args ?? record.arguments ?? record.input);
    return [
      {
        id: activityPartId(id),
        type: "activity",
        title: asString(record.name) ?? asString(record.tool) ?? "Tool call",
        detail: args,
        output: toolResultsByCallId.get(id),
        status: "done"
      }
    ];
  });
}

function activityPartFromHistoryItem(
  item: Record<string, unknown>,
  toolResultsByCallId: Map<string, string>,
  turnId: string,
  itemIndex: number
): Extract<ChatMessagePart, { type: "activity" }> | null {
  const role = lowerString(item.role);
  const type = lowerString(item.type);

  if (role === "tool" || type === "tool" || type === "tool_result" || type === "toolresult") {
    const callId = asString(item.tool_call_id) ?? asString(item.toolCallId) ?? asString(item.call_id);
    return {
      id: activityPartId(callId ?? historyId("tool_result", turnId, itemIndex)),
      type: "activity",
      title: asString(item.name) ?? "Tool result",
      detail: optionalText(item.content, item.output, item.result, item.text),
      status: historyStatus(item.status)
    };
  }

  if (type === "reasoning") {
    const detail = firstText(item.summary, item.text, item.content);
    return detail
      ? {
          id: activityPartId(asString(item.id) ?? historyId("reasoning", turnId, itemIndex)),
          type: "activity",
          title: "Reasoning",
          detail,
          status: "info"
        }
      : null;
  }

  if (type === "commandexecution" || type === "command_execution") {
    const id = asString(item.id) ?? historyId("command", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "Command",
      detail: commandDetail(item.command, item.cwd),
      output: optionalText(item.aggregatedOutput, item.aggregated_output, item.output, item.result),
      status: historyStatus(item.status, item.exitCode ?? item.exit_code)
    };
  }

  if (type === "mcptoolcall" || type === "mcp_tool_call" || type === "dynamictoolcall") {
    const id = asString(item.id) ?? historyId("mcp", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: asString(item.tool) ?? "MCP tool",
      detail: asString(item.server) ?? stringifyPayload(item.input ?? item.args),
      output: optionalText(item.output, item.result, item.error),
      status: historyStatus(item.status, item.error ? 1 : undefined)
    };
  }

  if (type === "websearch" || type === "web_search") {
    const id = asString(item.id) ?? historyId("web", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "Web search",
      detail: asString(item.query) ?? optionalText(item.input),
      output: optionalText(item.output, item.result),
      status: historyStatus(item.status)
    };
  }

  if (type === "filechange" || type === "file_change") {
    const id = asString(item.id) ?? historyId("file", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "File change",
      detail: asString(item.status) ?? stringifyPayload(item.changes),
      output: optionalText(item.output, item.result),
      status: historyStatus(item.status)
    };
  }

  if (type === "todo_list" || type === "todolist") {
    const id = asString(item.id) ?? historyId("todo", turnId, itemIndex);
    return {
      id: activityPartId(id),
      type: "activity",
      title: "Plan updated",
      detail: "Task list changed",
      status: "info"
    };
  }

  const result = toolResultsByCallId.get(asString(item.id) ?? "");
  return result
    ? {
        id: activityPartId(asString(item.id) ?? historyId("tool", turnId, itemIndex)),
        type: "activity",
        title: asString(item.name) ?? "Tool result",
        detail: result,
        status: "done"
      }
    : null;
}

function historyStatus(status: unknown, exitCode?: unknown): ActivityItem["status"] {
  const normalized = lowerString(status);
  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "errored" ||
    (typeof exitCode === "number" && exitCode !== 0)
  ) {
    return "failed";
  }
  if (normalized === "running" || normalized === "in_progress" || normalized === "pending") {
    return "running";
  }
  if (normalized === "info") {
    return "info";
  }
  return "done";
}

function commandDetail(command: unknown, cwd: unknown) {
  if (Array.isArray(command)) {
    return command.map((part) => String(part)).join(" ");
  }
  if (typeof command === "string" && command.length > 0) {
    return command;
  }
  return typeof cwd === "string" ? cwd : undefined;
}

function stringifyPayload(value: unknown) {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function lowerString(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : null;
}

function historyId(prefix: string, turnId: string, suffix: string | number) {
  return `${prefix}_${turnId}_${suffix}`;
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

function optionalText(...values: unknown[]): string | undefined {
  return firstText(...values) ?? undefined;
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
