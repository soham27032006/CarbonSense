const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_URL =
  configuredApiUrl && configuredApiUrl.length > 0
    ? configuredApiUrl
    : import.meta.env.DEV
    ? "http://localhost:3001"
    : "";

export const API_BASE = `${API_URL}/api`;
