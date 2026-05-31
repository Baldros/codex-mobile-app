// Formatting helpers for the account limits UI (the composer menu detail line,
// the limits modal meters, and credit/reset labels). Pure presentation logic.

import type { CodexAccountResponse, RateLimitSnapshot } from "../../domain/bridge";

export function limitsMenuDetail(bridge: {
  account: CodexAccountResponse | null;
  accountError: string | null;
  isRefreshingAccount: boolean;
}) {
  if (bridge.isRefreshingAccount) {
    return "Refreshing";
  }
  if (bridge.accountError) {
    return "Needs attention";
  }
  const limits = getCodexLimits(bridge.account);
  const planType = limits?.planType ?? bridge.account?.account?.planType;
  return planType ? planTypeLabel(planType) : "Usage and credits";
}

export function getCodexLimits(account: CodexAccountResponse | null): RateLimitSnapshot | null {
  return account?.rateLimits?.rateLimitsByLimitId?.codex ?? account?.rateLimits?.rateLimits ?? null;
}

export function clampPercent(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function formatPercent(value: number) {
  return `${clampPercent(value)}%`;
}

export function windowDurationLabel(minutes: number | null) {
  if (minutes === 300) {
    return "5h window";
  }
  if (minutes === 10080) {
    return "Weekly window";
  }
  if (!minutes) {
    return "Current window";
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h window`;
  }
  return `${minutes} min window`;
}

export function resetLabel(resetsAt: number | null) {
  if (!resetsAt) {
    return "Reset not reported";
  }

  const milliseconds = resetsAt > 10_000_000_000 ? resetsAt : resetsAt * 1000;
  const formatted = new Date(milliseconds).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  return `Reset ${formatted}`;
}

export function planTypeLabel(planType: string) {
  return planType.replace(/_/g, " ");
}

export function creditsLabel(credits: NonNullable<RateLimitSnapshot["credits"]>) {
  if (credits.unlimited) {
    return "Unlimited";
  }
  if (credits.balance) {
    return credits.balance;
  }
  return credits.hasCredits ? "Active" : "Unavailable";
}

export function limitReachedLabel(rateLimitReachedType: string) {
  return rateLimitReachedType.replace(/_/g, " ");
}
