export function formatDateTime(value?: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function compactPath(path: string, maxLength = 38) {
  if (path.length <= maxLength) {
    return path;
  }

  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return path.slice(0, maxLength - 1);
  }

  const tail = parts.slice(-2).join("\\");
  const root = path.startsWith("\\\\") ? "\\\\" : parts[0] ?? "";
  return `${root}\\...\\${tail}`;
}
