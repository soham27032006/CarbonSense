import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { SUPABASE_REQUEST_TIMEOUT_MS } from "./timeouts";

const fetchWithTimeout: typeof fetch = (input, init) => {
  const requestInit = init ?? {};
  const externalSignal = requestInit.signal;

  if (externalSignal?.aborted) {
    return Promise.reject(new DOMException("Request aborted", "AbortError"));
  }

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), SUPABASE_REQUEST_TIMEOUT_MS);

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      return Promise.reject(new DOMException("Request aborted", "AbortError"));
    }
    externalSignal.addEventListener("abort", () => timeoutController.abort(), { once: true });
  }

  return fetch(input, { ...requestInit, signal: timeoutController.signal }).finally(() => {
    clearTimeout(timeoutId);
  });
};

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false
  },
  global: {
    fetch: fetchWithTimeout
  }
});

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false
    },
    global: {
      fetch: fetchWithTimeout
    }
  }
);
