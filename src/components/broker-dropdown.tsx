"use client";

import { ExternalLink, ChevronDown } from "lucide-react";
import { BROKERS } from "@/config/brokers";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * "Open in your broker" dropdown. Links OUT to each broker's public website in
 * a new tab. FilingLens never handles money or places orders.
 */
export function BrokerDropdown() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          Open in your broker
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          You place orders on your broker. We never handle your money.
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BROKERS.map((b) => (
          <DropdownMenuItem key={b.name} asChild>
            <a
              href={b.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between"
            >
              {b.name}
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
