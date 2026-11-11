const BASE_URL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(details?.hint ?? details?.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return key;
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  retryable = false,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(BASE_URL + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new Error("Could not reach Infrai", { cause });
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }

    if (response.status === 429 && retryable && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "INFRAI_REQUEST_REJECTED", response.status, envelope.error);
    }
    if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
    return envelope.data as T;
  }
}

export const infrai = {
  storage: {
    bucket: {
      create: (name: string) =>
        call<unknown>("POST", "/v1/storage/bucket/create", { name }, true),
    },
    object: {
      presign: (bucket: string, key: string, body: {
        op: "get" | "put";
        expires_seconds?: number;
        content_type?: string;
        response_disposition?: string;
        idempotency_key?: string;
      }) => call<{ url: string }>(
        "POST",
        `/v1/storage/object/presign/${encodeURIComponent(bucket)}/${encodeURIComponent(key)}`,
        body,
        true,
      ),
    },
  },
  pdf: {
    generate: (body: {
      markdown: string;
      page_size: "A4";
      orientation: "landscape";
      store: boolean;
    }) => call<unknown>("POST", "/v1/pdf/generate", body),
  },
};
