import AsyncStorage from "@react-native-async-storage/async-storage";

import { DEFAULT_PREFERENCES } from "../config/defaults";
import type { BridgePreferences } from "../domain/bridge";

const STORAGE_KEY = "codex-mobile.preferences.v1";

export async function loadPreferences(): Promise<BridgePreferences> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return DEFAULT_PREFERENCES;
  }

  try {
    return {
      ...DEFAULT_PREFERENCES,
      ...(JSON.parse(raw) as Partial<BridgePreferences>)
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: BridgePreferences) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
