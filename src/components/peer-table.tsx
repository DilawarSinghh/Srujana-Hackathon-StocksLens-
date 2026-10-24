import Link from "next/link";
import type { PeerRow } from "@/lib/data/stock-detail";
import { formatMultiple, formatPercentFromFraction } from "@/lib/format";
import { ScoreBadge } from "@/components/score-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PeerTableProps {
  peers: PeerRow[];
}

/** Same-sector peers with score, P/E, ROE, D/E; links to their pages. */
export function PeerTable({ peers }: PeerTableProps) {
  if (peers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No same-sector peers available.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Score</TableHead>
            <TableHead className="text-right">P/E</TableHead>
            <TableHead className="text-right">ROE</TableHead>
            <TableHead className="text-right">D/E</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {peers.map((p) => (
            <TableRow key={p.symbol}>
              <TableCell>
                <Link
                  href={`/stocks/${encodeURIComponent(p.symbol)}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {p.symbol}
                </Link>
                <span className="block max-w-[14rem] truncate text-xs text-muted-foreground">
                  {p.name}
                </span>
              </TableCell>
              <TableCell>
                <ScoreBadge score={p.total_score} label={p.label} size="sm" />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatMultiple(p.pe)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPercentFromFraction(p.roe)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMultiple(p.debt_to_equity)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
