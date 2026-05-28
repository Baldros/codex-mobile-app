export type NativeTunnelStartOptions = {
  sshHost: string;
  sshPort: number;
  username: string;
  password?: string;
  privateKeyPem?: string;
  privateKeyPassphrase?: string;
  localBindHost: string;
  localBindPort: number;
  remoteApiHost: string;
  remoteApiPort: number;
  connectTimeoutMs: number;
  strictHostKeyChecking?: boolean;
};

export type NativeTunnelStatus = {
  state: "disconnected" | "ready" | string;
  connected: boolean;
  localBindHost: string;
  localBindPort: number;
  assignedPort: number;
  activeEndpoint: string | null;
};
