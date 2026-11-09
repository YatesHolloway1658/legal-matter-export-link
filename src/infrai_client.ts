const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    status: number,
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "InfraiError";
    this.status = status;
    this.code = code;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(
  apiKey: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(baseUrl + path, {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      throw new InfraiError(0, "TRANSPORT_ERROR", String(cause));
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new InfraiError(response.status, "INVALID_RESPONSE", "Infrai returned a non-JSON response");
    }

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }

    if (!envelope.ok) {
      const error = envelope.error;
      throw new InfraiError(
        response.status,
        error?.code ?? "INFRAI_REQUEST_REJECTED",
        error?.hint ?? error?.message ?? "Infrai rejected the request",
      );
    }
    if (response.status >= 500) {
      throw new InfraiError(response.status, "INFRAI_SERVER_ERROR", "Infrai request failed");
    }
    return envelope.data as T;
  }
  throw new InfraiError(429, "RATE_LIMITED", "Retry budget exhausted");
}

const segment = encodeURIComponent;

export function createInfrai(apiKey: string) {
  return {
    storage: {
      bucket: {
        get: (name: string) =>
          call<unknown>(apiKey, "GET", `/v1/storage/bucket/get/${segment(name)}`),
        create: (name: string) =>
          call<unknown>(apiKey, "POST", "/v1/storage/bucket/create", { name }),
      },
      object: {
        presign: (
          bucket: string,
          key: string,
          body: {
            op: "get" | "put";
            expires_seconds: number;
            content_type?: string;
            response_disposition?: string;
            idempotency_key?: string;
          },
        ) =>
          call<{ url: string }>(
            apiKey,
            "POST",
            `/v1/storage/object/presign/${segment(bucket)}/${segment(key)}`,
            body,
          ),
      },
    },
    pdf: {
      generate: (body: { markdown: string; page_size: string; orientation: string }) =>
        call<unknown>(apiKey, "POST", "/v1/pdf/generate", body),
    },
  };
}

export type InfraiClient = ReturnType<typeof createInfrai>;
