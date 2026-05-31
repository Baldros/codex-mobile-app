// Generic value coercion and string helpers shared across the bridge state and
// its domain mappers. These are intentionally dependency-free so any module can
// reuse them without pulling in domain types.

export function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function lowerString(value: unknown) {
  return typeof value === "string" ? value.toLowerCase() : null;
}

export function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function trimMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  const half = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, half)}...${value.slice(value.length - half)}`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function stringifyPayload(value: unknown) {
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

export function firstText(...values: unknown[]): string | null {
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

export function optionalText(...values: unknown[]): string | undefined {
  return firstText(...values) ?? undefined;
}

export function textEntries(value: unknown): string[] {
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
