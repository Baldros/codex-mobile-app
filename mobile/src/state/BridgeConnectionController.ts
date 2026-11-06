import type { BridgeClient } from "../api/bridgeClient";

export type BridgeConnectionStatus = "connecting" | "connected" | "reconnecting" | "unreachable";

export class BridgeConnectionController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private attempt = 0;
  private stopped = false;
  private foreground = true;
  private status: BridgeConnectionStatus = "connecting";

  constructor(
    private readonly client: BridgeClient,
    private readonly onStatus: (status: BridgeConnectionStatus) => void,
    private readonly onRestored: () => void
  ) {}

  start() { this.schedule(0); }

  stop() {
    this.stopped = true;
    this.clearTimer();
    this.controller?.abort();
    this.controller = null;
  }

  setForeground(active: boolean) {
    this.foreground = active;
    if (!active) {
      this.clearTimer();
      this.controller?.abort();
      this.controller = null;
    } else {
      this.schedule(0);
    }
  }

  markRequestFailure() {
    if (this.stopped || !this.foreground) return;
    if (this.status === "connected") this.setStatus("reconnecting");
    this.schedule(0);
  }

  private setStatus(status: BridgeConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.onStatus(status);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delay: number) {
    if (this.stopped || !this.foreground || this.controller) return;
    this.clearTimer();
    this.timer = setTimeout(() => { this.timer = null; void this.probe(); }, delay);
  }

  private async probe() {
    if (this.stopped || !this.foreground || this.controller) return;
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), 7000);
    let reachable = false;
    try {
      await this.client.capabilities(controller.signal);
      reachable = true;
    } catch (error) {
      // An HTTP error still means the Bridge endpoint answered.
      reachable = typeof (error as { status?: unknown })?.status === "number";
    } finally {
      clearTimeout(timeout);
      if (this.controller === controller) this.controller = null;
    }
    if (this.stopped || !this.foreground || controller.signal.aborted) return;
    if (reachable) {
      const restored = this.status !== "connected";
      this.attempt = 0;
      this.setStatus("connected");
      if (restored) this.onRestored();
      this.schedule(20000);
    } else {
      this.attempt += 1;
      this.setStatus(this.attempt === 1 ? "unreachable" : "reconnecting");
      this.schedule(Math.min(this.attempt * 2000, 10000));
    }
  }
}
