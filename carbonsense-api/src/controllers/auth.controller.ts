import type { Request, Response } from "express";
import { z } from "zod";
import { supabase, supabaseAdmin } from "../config/supabase";
import { extractBearerToken } from "../middleware/auth";
import { AppError } from "../middleware/errorHandler";
import type { User } from "../types";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  name: z.string().trim().min(1).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

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

export async function signup(req: Request, res: Response): Promise<void> {
  const input = signupSchema.parse(req.body);

  if (!input.password) {
    const token = extractBearerToken(req);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData.user) {
      throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
    }

    if (authData.user.email && authData.user.email !== input.email) {
      throw new AppError(
        "Email does not match authenticated user",
        403,
        "EMAIL_MISMATCH"
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("users")
      .upsert(
        {
          id: authData.user.id,
          email: input.email,
          name: input.name
        },
        { onConflict: "id" }
      )
      .select()
      .single<User>();

    if (profileError) {
      throw new AppError(profileError.message, 500, "PROFILE_CREATE_FAILED");
    }

    res.status(201).json({
      success: true,
      data: {
        user: authData.user,
        profile,
        session: null
      }
    });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: input.name
    }
  });

  if (error) {
    if (error.message.toLowerCase().includes("already been registered")) {
      throw new AppError(
        "An account with this email already exists. Please log in.",
        409,
        "SIGNUP_EXISTS"
      );
    }

    throw new AppError(error.message, 400, "SIGNUP_FAILED");
  }

  if (!data.user) {
    throw new AppError("Signup did not return a user", 502, "SIGNUP_USER_MISSING");
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .insert({
      id: data.user.id,
      email: input.email,
      name: input.name
    })
    .select()
    .single<User>();

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(data.user.id);
    throw new AppError(profileError.message, 500, "PROFILE_CREATE_FAILED");
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password
    });

  if (sessionError || !sessionData.session) {
    throw new AppError(
      "Account created but automatic login failed",
      502,
      "SIGNUP_SESSION_MISSING"
    );
  }

  res.status(201).json({
    success: true,
    data: {
      user: data.user,
      profile,
      session: toAuthResponse(sessionData.session)
    }
  });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const { data, error } = await supabase.auth.signInWithPassword(input);

  if (error) {
    throw new AppError("Invalid email or password", 401, "LOGIN_FAILED");
  }

  if (!data.user || !data.session) {
    throw new AppError("Login did not return a session", 502, "LOGIN_SESSION_MISSING");
  }

  let { data: profile, error: profileError } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", data.user.id)
    .maybeSingle<User>();

  if (profileError) {
    throw new AppError(profileError.message, 500, "PROFILE_LOOKUP_FAILED");
  }

  if (!profile) {
    const { data: createdProfile, error: createProfileError } = await supabaseAdmin
      .from("users")
      .insert({
        id: data.user.id,
        email: data.user.email ?? input.email,
        name:
          ((data.user.user_metadata?.name as string | undefined) ??
            (data.user.user_metadata?.full_name as string | undefined) ??
            input.email.split("@")[0])
      })
      .select("*")
      .single<User>();

    if (createProfileError || !createdProfile) {
      throw new AppError("Profile not found for this account", 404, "PROFILE_NOT_FOUND");
    }

    profile = createdProfile;
  }

  res.status(200).json({
    success: true,
    data: {
      user: data.user,
      profile,
      session: toAuthResponse(data.session)
    }
  });
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = extractBearerToken(req);
  const { error } = await supabaseAdmin.auth.admin.signOut(token);

  if (error) {
    throw new AppError(error.message, 401, "LOGOUT_FAILED");
  }

  res.status(200).json({
    success: true,
    data: {
      message: "Logged out successfully"
    }
  });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  const { data: profile, error } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("id", req.user.id)
    .single<User>();

  if (error) {
    throw new AppError(error.message, 404, "PROFILE_NOT_FOUND");
  }

  res.status(200).json({
    success: true,
    data: {
      user: req.user,
      profile
    }
  });
}
