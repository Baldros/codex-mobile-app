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
import { AppState } from "react-native";
import { File } from "expo-file-system";

import { BridgeClient, approvalSummary, type BridgeRequestError } from "../api/bridgeClient";
import { DEFAULT_PREFERENCES } from "../config/defaults";
import {
  getCodexMobileBuildConfig,
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
  DirectoryChildrenResponse,
  DirectoryRootsResponse,
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
import type { UploadedAttachment } from "../domain/bridge";
import { decideRunEvent, pickAttachableRun, startFailureDisposition } from "../domain/activeRun";
import { BridgeConnectionController, type BridgeConnectionStatus } from "./BridgeConnectionController";
import {
  activityPartId,
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
import { reconcileTranscriptMessages } from "../domain/reconcileMessages";
import { loadPreferences, savePreferences } from "../storage/preferences";
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
  connectionStatus: BridgeConnectionStatus;
  pendingAttachments: UploadedAttachment[];
  isUploadingAttachment: boolean;
  failedUploadCount: number;
  lastConfirmedRequestId: string | null;
  hasUncertainSubmission: boolean;
  runningThreadId: string | null;
  isBooting: boolean;
  isRefreshing: boolean;
  isRefreshingAccount: boolean;
  isRefreshingMentions: boolean;
  isRefreshingMcp: boolean;
  isLoadingThreadContent: boolean;
  isRunning: boolean;
  isComposerLocked: boolean;
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
  listFilesystemRoots: () => Promise<DirectoryRootsResponse>;
  listDirectoryChildren: (path: string) => Promise<DirectoryChildrenResponse>;
  selectWorkspace: (workspace: WorkspaceEntry) => Promise<void>;
  selectThread: (thread: BridgeThread) => Promise<void>;
  renameThread: (thread: BridgeThread, title: string) => Promise<BridgeThread | null>;
  archiveThread: (thread: BridgeThread) => Promise<ThreadArchiveResponse | null>;
  restoreThread: (thread: BridgeThread) => Promise<ThreadArchiveResponse | null>;
  addWorkspace: (path: string, options?: { select?: boolean }) => Promise<WorkspaceMutationResponse | null>;
  removeWorkspace: (workspace: WorkspaceEntry) => Promise<WorkspaceMutationResponse | null>;
  restoreWorkspace: (path: string) => Promise<WorkspaceMutationResponse | null>;
  createNewThread: () => Promise<void>;
  sendMessage: (message: string, inputItems?: RunInputItem[]) => Promise<{ status: "accepted" | "rejected" | "uncertain"; requestId?: string }>;
  pickAttachment: () => Promise<void>;
  retryPendingUploads: () => Promise<void>;
  clearFailedUploads: () => void;
  removePendingAttachment: (id: string) => Promise<void>;
  clearUncertainSubmission: () => void;
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
    add: false,
    remove: false,
    restore: false
  }
};

const PROCESSING_RESULTS_ACTIVITY_ID = "processing_results";

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
  const [connectionStatus, setConnectionStatus] = useState<BridgeConnectionStatus>("connecting");
  const [pendingAttachments, setPendingAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [failedUploadFiles, setFailedUploadFiles] = useState<File[]>([]);
  const [lastConfirmedRequestId, setLastConfirmedRequestId] = useState<string | null>(null);
  const [reattachGeneration, setReattachGeneration] = useState(0);
  const [isBooting, setIsBooting] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [isRefreshingMentions, setIsRefreshingMentions] = useState(false);
  const [isRefreshingMcp, setIsRefreshingMcp] = useState(false);
  const [isLoadingThreadContent, setIsLoadingThreadContent] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isComposerLocked, setIsComposerLocked] = useState(false);
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
  const activeUserMessageId = useRef<string | null>(null);
  const attachedRunId = useRef<string | null>(null);
  const lastEventSeqByRun = useRef(new Map<string, number>());
  const assistantMessageIdByRun = useRef(new Map<string, string>());
  const replayGapRuns = useRef(new Set<string>());
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamLastSeenAt = useRef(0);
  const recoveryInFlight = useRef(false);
  const contextGeneration = useRef(0);
  const pendingSubmission = useRef<{ threadId: string; requestId: string; message: string; assistantMessageId: string; userMessageId: string; attachmentIds: string[] } | null>(null);
  const isUploadingAttachmentRef = useRef(false);
  const connectionControllerRef = useRef<BridgeConnectionController | null>(null);
  const detachedAbortControllers = useRef(new Set<AbortController>());
  const buildConfig = useMemo(() => getCodexMobileBuildConfig(), []);

  const client = useMemo(() => new BridgeClient(preferences.baseUrl), [preferences.baseUrl]);
  messagesRef.current = messages;

  const uploadFiles = useCallback(async (files: File[]) => {
    const uploadCapability = capabilities.uploads;
    if (!uploadCapability?.enabled) {
      setError("This Bridge does not support file attachments.");
      return;
    }
    if (isUploadingAttachmentRef.current) return;
    if (pendingAttachments.length + files.length > (uploadCapability.max_files ?? 5)) {
      setError("You can attach at most five files to a message.");
      return;
    }
    isUploadingAttachmentRef.current = true;
    setIsUploadingAttachment(true);
    setFailedUploadFiles([]);
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        if (!file.size || file.size > uploadCapability.max_bytes) {
          setFailedUploadFiles(files.slice(index));
          setError(`Attachment ${file.name} is empty or exceeds the ${uploadCapability.max_bytes} byte limit.`);
          return;
        }
        try {
          const dataBase64 = await file.base64();
          const response = await client.uploadAttachment({ name: file.name, dataBase64 });
          setPendingAttachments((current) => [...current, response.attachment]);
        } catch (error) {
          setFailedUploadFiles(files.slice(index));
          setError(`Upload failed: ${errorMessage(error)}`);
          if (!(error as BridgeRequestError).status) connectionControllerRef.current?.markRequestFailure();
          return;
        }
      }
    } finally {
      isUploadingAttachmentRef.current = false;
      setIsUploadingAttachment(false);
    }
  }, [capabilities.uploads, client, pendingAttachments.length]);

  const pickAttachment = useCallback(async () => {
    if (!capabilities.uploads?.enabled) {
      setError("This Bridge does not support file attachments.");
      return;
    }
    try {
      const picked = await File.pickFileAsync({ multipleFiles: true });
      if (!picked.canceled) await uploadFiles(picked.result);
    } catch (error) {
      setError(`Could not select a file: ${errorMessage(error)}`);
    }
  }, [capabilities.uploads?.enabled, uploadFiles]);

  const retryPendingUploads = useCallback(async () => {
    if (failedUploadFiles.length) await uploadFiles(failedUploadFiles);
  }, [failedUploadFiles, uploadFiles]);

  const clearFailedUploads = useCallback(() => {
    setFailedUploadFiles([]);
    setError(null);
  }, []);

  const removePendingAttachment = useCallback(async (id: string) => {
    if (pendingSubmission.current?.attachmentIds.includes(id)) {
      setError("Wait for the message outcome before removing this attachment.");
      return;
    }
    setPendingAttachments((current) => current.filter((item) => item.id !== id));
    try { await client.removeAttachment(id); } catch { /* TTL cleanup handles an unreachable Bridge. */ }
  }, [client]);

  const clearUncertainSubmission = useCallback(() => {
    const pending = pendingSubmission.current;
    pendingSubmission.current = null;
    if (pending) setMessages((current) => current.filter((item) =>
      item.id !== pending.userMessageId && item.id !== pending.assistantMessageId));
    setIsComposerLocked(false);
    setIsRunning(false);
    setError(null);
  }, []);

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
    activeUserMessageId.current = null;
    attachedRunId.current = null;
    setIsComposerLocked(false);
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
          setMessages((current) => reconcileTranscriptMessages(messagesFromThread(response.thread), current, activeRunId.current));
        }
        return response.thread;
      } catch {
        if (isCurrentThreadContentRequest(requestId)) {
          setMessages((current) => current.length > 0 && selectedThreadRef.current?.id === thread.id
            ? current : messagesFromThread(thread));
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
    const generation = contextGeneration.current;
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
      if (generation !== contextGeneration.current) return;

      if (healthResult.status === "fulfilled") {
        setHealth(healthResult.value);
      }

      const workspaceResponse =
        workspaceResult.status === "fulfilled" ? workspaceResult.value : null;
      const modelResponse = modelResult.status === "fulfilled" ? modelResult.value : null;
      const configResponse = configResult.status === "fulfilled" ? configResult.value : null;
      const accountResponse = accountResult.status === "fulfilled" ? accountResult.value : null;

      if (workspaceResponse) {
        setWorkspaces(workspaceResponse.data);
        setAllowlistFile(workspaceResponse.allowlist_file);
      }

      if (modelResponse) {
        setModels(modelResponse.data);
      }
      if (configResponse) setConfig(configResponse);
      if (accountResponse) setAccount(accountResponse);
      if (capabilitiesResult.status === "fulfilled") setCapabilities(capabilitiesResult.value);
      if (activeRunsResult.status === "fulfilled") {
        setActiveRuns(activeRunsResult.value.data);
        setIsRunning(activeRunsResult.value.data.length > 0);
      }
      setAccountError(
        accountResult.status === "rejected"
          ? errorMessage(accountResult.reason)
          : accountResponse?.rateLimitsError ?? null
      );

      const currentPreferences = preferencesRef.current;
      if (workspaceResponse) {
        const workspace =
          workspaceResponse.data.find((entry) => entry.path === currentPreferences.selectedWorkspacePath) ??
          workspaceResponse.data.find((entry) => entry.exists) ??
          workspaceResponse.data[0] ?? null;
        setSelectedWorkspaceState(workspace);
        if (workspace) {
          updatePreferences({ selectedWorkspacePath: workspace.path });
          await loadThreadsForWorkspace(workspace.path, currentPreferences.selectedThreadId);
        }
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

  const refreshWorkspaces = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const [workspaceResult, capabilitiesResult] = await Promise.allSettled([
        client.listWorkspaces(),
        client.capabilities()
      ]);

      if (workspaceResult.status === "fulfilled") {
        setWorkspaces(workspaceResult.value.data);
        setAllowlistFile(workspaceResult.value.allowlist_file);
      } else {
        throw workspaceResult.reason;
      }

      if (capabilitiesResult.status === "fulfilled") {
        setCapabilities(capabilitiesResult.value);
      }
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

  const listFilesystemRoots = useCallback(() => client.listFilesystemRoots(), [client]);

  const listDirectoryChildren = useCallback(
    (path: string) => client.listDirectoryChildren(path),
    [client]
  );

  const selectWorkspace = useCallback(
    async (workspace: WorkspaceEntry) => {
      contextGeneration.current += 1;
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
    contextGeneration.current += 1;
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

  const addWorkspace = useCallback(
    async (path: string, options: { select?: boolean } = {}) => {
      const cleanPath = path.trim();
      if (!cleanPath) {
        return null;
      }

      setError(null);
      try {
        const response = await client.addWorkspace(cleanPath);
        if (response.supported) {
          const [workspaceResponse, capabilitiesResponse] = await Promise.all([
            client.listWorkspaces(),
            client.capabilities().catch(() => null)
          ]);
          setWorkspaces(workspaceResponse.data);
          setAllowlistFile(workspaceResponse.allowlist_file);
          if (capabilitiesResponse) {
            setCapabilities(capabilitiesResponse);
          }

          if (options.select && !response.reason) {
            const workspace = workspaceResponse.data.find((entry) =>
              sameWorkspacePath(entry.path, response.path)
            );
            if (workspace?.exists) {
              await selectWorkspace(workspace);
            }
          }
        }
        if (response.reason) {
          setError(response.reason);
        }
        return response;
      } catch (caught) {
        setError(errorMessage(caught));
        return null;
      }
    },
    [client, selectWorkspace]
  );

  const removeWorkspace = useCallback(
    async (workspace: WorkspaceEntry) => {
      setError(null);
      try {
        const response = await client.removeWorkspace(workspace.path);
        if (response.supported && response.removed) {
          const [workspaceResponse, capabilitiesResponse] = await Promise.all([
            client.listWorkspaces(),
            client.capabilities().catch(() => null)
          ]);
          setWorkspaces(workspaceResponse.data);
          setAllowlistFile(workspaceResponse.allowlist_file);
          if (capabilitiesResponse) {
            setCapabilities(capabilitiesResponse);
          }

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
    contextGeneration.current += 1;
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
      if (!cleanMessage || isRunning || isComposerLocked || !selectedWorkspace || pendingSubmission.current ||
          isUploadingAttachmentRef.current || failedUploadFiles.length > 0 ||
          inputItems.some((item) => item.type === "attachment" && !pendingAttachments.some((attachment) => attachment.id === item.id))) {
        return { status: "rejected" as const };
      }
      const requestId = createId("request");

      setError(null);
      setPendingApprovals([]);

      const userMessage: ChatMessage = {
        id: createId("user"),
        role: "user",
        text: cleanMessage,
        deliveryStatus: "sending"
      };
      const assistantMessageId = createId("assistant");
      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        text: "",
        parts: [],
        pending: true
      };

      setMessages((current) => [...current, userMessage]);
      setIsRunning(true);
      setIsComposerLocked(true);
      activeRunId.current = null;
      activeRunThreadId.current = selectedThreadRef.current?.id ?? null;
      activeUserMessageId.current = userMessage.id;
      const abortController = new AbortController();
      activeAbortController.current = abortController;
      let outcome: "accepted" | "rejected" | "uncertain" = "rejected";
      let acceptedRunActive = false;

      try {
        const thread = selectedThreadRef.current ?? (await createPersistedThread());
        if (!thread) {
          if (!abortController.signal.aborted) {
            setMessages((current) =>
              setMessageDeliveryStatus(
                current,
                userMessage.id,
                "failed",
                "Could not create conversation."
              )
            );
          }
          return { status: "rejected" as const, requestId };
        }
        if (abortController.signal.aborted) {
          return { status: "rejected" as const, requestId };
        }

        activeRunThreadId.current = thread.id;
        const submissionGeneration = contextGeneration.current;
        pendingSubmission.current = { threadId: thread.id, requestId, message: cleanMessage, assistantMessageId, userMessageId: userMessage.id,
          attachmentIds: inputItems.filter((item) => item.type === "attachment").map((item) => item.id) };
        setMessages((current) =>
          current.some((item) => item.id === assistantMessageId)
            ? current
            : [...current, assistantMessage]
        );

        const runBody = {
          message: cleanMessage,
          client_request_id: requestId,
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

        const { run } = await client.startRun(thread.id, requestBody, abortController.signal);
        if (submissionGeneration !== contextGeneration.current || selectedThreadRef.current?.id !== thread.id) {
          outcome = "uncertain";
          return { status: "uncertain" as const, requestId };
        }
        outcome = "accepted";
        acceptedRunActive = isActiveRunStatus(run.status);
        pendingSubmission.current = null;
        activeRunId.current = run.run_id;
        assistantMessageIdByRun.current.set(run.run_id, assistantMessageId);
        setMessages((current) => current.map((item) =>
          item.id === userMessage.id ? { ...item, turnId: run.run_id, deliveryStatus: "sent" }
            : item.id === assistantMessageId ? { ...item, turnId: run.run_id } : item
        ));
        setActiveRuns((current) => acceptedRunActive
          ? [run, ...current.filter((item) => item.run_id !== run.run_id)]
          : current.filter((item) => item.run_id !== run.run_id));
        setLastConfirmedRequestId(requestId);
        setPendingAttachments((current) => current.filter((attachment) =>
          !inputItems.some((item) => item.type === "attachment" && item.id === attachment.id)));
        void loadThreadsForWorkspace(selectedWorkspace.path, thread.id);
        return { status: "accepted" as const, requestId };
      } catch (caught) {
        if (abortController.signal.aborted && pendingSubmission.current?.requestId === requestId) {
          outcome = "uncertain";
          return { status: "uncertain" as const, requestId };
        }
        if (!abortController.signal.aborted) {
          const message = errorMessage(caught);
          setError(message);
          const httpError = caught as BridgeRequestError;
          if (startFailureDisposition(httpError) === "rejected") {
            pendingSubmission.current = null;
            setMessages((current) => current.filter((item) => item.id !== userMessage.id && item.id !== assistantMessageId));
            outcome = "rejected";
          } else {
            outcome = "uncertain";
            setError("Submission outcome is unknown. The Bridge will be checked before another send.");
            if (!httpError.status) connectionControllerRef.current?.markRequestFailure();
          }
        }
        return { status: outcome, requestId };
      } finally {
        const detached = detachedAbortControllers.current.delete(abortController);
        if (!detached) {
          setIsComposerLocked(outcome === "uncertain" || (outcome === "accepted" && acceptedRunActive));
          setIsRunning(outcome === "accepted" && acceptedRunActive);
          activeAbortController.current = null;
          activeUserMessageId.current = null;
        }
      }
    },
    [
      client,
      createPersistedThread,
      isComposerLocked,
      isRunning,
      failedUploadFiles.length,
      pendingAttachments,
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

  const handleRunEvent = useCallback((event: BridgeSseEvent, assistantMessageId: string, userMessageId?: string) => {
    const data = event.data as Record<string, unknown>;

    if (event.event === "run_started") {
      const runId = asString(data.run_id);
      const threadId = asString(data.thread_id) ?? activeRunThreadId.current;
      activeRunId.current = runId;
      activeRunThreadId.current = threadId;
      attachedRunId.current = runId;
      if (userMessageId) {
        setMessages((current) => setMessageDeliveryStatus(current, userMessageId, "sent"));
      }
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
        clearAssistantProcessing(assistantMessageId);
        appendAssistantText(assistantMessageId, text, asString(data.item_id));
      }
      return;
    }

    if (event.event === "agent_message") {
      const text = asString(data.text);
      clearAssistantProcessing(assistantMessageId);
      completeAssistantText(assistantMessageId, text, asString(data.item_id));
      return;
    }

    if (event.event === "tool_start") {
      clearAssistantProcessing(assistantMessageId);
      const activity = {
        id: asString(data.item_id) ?? createId("tool"),
        title: toolTitle(data),
        detail: toolDetail(data),
        status: "running",
        toolDetails: toolDetails(data)
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
        status: isFailedStatus(data.status) ? "failed" : "done",
        toolDetails: toolDetails(data)
      } as const;
      addOrUpdateActivity(activity);
      addOrUpdateAssistantActivity(assistantMessageId, activity);
      addAssistantProcessing(assistantMessageId);
      return;
    }

    if (event.event === "command_output") {
      const activity = {
        id: asString(data.item_id) ?? createId("command"),
        title: "Command output",
        detail: trimMiddle(asString(data.output) ?? "", 180),
        status: "running",
        toolDetails: toolDetails(data)
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
        status: isFailedStatus(data.status) ? "failed" : "done",
        toolDetails: toolDetails(data)
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
      const message = asString(data.message) ?? "Stream error.";
      setError(message);
      if (userMessageId) {
        setMessages((current) => setMessageDeliveryStatus(current, userMessageId, "failed", message));
      }
      clearAssistantProcessing(assistantMessageId);
      markAssistantFailed(assistantMessageId, message);
      return;
    }

    if (event.event === "done") {
      const runId = asString(data.run_id) ?? activeRunId.current;
      const status = asString(data.status);
      if (userMessageId) {
        setMessages((current) =>
          setMessageDeliveryStatus(
            current,
            userMessageId,
            isFailedStatus(status) ? "failed" : "sent",
            isFailedStatus(status) ? status ?? "Run failed." : undefined
          )
        );
      }
      clearAssistantProcessing(assistantMessageId);
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
      setIsComposerLocked(false);
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

  const reconcileRun = useCallback(async () => {
    if (recoveryInFlight.current) return;
    recoveryInFlight.current = true;
    const generation = contextGeneration.current;
    const thread = selectedThreadRef.current;
    try {
      const pending = pendingSubmission.current;
      if (pending) {
        try {
          const request = await client.getRunRequest(pending.threadId, pending.requestId);
          if (generation !== contextGeneration.current) return;
          if (selectedThreadRef.current?.id !== pending.threadId) return;
          if (request.run) {
            const run = request.run;
            pendingSubmission.current = null;
            activeRunId.current = run.run_id;
            activeRunThreadId.current = run.thread_id;
            assistantMessageIdByRun.current.set(run.run_id, pending.assistantMessageId);
            setMessages((current) => current.map((item) =>
              item.id === pending.userMessageId ? { ...item, turnId: run.run_id, deliveryStatus: "sent" }
                : item.id === pending.assistantMessageId ? { ...item, turnId: run.run_id } : item));
            setLastConfirmedRequestId(pending.requestId);
            setPendingAttachments((current) => current.filter((attachment) => !pending.attachmentIds.includes(attachment.id)));
            setIsComposerLocked(isActiveRunStatus(run.status));
            setIsRunning(isActiveRunStatus(run.status));
          }
        } catch (error) {
          if ((error as BridgeRequestError).status !== 404) throw error;
          // A missing in-memory request record after restart is inconclusive.
        }
      }
      const active = await client.listActiveRuns(thread ? { threadId: thread.id } : {});
      if (generation !== contextGeneration.current || selectedThreadRef.current?.id !== thread?.id) return;
      setActiveRuns((current) => [
        ...active.data,
        ...current.filter((run) => thread && run.thread_id !== thread.id)
      ]);
      const currentRun = active.data.find((run) => run.thread_id === thread?.id);
      if (currentRun) {
        activeRunId.current = currentRun.run_id;
        activeRunThreadId.current = currentRun.thread_id;
        setIsRunning(true);
        setIsComposerLocked(true);
        if (!attachedRunId.current && !replayGapRuns.current.has(currentRun.run_id)) {
          setReattachGeneration((value) => value + 1);
        }
        return;
      }
      const runId = activeRunId.current;
      if (!runId || !thread || activeRunThreadId.current !== thread.id) return;
      let terminal = false;
      try {
        const { run } = await client.getRun(runId);
        terminal = !isActiveRunStatus(run.status);
      } catch (error) {
        if ((error as BridgeRequestError).status !== 404) throw error;
      }
      if (generation !== contextGeneration.current || selectedThreadRef.current?.id !== thread.id) return;
      const response = await client.getThread(thread.id, { includeTurns: true });
      if (generation !== contextGeneration.current || selectedThreadRef.current?.id !== thread.id) return;
      const turn = (response.thread.turns ?? []).find((value) =>
        value && typeof value === "object" && (value as { id?: unknown }).id === runId) as { status?: unknown } | undefined;
      const transcriptTerminal = turn?.status === "completed" || turn?.status === "failed" || turn?.status === "interrupted" || turn?.status === "cancelled";
      if (terminal || transcriptTerminal) {
        setMessages(messagesFromThread(response.thread));
        setSelectedThread(response.thread);
        activeRunId.current = null;
        activeRunThreadId.current = null;
        attachedRunId.current = null;
        replayGapRuns.current.delete(runId);
        lastEventSeqByRun.current.delete(runId);
        assistantMessageIdByRun.current.delete(runId);
        setIsRunning(false);
        setIsComposerLocked(false);
      } else {
        setError("The run result is unresolved. Check the conversation before sending again.");
      }
    } catch (error) {
      if (!(error as BridgeRequestError).status) connectionControllerRef.current?.markRequestFailure();
    } finally {
      recoveryInFlight.current = false;
    }
  }, [client, setSelectedThread]);

  const attachableRun = pickAttachableRun(activeRuns, selectedThread?.id);
  const attachableRunId = attachableRun?.id ?? null;
  const attachableRunThreadId = attachableRun?.threadId ?? null;

  useEffect(() => {
    if (!attachableRunId || !attachableRunThreadId || attachedRunId.current === attachableRunId) {
      return;
    }
    const runId = attachableRunId;
    const threadId = attachableRunThreadId;
    const generation = contextGeneration.current;
    if (replayGapRuns.current.has(runId)) return;
    const assistantMessageId = assistantMessageIdByRun.current.get(runId) ??
      messagesRef.current.find((message) => message.turnId === runId && message.role === "assistant")?.id ??
      `assistant_${runId}`;
    assistantMessageIdByRun.current.set(runId, assistantMessageId);
    setMessages((current) =>
      current.some((item) => item.id === assistantMessageId)
        ? current
        : [...current, { id: assistantMessageId, turnId: runId, role: "assistant", text: "", parts: [], pending: true }]
    );

    const abortController = new AbortController();
    activeAbortController.current = abortController;
    activeRunId.current = runId;
    activeRunThreadId.current = threadId;
    attachedRunId.current = runId;
    streamLastSeenAt.current = Date.now();
    setIsRunning(true);
    setIsComposerLocked(true);

    let bridgeRespondedWithError = false;
    void client
      .streamRunEvents(
        runId,
        (event) => {
          if (abortController.signal.aborted || generation !== contextGeneration.current || selectedThreadRef.current?.id !== threadId) return;
          streamLastSeenAt.current = Date.now();
          const decision = decideRunEvent(event, runId, threadId, lastEventSeqByRun.current.get(runId) ?? 0);
          if (decision === "heartbeat" || decision === "duplicate") return;
          if (decision !== "accept") {
            if (decision === "gap" || decision === "invalid") {
              replayGapRuns.current.add(runId);
              setError("Live events are incomplete. The transcript will be reloaded when the run finishes.");
            }
            abortController.abort();
            attachedRunId.current = null;
            void reconcileRun();
            return;
          }
          handleRunEvent(event, assistantMessageId);
          lastEventSeqByRun.current.set(runId, (event.data as { event_seq: number }).event_seq);
          if (event.event === "done" && selectedThreadRef.current?.id === threadId) {
            void loadThreadContent(selectedThreadRef.current);
            lastEventSeqByRun.current.delete(runId);
            assistantMessageIdByRun.current.delete(runId);
            replayGapRuns.current.delete(runId);
          }
        },
        abortController.signal,
        lastEventSeqByRun.current.get(runId) ?? 0
      )
      .catch((caught) => {
        if (!abortController.signal.aborted) {
          bridgeRespondedWithError = Boolean((caught as BridgeRequestError).status);
          if ((caught as BridgeRequestError).code === "replay_gap") {
            replayGapRuns.current.add(runId);
            setError("Live event history has a gap. The transcript will be reloaded when the run finishes.");
          } else if ((caught as BridgeRequestError).status === 404) {
            replayGapRuns.current.add(runId);
            setError("The Bridge no longer retains this run. Checking the conversation transcript.");
          } else if ((caught as BridgeRequestError).status !== 404) {
            setError(errorMessage(caught));
            if (!(caught as BridgeRequestError).status) connectionControllerRef.current?.markRequestFailure();
          }
        }
      })
      .finally(() => {
        const detached = detachedAbortControllers.current.delete(abortController);
        if (!detached && attachedRunId.current === runId) {
          attachedRunId.current = null;
          if (!replayGapRuns.current.has(runId) && !bridgeRespondedWithError) connectionControllerRef.current?.markRequestFailure();
        }
      });

    return () => {
      detachedAbortControllers.current.add(abortController);
      abortController.abort();
      if (activeAbortController.current === abortController) {
        activeAbortController.current = null;
      }
      if (attachedRunId.current === runId) {
        attachedRunId.current = null;
      }
    };
  }, [attachableRunId, attachableRunThreadId, client, handleRunEvent, loadThreadContent, reattachGeneration, reconcileRun]);

  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  const reconcileRunRef = useRef(reconcileRun);
  reconcileRunRef.current = reconcileRun;

  useEffect(() => {
    if (isBooting) return;
    contextGeneration.current += 1;
    detachActiveStream();
    lastEventSeqByRun.current.clear();
    assistantMessageIdByRun.current.clear();
    replayGapRuns.current.clear();
    setConnectionStatus("connecting");
    const controller = new BridgeConnectionController(client, setConnectionStatus, () => {
      void (async () => {
        await refreshAllRef.current();
        await reconcileRunRef.current();
      })();
    });
    connectionControllerRef.current = controller;
    controller.start();
    const subscription = AppState.addEventListener("change", (state) => {
      controller.setForeground(state === "active");
      if (state === "active" && activeRunId.current) {
        detachActiveStream();
        void reconcileRunRef.current();
      }
    });
    return () => {
      subscription.remove();
      controller.stop();
      if (connectionControllerRef.current === controller) connectionControllerRef.current = null;
      detachActiveStream();
    };
  }, [client, detachActiveStream, isBooting]);

  useEffect(() => {
    if (connectionStatus !== "connected" || (!isRunning && !isComposerLocked)) return;
    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;
      if (pendingSubmission.current) {
        void reconcileRun();
        return;
      }
      if (!activeRunId.current) return;
      const staleAfter = 3 * (capabilities.sse_heartbeat_ms ?? 15000) + 5000;
      if (attachedRunId.current) {
        if (Date.now() - streamLastSeenAt.current > staleAfter) {
          detachActiveStream();
          void reconcileRun();
        }
      } else {
        void reconcileRun();
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [capabilities.sse_heartbeat_ms, connectionStatus, detachActiveStream, isComposerLocked, isRunning, reconcileRun]);

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

  const addAssistantProcessing = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId
          ? upsertActivityPart(item, {
              id: PROCESSING_RESULTS_ACTIVITY_ID,
              title: "Processing results",
              detail: "Preparing response",
              status: "running"
            })
          : item
      )
    );
  }, []);

  const clearAssistantProcessing = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId ? removeMessagePart(item, activityPartId(PROCESSING_RESULTS_ACTIVITY_ID)) : item
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

    if (!threadId || !runId) return;
    try {
      const result = await client.cancelRun(threadId, runId);
      if (!result.cancelled) setError("The run could not be cancelled; its status will be checked.");
      void reconcileRun();
    } catch (error) {
      setError(`Cancellation outcome is unknown: ${errorMessage(error)}`);
      if (!(error as BridgeRequestError).status) connectionControllerRef.current?.markRequestFailure();
    }
  }, [activeRuns, client, reconcileRun, selectedThread?.id]);

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
      connectionStatus,
      pendingAttachments,
      isUploadingAttachment,
      failedUploadCount: failedUploadFiles.length,
      lastConfirmedRequestId,
      hasUncertainSubmission: Boolean(pendingSubmission.current),
      runningThreadId: activeRuns[0]?.thread_id ?? activeRunThreadId.current,
      isBooting,
      isRefreshing,
      isRefreshingAccount,
      isRefreshingMentions,
      isRefreshingMcp,
      isLoadingThreadContent,
      isRunning,
      isComposerLocked,
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
      listFilesystemRoots,
      listDirectoryChildren,
      selectWorkspace,
      selectThread,
      renameThread,
      archiveThread,
      restoreThread,
      addWorkspace,
      removeWorkspace,
      restoreWorkspace,
      createNewThread,
      sendMessage,
      pickAttachment,
      retryPendingUploads,
      clearFailedUploads,
      removePendingAttachment,
      clearUncertainSubmission,
      cancelRun,
      respondApproval,
      saveCodexDefaults
    }),
    [
      activities,
      activeRuns,
      connectionStatus,
      pendingAttachments,
      isUploadingAttachment,
      failedUploadFiles.length,
      lastConfirmedRequestId,
      allowlistFile,
      account,
      accountError,
      apps,
      archiveThread,
      addWorkspace,
      buildConfig,
      cancelRun,
      capabilities,
      config,
      createNewThread,
      error,
      health,
      isBooting,
      isLoadingThreadContent,
      isComposerLocked,
      isRefreshingAccount,
      isRefreshingMentions,
      isRefreshingMcp,
      isRefreshing,
      listDirectoryChildren,
      listFilesystemRoots,
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
      pickAttachment,
      retryPendingUploads,
      clearFailedUploads,
      removePendingAttachment,
      clearUncertainSubmission,
      selectedThread,
      selectedWorkspace,
      skills,
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

type DeliveryStatus = NonNullable<ChatMessage["deliveryStatus"]>;

function setMessageDeliveryStatus(
  messages: ChatMessage[],
  messageId: string | null | undefined,
  deliveryStatus: DeliveryStatus,
  deliveryError?: string
) {
  if (!messageId) {
    return messages;
  }

  let updated = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    updated = true;
    return withMessageDeliveryStatus(message, deliveryStatus, deliveryError);
  });
  return updated ? next : messages;
}

function setLatestUserMessageDeliveryStatus(
  messages: ChatMessage[],
  text: string,
  deliveryStatus: DeliveryStatus,
  deliveryError?: string
) {
  const cleanText = text.trim();
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user" || message.text.trim() !== cleanText) {
      continue;
    }

    const updated = withMessageDeliveryStatus(message, deliveryStatus, deliveryError);
    if (updated === message) {
      return messages;
    }

    const next = [...messages];
    next[index] = updated;
    return next;
  }
  return messages;
}

function withMessageDeliveryStatus(
  message: ChatMessage,
  deliveryStatus: DeliveryStatus,
  deliveryError?: string
): ChatMessage {
  const nextError = deliveryStatus === "failed" ? deliveryError : undefined;
  if (message.deliveryStatus === deliveryStatus && message.deliveryError === nextError) {
    return message;
  }
  const next: ChatMessage = {
    ...message,
    deliveryStatus
  };
  if (nextError) {
    next.deliveryError = nextError;
  } else {
    delete next.deliveryError;
  }
  return next;
}

function removeMessagePart(message: ChatMessage, partId: string): ChatMessage {
  const parts = message.parts;
  if (!parts?.some((part) => part.id === partId)) {
    return message;
  }
  return {
    ...message,
    parts: parts.filter((part) => part.id !== partId)
  };
}

function readConfigString(config: CodexConfigResponse | null, key: string) {
  const value = config?.config?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function sameWorkspacePath(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
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

function toolDetails(data: Record<string, unknown>) {
  return {
    kind: data.kind,
    command: data.command,
    cwd: data.cwd,
    output: data.output,
    exitCode: data.exit_code,
    status: data.status,
    durationMs: data.duration_ms,
    server: data.server,
    tool: data.tool,
    query: data.query,
    arguments: data.arguments,
    result: data.result,
    error: data.error,
    changes: data.changes,
    diff: data.diff,
    action: data.action,
    raw: data
  };
}
