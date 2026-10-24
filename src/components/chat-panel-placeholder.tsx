import { MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Placeholder for the filings chat (real implementation in Phase 9). */
export function ChatPanelPlaceholder({ name }: { name: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" aria-hidden="true" />
          Ask about {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        The filings-grounded AI chat arrives in a later phase. It will answer
        only from this company&apos;s official filings and cite the page.
      </CardContent>
    </Card>
  );
}
