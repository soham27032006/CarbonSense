import { vi } from "vitest";
import { supabaseAdminMock } from "./helpers/supabase";

vi.mock("../src/config/supabase", () => ({
  supabaseAdmin: supabaseAdminMock,
  supabase: supabaseAdminMock
}));

vi.mock("../src/config/env", () => ({
  env: {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
    GEMINI_API_KEY: "gemini",
    PLAID_CLIENT_ID: "plaid-client",
    PLAID_SECRET: "plaid-secret",
    PLAID_ENV: "sandbox",
    PLAID_REDIRECT_URI: "",
    STRIPE_SECRET_KEY: "",
    STRIPE_WEBHOOK_SECRET: "",
    REDIS_URL: "",
    PORT: 3001,
    NODE_ENV: "test",
    FRONTEND_URL: "",
    JWT_SECRET: "x".repeat(32),
    ADMIN_JOB_SECRET: "y".repeat(32)
  }
}));

vi.mock("../src/config/redis", () => ({
  redis: null,
  redisEnabled: false
}));

vi.mock("../src/services/ai.service", () => ({
  chatWithAI: vi.fn(async () => "Test insight"),
  classifyCarbon: vi.fn(async () => ({
    carbon_category: "shopping",
    emission_factor_per_dollar: 0.1,
    reasoning: "mocked"
  })),
  extractJson: vi.fn((value: string) => value)
}));
