import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-10 text-center">
      <p className="text-5xl font-bold">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        We couldn&apos;t find that page. The stock symbol may be wrong, or the
        page may have moved.
      </p>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/methodology">Methodology</Link>
        </Button>
      </div>
    </div>
  );
}
