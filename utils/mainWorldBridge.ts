/**
 * postMessage RPC between an isolated-world content script (client) and a
 * MAIN-world script (server) sharing the same window. Wire shape per namespace:
 *
 *   request:  { type: `alfred:${namespace}_request`,  requestId, method, payload? }
 *   response: { type: `alfred:${namespace}_response`, requestId, data? , error? }
 *
 * Both sides are typed against the same method table (`M`), so a method added
 * on one side without the other is a compile error, and `call` infers its
 * payload and result types from the table.
 *
 * Messages are posted with `window.location.origin` as the target origin and
 * only accepted from `event.source === window`, so nothing leaks cross-origin.
 */

interface BridgeRequest {
  type: string;
  requestId: string;
  method: string;
  payload?: unknown;
}

interface BridgeResponse {
  type: string;
  requestId: string;
  data?: unknown;
  error?: string;
}

/** A namespace's method table: what the server implements and the client calls. */
export type BridgeMethods = Record<string, (payload: never) => unknown>;

type PayloadOf<F> = F extends (payload: infer P) => unknown ? P : never;
type ResultOf<F> = F extends (payload: never) => infer R ? Awaited<R> : never;

const DEFAULT_TIMEOUT_MS = 10_000;

export interface BridgeClient<M extends BridgeMethods> {
  /**
   * Calls a method on the namespace's main-world server.
   * @param method - Server method name.
   * @param payload - Structured-cloneable argument for the method.
   * @param timeoutMs - Per-call override of the client's timeout.
   * @returns The method's result; rejects on server error or timeout.
   */
  call<K extends keyof M & string>(method: K, payload?: PayloadOf<M[K]>, timeoutMs?: number): Promise<ResultOf<M[K]>>;
}

interface PendingCall {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

/**
 * Creates the isolated-world side of the bridge. One window listener serves
 * all of the client's calls, dispatching responses by request id.
 * @param namespace - Shared namespace; must match the server's.
 * @param defaultTimeoutMs - Rejection deadline applied when a call has no override.
 */
export function createBridgeClient<M extends BridgeMethods>(
  namespace: string,
  defaultTimeoutMs: number = DEFAULT_TIMEOUT_MS
): BridgeClient<M> {
  const requestType = `alfred:${namespace}_request`;
  const responseType = `alfred:${namespace}_response`;
  const pending = new Map<string, PendingCall>();
  // Per-instance prefix: two clients on one namespace in the same window (a
  // re-injected content script) would otherwise both start counting at 0 and
  // resolve each other's calls.
  const idPrefix = `${namespace}_${Math.random().toString(36).slice(2, 8)}`;
  let counter = 0;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as BridgeResponse | undefined;
    if (data?.type !== responseType || typeof data.requestId !== 'string') return;

    const entry = pending.get(data.requestId);
    if (!entry) return;
    pending.delete(data.requestId);
    clearTimeout(entry.timeoutId);

    if (data.error !== undefined) {
      entry.reject(new Error(data.error));
    } else {
      entry.resolve(data.data);
    }
  });

  function call(method: string, payload?: unknown, timeoutMs: number = defaultTimeoutMs): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const requestId = `${idPrefix}_${counter++}`;

      const timeoutId = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${namespace} bridge timeout: ${method} did not respond within ${timeoutMs}ms`));
      }, timeoutMs);

      pending.set(requestId, { resolve, reject, timeoutId });
      const request: BridgeRequest = { type: requestType, requestId, method, payload };
      window.postMessage(request, window.location.origin);
    });
  }

  return { call } as BridgeClient<M>;
}

/**
 * Creates the main-world side of the bridge: listens for the namespace's
 * requests and answers each with the named method's result or its error.
 * @param namespace - Shared namespace; must match the client's.
 * @param methods - Method table; results must be structured-cloneable.
 */
export function createBridgeServer<M extends BridgeMethods>(namespace: string, methods: M): void {
  const requestType = `alfred:${namespace}_request`;
  const responseType = `alfred:${namespace}_response`;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as Partial<BridgeRequest> | undefined;
    if (data?.type !== requestType || typeof data.requestId !== 'string') return;

    const respond = (body: Partial<Pick<BridgeResponse, 'data' | 'error'>>) => {
      window.postMessage({ type: responseType, requestId: data.requestId, ...body }, window.location.origin);
    };

    const handler = typeof data.method === 'string' ? (methods as BridgeMethods)[data.method] : undefined;
    if (!handler) {
      respond({ error: `Unknown method: ${String(data.method)}` });
      return;
    }

    Promise.resolve()
      .then(() => handler(data.payload as never))
      .then(
        (result) => respond({ data: result }),
        (err: unknown) => respond({ error: err instanceof Error ? err.message : String(err) })
      );
  });
}
