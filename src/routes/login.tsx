import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";

import { signIn, useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * /login — merchant sign-in. Shop4U-branded (not the demo tenant's
 * brand) since this is the platform's login page, not a per-merchant
 * customer login.
 *
 * Accepts ?redirect=/admin/products etc. to bounce the user back to
 * where they were trying to go.
 */
const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: searchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/login" });
  const user = useAuthStore((s) => s.user);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // If already signed in, bounce straight to admin (or the requested redirect).
  useEffect(() => {
    if (user) {
      navigate({ to: redirect ?? "/admin", replace: true });
    }
  }, [user, redirect, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    // onAuthStateChange will fire and the useEffect above will redirect.
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Link to="/" className="font-heading text-2xl font-bold">
            Shop4U<span className="text-primary">.</span>
          </Link>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted mt-2">
            Merchant console
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-border bg-surface p-6">
          <h1 className="font-heading text-xl font-semibold mb-2">Sign in</h1>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-danger border border-danger/30 bg-danger/5 rounded-sm px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>

          <p className="text-xs text-muted text-center pt-2">
            Don&apos;t have an account?{" "}
            <span className="text-text">Contact your platform admin.</span>
          </p>
        </form>
      </div>
    </div>
  );
}
