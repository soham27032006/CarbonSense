import { vi } from "vitest";

type SupabaseResponse = { data?: unknown; error?: unknown; count?: number | null };

type SupabaseCall = {
  table: string;
  operation: string;
  payload?: unknown;
  selectArgs?: unknown[];
  filters: Array<{ method: string; args: unknown[] }>;
};

type SupabaseHandler = (call: SupabaseCall) => SupabaseResponse | Promise<SupabaseResponse>;

let handler: SupabaseHandler = () => ({ data: null, error: null, count: null });

class QueryBuilder {
  private readonly call: SupabaseCall;

  constructor(table: string) {
    this.call = { table, operation: "query", filters: [] };
  }

  select(...args: unknown[]) { this.call.selectArgs = args; return this; }
  eq(...args: unknown[]) { this.call.filters.push({ method: "eq", args }); return this; }
  in(...args: unknown[]) { this.call.filters.push({ method: "in", args }); return this; }
  gte(...args: unknown[]) { this.call.filters.push({ method: "gte", args }); return this; }
  lte(...args: unknown[]) { this.call.filters.push({ method: "lte", args }); return this; }
  lt(...args: unknown[]) { this.call.filters.push({ method: "lt", args }); return this; }
  not(...args: unknown[]) { this.call.filters.push({ method: "not", args }); return this; }
  order(...args: unknown[]) { this.call.filters.push({ method: "order", args }); return this; }
  limit(...args: unknown[]) { this.call.filters.push({ method: "limit", args }); return this; }
  range(...args: unknown[]) { this.call.filters.push({ method: "range", args }); return this; }

  update(payload: unknown) { this.call.operation = "update"; this.call.payload = payload; return this; }
  insert(payload: unknown) { this.call.operation = "insert"; this.call.payload = payload; return this; }
  upsert(payload: unknown) { this.call.operation = "upsert"; this.call.payload = payload; return this; }
  delete() { this.call.operation = "delete"; return this; }

  single<T>() { return this.resolve<T>("single"); }
  maybeSingle<T>() { return this.resolve<T>("maybeSingle"); }

  then<TResult1 = SupabaseResponse, TResult2 = never>(
    onfulfilled?: ((value: SupabaseResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return this.resolve("then").then(onfulfilled, onrejected);
  }

  private async resolve<T>(operation: string): Promise<SupabaseResponse & { data?: T }> {
    return handler({ ...this.call, operation });
  }
}

export const supabaseAdminMock = {
  from: vi.fn((table: string) => new QueryBuilder(table)),
  rpc: vi.fn(async () => ({ data: null, error: null })),
  auth: {
    admin: {
      deleteUser: vi.fn(async () => ({ error: null }))
    }
  }
};

export function setSupabaseHandler(nextHandler: SupabaseHandler) {
  handler = vi.fn(nextHandler);
}

export function resetSupabaseMock() {
  handler = () => ({ data: null, error: null, count: null });
  supabaseAdminMock.from.mockClear();
  supabaseAdminMock.rpc.mockClear();
  supabaseAdminMock.auth.admin.deleteUser.mockClear();
}

export function hasFilter(call: SupabaseCall, method: string, column: string, value?: unknown): boolean {
  return call.filters.some((filter) =>
    filter.method === method &&
    filter.args[0] === column &&
    (arguments.length < 4 || filter.args[1] === value)
  );
}

export type { SupabaseCall, SupabaseResponse };
