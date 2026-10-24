"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import type { PositionValue } from "@/lib/portfolio/types";
import { deleteHolding } from "@/app/portfolio/actions";
import {
  formatPrice,
  formatSignedRupee,
  NOT_AVAILABLE,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PortfolioTableProps {
  positions: PositionValue[];
}

/** Holdings table. Values labeled historical / delayed. */
export function PortfolioTable({ positions }: PortfolioTableProps) {
  const router = useRouter();
  const [toDelete, setToDelete] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const result = await deleteHolding(toDelete);
    setDeleting(false);
    setToDelete(null);
    if (result.ok) {
      toast.success("Holding removed.");
      router.refresh();
    } else {
      toast.error(result.error ?? "Could not remove.");
    }
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Stock</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Avg price</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead className="text-right">P&amp;L</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((p) => (
              <TableRow key={p.symbol}>
                <TableCell>
                  <Link
                    href={`/stocks/${encodeURIComponent(p.symbol)}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {p.symbol}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(p.avgBuyPrice)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(p.currentPrice)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(p.value)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {p.weight != null ? `${(p.weight * 100).toFixed(1)}%` : NOT_AVAILABLE}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    p.pnl == null ? "" : p.pnl >= 0 ? "text-strong" : "text-weak",
                  )}
                >
                  {p.pnl == null ? (
                    NOT_AVAILABLE
                  ) : (
                    <>
                      {formatSignedRupee(p.pnl)}
                      {p.pnlPct != null ? (
                        <span className="block text-xs">
                          {p.pnlPct >= 0 ? "+" : ""}
                          {p.pnlPct.toFixed(1)}%
                        </span>
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`Remove ${p.symbol}`}
                    onClick={() => setToDelete(p.symbol)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        P&amp;L is historical, based on delayed prices.
      </p>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {toDelete}?</DialogTitle>
            <DialogDescription>
              This removes the holding from your portfolio. You can add it again
              later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
