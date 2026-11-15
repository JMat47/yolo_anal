// The server's endpoints. Each call returns parsed JSON or throws an ApiError with a kind the screen can word:
// the server's own error kind, "server-lost" when the server can't be reached, or "aborted".

export class ApiError extends Error {
  constructor(kind, status = 0, body = null) {
    super(kind);
    this.kind = kind;
    this.status = status;
    this.body = body;
  }
}

const HEALTH_TIMEOUT_MS = 3000;

export const getHealth = () => request("/health", { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
export const getConfig = () => request("/api/config");
export const getPhotos = () => request("/api/photos");

export function prepare(file, signal) {
  const form = new FormData();
  form.append("file", file, file.name);
  return request("/api/prepare", { method: "POST", body: form, signal });
}

export function scan(imageId, seq, signal) {
  return request("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_id: imageId, seq }),
    signal,
  });
}

async function request(path, init = {}) {
  let response;
  let body = null;
  try {
    response = await fetch(path, { cache: "no-store", ...init });
    body = await response.json().catch((err) => {
      if (err.name === "AbortError") throw err;
      return null;   // a body that isn't JSON: the status alone decides the kind below
    });
  } catch (err) {
    // A health poll that outlives its timeout is a "timeout"; the state decides whether that is only a missed poll.
    throw new ApiError(err.name === "AbortError" ? "aborted" : err.name === "TimeoutError" ? "timeout" : "server-lost");
  }
  if (!response.ok) {
    const kind = body?.error?.kind ?? (response.status >= 500 ? "model-error" : "unreadable");
    throw new ApiError(kind, response.status, body);
  }
  return body;
}
