import { AsyncLocalStorage } from "node:async_hooks";
// Request-scoped bindings prevent one request's runtime from contaminating another.
// The same code falls back to server environment variables in standard Next.js.
const key = Symbol.for("marlene.runtime");
const scope = globalThis as typeof globalThis & {
  [key]?: AsyncLocalStorage<Cloudflare.Env>;
};
const storage = (scope[key] ??= new AsyncLocalStorage<Cloudflare.Env>());
export const env = new Proxy({} as Cloudflare.Env, {
  get: (_target, name) =>
    storage.getStore()?.[name as keyof Cloudflare.Env] ??
    process.env[String(name)],
});
export function runWithGameEnv<T>(
  bindings: Cloudflare.Env,
  callback: () => T,
): T {
  return storage.run(bindings, callback);
}
