import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Disclaimer } from "@/components/disclaimer";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to StockLens</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Google sign-in arrives in Phase 2. This is the Phase 0 scaffold.
          </p>
          <Disclaimer variant="compact" />
        </CardContent>
      </Card>
    </div>
  );
}
