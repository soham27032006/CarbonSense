/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { Request, Response } from "express";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase, supabaseAdmin } from "../config/supabase";
import { extractBearerToken } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import type { User } from "../types";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_SERVER_ERROR = 500;
const HTTP_BAD_GATEWAY = 502;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;
const FALLBACK_EMAIL = "user@carbonsense.local";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH).optional(),
  name: z.string().trim().min(1).max(MAX_NAME_LENGTH)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

type SignupInput = z.infer<typeof signupSchema>;
type LoginInput = z.infer<typeof loginSchema>;

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
};

function toAuthResponse(
  session: NonNullable<
    Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>["data"]["session"]
  >
): AuthResponse {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    token_type: session.token_type
  };
}

function displayNameFor(user: SupabaseUser, fallbackEmail: string): string {
  return (
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    fallbackEmail.split("@")[0]
  );
}

async function upsertExternalSignup(input: SignupInput, token: string) {
  const { data: authData, error: authError } = await supabase.auth.getUser(token);

  if (authError || !authData.user) {
    throw new AppError("Authentication required", HTTP_UNAUTHORIZED, "AUTH_REQUIRED");
  }

  if (authData.user.email && authData.user.email !== input.email) {
    throw new AppError("Email does not match authenticated user", HTTP_FORBIDDEN, "EMAIL_MISMATCH");
  }

  const profile = await upsertProfile(authData.user.id, input.email, input.name);
  return { user: authData.user, profile, session: null };
}

async function upsertProfile(id: string, email: string, name: string): Promise<User> {
  const { data: profile, error } = await supabaseAdmin
    .from("users")
    .upsert({ id, email, name }, { onConflict: "id" })
    .select()
    .single<User>();

  if (error) {
    throw new AppError(error.message, HTTP_SERVER_ERROR, "PROFILE_CREATE_FAILED");
  }

  return profile;
}

async function createPasswordSignup(input: Required<SignupInput>) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { name: input.name }
  });

  if (error) handleSignupError(error.message);
  if (!data.user) throw new AppError("Signup did not return a user", HTTP_BAD_GATEWAY, "SIGNUP_USER_MISSING");

  const profile = await createProfileOrRollback(data.user.id, input);
  const session = await signInCreatedUser(input);
  return { user: data.user, profile, session };
}

function handleSignupError(message: string): never {
  if (message.toLowerCase().includes("already been registered")) {
    throw new AppError("An account with this email already exists. Please log in.", HTTP_CONFLICT, "SIGNUP_EXISTS");
  }

  throw new AppError(message, HTTP_BAD_REQUEST, "SIGNUP_FAILED");
}

async function createProfileOrRollback(userId: string, input: SignupInput): Promise<User> {
  try {
    return await insertProfile(userId, input.email, input.name);
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw error;
  }
}

async function signInCreatedUser(input: Required<SignupInput>): Promise<AuthResponse> {
  const { data, error } = await supabase.auth.signInWithPassword(input);

  if (error || !data.session) {
    throw new AppError("Account created but automatic login failed", HTTP_BAD_GATEWAY, "SIGNUP_SESSION_MISSING");
  }

  return toAuthResponse(data.session);
}

async function getOrCreateLoginProfile(user: SupabaseUser, input: LoginInput): Promise<User> {
  const profile = await findProfile(user.id);
  if (profile) return profile;

  const email = user.email ?? input.email;
  return createRequiredProfile(user.id, email, displayNameFor(user, email), "PROFILE_NOT_FOUND");
}

async function getOrCreateCurrentProfile(user: SupabaseUser): Promise<User> {
  const profile = await findProfile(user.id);
  if (profile) return profile;

  const email = user.email ?? FALLBACK_EMAIL;
  return createRequiredProfile(user.id, email, displayNameFor(user, email), "PROFILE_CREATE_FAILED");
}

async function findProfile(userId: string): Promise<User | null> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle<User>();

  if (error) throw new AppError(error.message, HTTP_SERVER_ERROR, "PROFILE_LOOKUP_FAILED");
  return data;
}

async function insertProfile(id: string, email: string, name: string): Promise<User> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({ id, email, name })
    .select("*")
    .single<User>();

  if (error || !data) throw new AppError("Unable to create profile", HTTP_SERVER_ERROR, "PROFILE_CREATE_FAILED");
  return data;
}

async function createRequiredProfile(
  id: string,
  email: string,
  name: string,
  missingCode: string
): Promise<User> {
  try {
    return await insertProfile(id, email, name);
  } catch {
    throw new AppError("Profile not found for this account", HTTP_NOT_FOUND, missingCode);
  }
}

/**
 * Handles the signup API request and returns the existing response contract.
 * @param req - Input consumed by this workflow.
 * @param res - Input consumed by this workflow.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const input = signupSchema.parse(req.body);
  const data = input.password
    ? await createPasswordSignup(input as Required<SignupInput>)
    : await upsertExternalSignup(input, extractBearerToken(req));

  res.status(HTTP_CREATED).json({ success: true, data });
}

/**
 * Handles the login API request and returns the existing response contract.
 * @param req - Input consumed by this workflow.
 * @param res - Input consumed by this workflow.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const { data, error } = await supabase.auth.signInWithPassword(input);

  if (error) throw new AppError("Invalid email or password", HTTP_UNAUTHORIZED, "LOGIN_FAILED");
  if (!data.user || !data.session) throw new AppError("Login did not return a session", HTTP_BAD_GATEWAY, "LOGIN_SESSION_MISSING");

  const profile = await getOrCreateLoginProfile(data.user, input);
  res.status(HTTP_OK).json({ success: true, data: { user: data.user, profile, session: toAuthResponse(data.session) } });
}

/**
 * Handles the logout API request and returns the existing response contract.
 * @param req - Input consumed by this workflow.
 * @param res - Input consumed by this workflow.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = extractBearerToken(req);
  const { error } = await supabaseAdmin.auth.admin.signOut(token);

  if (error) throw new AppError(error.message, HTTP_UNAUTHORIZED, "LOGOUT_FAILED");
  res.status(HTTP_OK).json({ success: true, data: { message: "Logged out successfully" } });
}

/**
 * Handles the me API request and returns the existing response contract.
 * @param req - Input consumed by this workflow.
 * @param res - Input consumed by this workflow.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new AppError("Authentication required", HTTP_UNAUTHORIZED, "AUTH_REQUIRED");

  const profile = await getOrCreateCurrentProfile(req.user);
  res.status(HTTP_OK).json({ success: true, data: { user: req.user, profile } });
}
