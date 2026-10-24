import { redirect } from "next/navigation";
import { getCurrentUser, getDisplayName } from "@/lib/auth";
import { Disclaimer } from "@/components/disclaimer";

// Auth-dependent: render per request, never prerender at build time.
export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  // Middleware already guards this route; this is a defense-in-depth check.
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?next=/portfolio");
  }

  return (
    <div className="container flex flex-col gap-6 py-10">
      <h1 className="text-2xl font-bold tracking-tight">My Portfolio</h1>
      <p className="text-muted-foreground">
        Welcome, {getDisplayName(user)}. Holdings, sector concentration, beta,
        and the market-drop stress test arrive in Phase 10.
      </p>
      <Disclaimer />
    </div>
  );
}
