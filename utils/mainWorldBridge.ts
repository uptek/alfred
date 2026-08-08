/**
 * postMessage RPC between an isolated-world content script (client) and a
 * MAIN-world script (server) sharing the same window. Wire shape per namespace:
 *
 *   request:  { type: `alfred:${namespace}_request`,  requestId, method, payload? }
 *   response: { type: `alfred:${namespace}_response`, requestId, data? , error? }
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

const DEFAULT_TIMEOUT_MS = 10_000;

export interface BridgeClient<M extends string = string> {
  /**
   * Calls a method on the namespace's main-world server.
   * @param method - Server method name.
   * @param payload - Structured-cloneable argument for the method.
   * @param timeoutMs - Per-call override of the client's timeout.
   * @returns The method's result; rejects on server error or timeout.
   */
  call<T>(method: M, payload?: unknown, timeoutMs?: number): Promise<T>;
}

/**
 * Creates the isolated-world side of the bridge.
 * @param namespace - Shared namespace; must match the server's.
 * @param defaultTimeoutMs - Rejection deadline applied when a call has no override.
 */
export function createBridgeClient<M extends string = string>(
  namespace: string,
  defaultTimeoutMs: number = DEFAULT_TIMEOUT_MS
): BridgeClient<M> {
  const requestType = `alfred:${namespace}_request`;
  const responseType = `alfred:${namespace}_response`;
  let counter = 0;

  return {
    call<T>(method: M, payload?: unknown, timeoutMs: number = defaultTimeoutMs): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const requestId = `${namespace}_${Date.now()}_${(counter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        let timeoutId: ReturnType<typeof setTimeout>;

        function handler(event: MessageEvent) {
          if (event.source !== window) return;
          const data = event.data as BridgeResponse | undefined;
          if (data?.type !== responseType || data.requestId !== requestId) return;

          window.removeEventListener('message', handler);
          clearTimeout(timeoutId);

          if (data.error !== undefined) {
            reject(new Error(data.error));
          } else {
            resolve(data.data as T);
          }
        }

        window.addEventListener('message', handler);

        timeoutId = setTimeout(() => {
          window.removeEventListener('message', handler);
          reject(new Error(`${namespace} bridge timeout: ${method} did not respond within ${timeoutMs}ms`));
        }, timeoutMs);

        const request: BridgeRequest = { type: requestType, requestId, method, payload };
        window.postMessage(request, window.location.origin);
      });
    }
  };
}

/**
 * Creates the main-world side of the bridge: listens for the namespace's
 * requests and answers each with the named method's result or its error.
 * @param namespace - Shared namespace; must match the client's.
 * @param methods - Method table; results must be structured-cloneable.
 */
export function createBridgeServer(namespace: string, methods: Record<string, (payload: never) => unknown>): void {
  const requestType = `alfred:${namespace}_request`;
  const responseType = `alfred:${namespace}_response`;

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data as Partial<BridgeRequest> | undefined;
    if (data?.type !== requestType || typeof data.requestId !== 'string') return;

    const respond = (body: Partial<Pick<BridgeResponse, 'data' | 'error'>>) => {
      window.postMessage({ type: responseType, requestId: data.requestId, ...body }, window.location.origin);
    };

    const handler = typeof data.method === 'string' ? methods[data.method] : undefined;
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
