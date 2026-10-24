import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";
import { GoogleSignInButton } from "@/components/google-sign-in-button";

// Reads the current session to skip the form when already signed in.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;

  // Already signed in: skip the login screen.
  const user = await getCurrentUser();
  if (user) {
    redirect(next && next.startsWith("/") ? next : "/");
  }

  const safeNext = next && next.startsWith("/") ? next : "/";

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>Sign in to FilingLens</CardTitle>
          <CardDescription>
            Sign in to chat with filings and build a portfolio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Sign-in failed: {error}</span>
            </div>
          ) : null}

          <GoogleSignInButton next={safeNext} />

          <Disclaimer variant="compact" className="text-center" />
        </CardContent>
      </Card>
    </div>
  );
}
