import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * /reset-password — landing page for Supabase invite and password-recovery
 * emails, and the "Forgot password?" request form.
 *
 * The Supabase client is created with detectSessionInUrl: false, so the
 * access/refresh tokens in the link's #hash are read and applied here by
 * hand. With a valid link the user chooses a new password; with no link
 * (or an expired one) they can request a fresh email.
 */
export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

type Mode = "checking" | "set" | "request" | "sent";
type Init = { mode: Mode; notice: string | null };

async function readLink(): Promise<Init> {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  const hadLinkParams = !!(accessToken || params.get("error_description"));
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) return { mode: "set", notice: null };
  }
  return {
    mode: "request",
    notice: hadLinkParams
      ? "This link has expired or has already been used. Enter your email and we'll send a new one."
      : null,
  };
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("checking");
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const initRef = useRef<Promise<Init> | null>(null);

  useEffect(() => {
    let alive = true;
    initRef.current ??= readLink();
    initRef.current.then((r) => {
      if (!alive) return;
      setMode(r.mode);
      setNotice(r.notice);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (err && err.status === 429) {
      setError("Too many requests. Please wait a few minutes and try again.");
      return;
    }
    // Same message whether or not the email has an account.
    setMode("sent");
  };

  const onSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const message = validateNewPassword(password, confirm);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.success("Password saved");
    navigate({ to: "/admin", replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Link to="/" className="inline-block rounded-md bg-[#031c3b] px-5 py-3">
            <img src="/logo.png" alt="YouCommerce" className="h-9 mx-auto" />
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mt-2">
            Merchant console
          </p>
        </div>

        <div className="rounded-md border border-border bg-surface p-6">
          {mode === "checking" && <p className="text-sm text-muted">Checking your link…</p>}

          {mode === "set" && (
            <form onSubmit={onSet} className="space-y-4">
              <h1 className="font-heading text-xl font-semibold">Choose a password</h1>
              <p className="text-sm text-muted">
                At least {MIN_PASSWORD_LENGTH} characters. You'll use it to sign in to your admin.
              </p>
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-danger border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Saving…" : "Save password"}
              </Button>
            </form>
          )}

          {mode === "request" && (
            <form onSubmit={onRequest} className="space-y-4">
              <h1 className="font-heading text-xl font-semibold">Reset your password</h1>
              {notice ? (
                <p className="text-sm text-danger border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
                  {notice}
                </p>
              ) : (
                <p className="text-sm text-muted">
                  Enter the email you sign in with and we'll send you a link to choose a new password.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-danger border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </Button>
              <p className="text-xs text-center pt-2">
                <Link to="/login" className="text-muted hover:text-text">
                  Back to sign in
                </Link>
              </p>
            </form>
          )}

          {mode === "sent" && (
            <div className="space-y-4">
              <h1 className="font-heading text-xl font-semibold">Check your email</h1>
              <p className="text-sm text-muted">
                If an account exists for {email.trim()}, we've sent a link to choose a new password.
                It can take a few minutes, and may land in spam.
              </p>
              <Link to="/login" className="inline-block text-sm text-muted hover:text-text">
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
