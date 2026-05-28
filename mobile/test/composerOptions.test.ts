import {
  effortsForModel,
  fastTierOptionsForModel,
  isFastAvailable,
  isServiceTierAvailable,
  primaryFastTier
} from "../src/domain/composerOptions";
import type { CodexModel } from "../src/domain/bridge";

describe("composer option helpers", () => {
  it("falls back to standard reasoning efforts when the model omits them", () => {
    expect(effortsForModel(null)).toEqual(["low", "medium", "high", "xhigh"]);
  });

  it("uses model-provided reasoning efforts when available", () => {
    const model: CodexModel = {
      id: "gpt-test",
      supportedReasoningEfforts: [{ reasoningEffort: "minimal" }, { reasoningEffort: "high" }]
    };

    expect(effortsForModel(model)).toEqual(["minimal", "high"]);
  });

  it("enables Fast only when speed tiers are exposed", () => {
    expect(isFastAvailable({ id: "plain" })).toBe(false);

    const model: CodexModel = {
      id: "fast",
      additionalSpeedTiers: ["flex"],
      serviceTiers: [{ id: "priority", name: "Priority", description: "Low latency" }]
    };

    expect(isFastAvailable(model)).toBe(true);
    expect(primaryFastTier(model)?.id).toBe("flex");
    expect(fastTierOptionsForModel(model).map((tier) => tier.id)).toEqual(["flex", "priority"]);
  });

  it("treats unknown selected service tiers as unavailable", () => {
    const model: CodexModel = {
      id: "fast",
      additionalSpeedTiers: ["flex"]
    };

    expect(isServiceTierAvailable(model, "flex")).toBe(true);
    expect(isServiceTierAvailable(model, "unknown")).toBe(false);
    expect(isServiceTierAvailable(model, null)).toBe(true);
  });
});
