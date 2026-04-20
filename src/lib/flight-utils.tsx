import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

export type Flight = Database["public"]["Tables"]["flights"]["Row"];
export type FlightStatus = Database["public"]["Enums"]["flight_status"];
export const USD_TO_INR_RATE = 83.5;

export const STATUS_META: Record<
  FlightStatus,
  { label: string; className: string; live?: boolean }
> = {
  scheduled: { label: "On time", className: "bg-success/15 text-success border-success/30" },
  boarding: { label: "Boarding", className: "bg-warning/15 text-warning-foreground border-warning/40", live: true },
  departed: { label: "Departed", className: "bg-accent/15 text-accent border-accent/30", live: true },
  in_air: { label: "In air", className: "bg-accent/20 text-accent border-accent/40", live: true },
  landed: { label: "Landed", className: "bg-muted text-muted-foreground border-border" },
  delayed: { label: "Delayed", className: "bg-destructive/15 text-destructive border-destructive/30", live: true },
  cancelled: { label: "Cancelled", className: "bg-destructive/20 text-destructive border-destructive/40" },
};

export function StatusBadge({ status }: { status: FlightStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${meta.className}`}
    >
      {meta.live && <span className="h-1.5 w-1.5 rounded-full bg-current live-dot" />}
      {meta.label}
    </span>
  );
}

export function formatDuration(departure: string, arrival: string) {
  const ms = new Date(arrival).getTime() - new Date(departure).getTime();
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

export function formatTime(iso: string) {
  return format(new Date(iso), "HH:mm");
}

export function formatDate(iso: string) {
  return format(new Date(iso), "EEE, MMM d");
}

export function convertUsdToInr(amount: number) {
  return amount * USD_TO_INR_RATE;
}

export function formatCurrencyInr(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(convertUsdToInr(amount));
}
