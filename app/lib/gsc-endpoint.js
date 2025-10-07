const DEFAULT_GSC_DB_ENDPOINT = "https://slug-unique-possum.ngrok-free.app/api/query";

function readEnv(keys) {
  for (const key of keys) {
    const raw = process.env[key];
    if (typeof raw === "string" && raw.trim()) {
      return raw.trim();
    }
  }
  return undefined;
}

function normaliseEndpoint(value) {
  if (!value) return DEFAULT_GSC_DB_ENDPOINT;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_GSC_DB_ENDPOINT;
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  if (/\/api\/query$/i.test(withoutTrailing)) {
    return withoutTrailing;
  }
  return `${withoutTrailing}/api/query`;
}

export function getGscDbEndpoint() {
  const envValue = readEnv([
    "GSC_DB_ENDPOINT",
    "GSC_DB_URL",
    "GSC_DB_BASE_URL",
  ]);
  return normaliseEndpoint(envValue);
}
