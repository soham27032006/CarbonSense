import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import axios from "axios";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { User as UserIcon, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { AuthLayout } from "@/layouts/AuthLayout";
import {
  Field,
  PasswordStrength,
  GoogleButton,
  Divider,
} from "@/components/AuthFormFields";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error("Fill in all fields");
      return;
    }
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }

    try {
      setLoading(true);
      const { data } = await api.post<{
        user: { id: string; email?: string | null };
        profile: { onboarding_complete?: boolean | null };
        session: {
          access_token: string;
          refresh_token: string;
        } | null;
      }>("/auth/signup", { email, password, name });

      if (!data.session) {
        throw new Error("Account created but login session is missing");
      }

      const { error } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (error) {
        throw error;
      }

      toast.success("Welcome to CarbonSense!");
      navigate({ to: "/onboarding" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not create your account";

      if (message.toLowerCase().includes("rate limit")) {
        toast.error(
          "Email signup is cooling down. Try logging in if the account already exists.",
        );
      } else if (axios.isAxiosError(error)) {
        const apiMessage =
          (error.response?.data as { error?: { message?: string } } | undefined)?.error
            ?.message ?? message;
        toast.error(apiMessage);
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setGoogleLoading(false);
      toast.error(error.message || "Google sign-in failed");
      return;
    }

    if (data.url) {
      window.location.href = data.url;
      return;
    }

    setGoogleLoading(false);
    toast.error("Google sign-in could not start");
  }

  return (
    <AuthLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Start turning everyday choices into impact.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <Field
            label="Name"
            type="text"
            autoComplete="name"
            placeholder="Alex Rivers"
            value={name}
            onChange={(e) => setName(e.target.value)}
            icon={<UserIcon className="h-4 w-4" />}
          />
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            placeholder="you@earth.io"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="h-4 w-4" />}
          />
          <div>
            <Field
              label="Password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Lock className="h-4 w-4" />}
            />
            <PasswordStrength value={password} />
          </div>
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat it"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            icon={<Lock className="h-4 w-4" />}
            error={confirm && confirm !== password ? "Passwords don't match" : undefined}
          />

          <button
            type="submit"
            disabled={loading}
            className="group mt-2 flex items-center justify-center gap-2 rounded-2xl gradient-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-70"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                Create account
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        <Divider text="or" />
        <GoogleButton
          onClick={handleGoogle}
          loading={googleLoading}
          label="Sign up with Google"
        />

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            Log in
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}
