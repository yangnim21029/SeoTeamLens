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
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(
      "GSC DB endpoint is empty. Please set GSC_DB_ENDPOINT, GSC_DB_URL, or GSC_DB_BASE_URL.",
    );
  }
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
  if (!envValue) {
    throw new Error(
      "Missing GSC DB endpoint. Set GSC_DB_ENDPOINT, GSC_DB_URL, or GSC_DB_BASE_URL.",
    );
  }
  return normaliseEndpoint(envValue);
}
