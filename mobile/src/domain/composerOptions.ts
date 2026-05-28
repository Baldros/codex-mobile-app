import type { CodexModel, ReasoningEffort } from "./bridge";

export const fallbackEfforts: ReasoningEffort[] = ["low", "medium", "high", "xhigh"];

export type FastTierOption = {
  id: string;
  label: string;
  description?: string;
  available: boolean;
};

export function effortsForModel(model: CodexModel | null): ReasoningEffort[] {
  const supported = model?.supportedReasoningEfforts?.map((item) => item.reasoningEffort);
  return supported && supported.length > 0 ? supported : fallbackEfforts;
}

export function fastTierOptionsForModel(model: CodexModel | null): FastTierOption[] {
  if (!model) {
    return [];
  }

  const options = new Map<string, FastTierOption>();
  const defaultTier = model.defaultServiceTier ?? "default";

  for (const tierId of model.additionalSpeedTiers ?? []) {
    if (!isUsableFastTier(tierId, defaultTier)) {
      continue;
    }
    options.set(tierId, {
      id: tierId,
      label: tierLabel(tierId),
      available: true
    });
  }

  for (const tier of model.serviceTiers ?? []) {
    if (!isUsableFastTier(tier.id, defaultTier)) {
      continue;
    }
    options.set(tier.id, {
      id: tier.id,
      label: tier.name || tierLabel(tier.id),
      ...(tier.description ? { description: tier.description } : {}),
      available: true
    });
  }

  return [...options.values()];
}

export function primaryFastTier(model: CodexModel | null) {
  return fastTierOptionsForModel(model)[0] ?? null;
}

export function isFastAvailable(model: CodexModel | null) {
  return fastTierOptionsForModel(model).length > 0;
}

export function isServiceTierAvailable(model: CodexModel | null, serviceTier: string | null) {
  if (!serviceTier) {
    return true;
  }
  return fastTierOptionsForModel(model).some((tier) => tier.id === serviceTier);
}

function isUsableFastTier(tierId: string, defaultTier: string) {
  const normalized = tierId.trim().toLowerCase();
  return normalized.length > 0 && normalized !== "default" && normalized !== defaultTier.toLowerCase();
}

function tierLabel(tierId: string) {
  return tierId
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
