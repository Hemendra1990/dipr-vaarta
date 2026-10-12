// Thin client for the Spring Boot API. The JWT lives in sessionStorage so closing the tab signs out.

const KEY = "v360-token";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export const token = {
  get: () => (typeof window === "undefined" ? null : sessionStorage.getItem(KEY)),
  set: (t: string) => sessionStorage.setItem(KEY, t),
  clear: () => sessionStorage.removeItem(KEY),
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (f: () => void) => (onUnauthorized = f);

async function request<T>(method: string, path: string, body?: unknown, raw = false): Promise<T> {
  const headers: Record<string, string> = {};
  const t = token.get();
  if (t) headers.Authorization = "Bearer " + t;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch("/api" + path, { method, headers, body: payload });
  if (res.status === 401 && t && !path.startsWith("/auth/login")) {
    token.clear();
    onUnauthorized?.();
  }
  if (!res.ok) {
    let msg = res.statusText || "Request failed";
    let code: string | undefined;
    try {
      const j = await res.json();
      msg = j.message || msg;
      code = j.code;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, msg, code);
  }
  if (raw) return res as unknown as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  get: <T>(p: string) => request<T>("GET", p),
  post: <T>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  upload: <T>(p: string, f: FormData) => request<T>("POST", p, f),
  async download(p: string, fallbackName: string) {
    const res = await request<Response>("GET", p, undefined, true);
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return name;
  },
};
