import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { FlightSearchForm } from "@/components/flight-search-form";
import {
  StatusBadge,
  formatCurrencyInr,
  formatDate,
  formatDuration,
  formatTime,
  type Flight,
} from "@/lib/flight-utils";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  from: z.string().default("JFK"),
  to: z.string().default("LAX"),
  date: z.string().default(""),
  passengers: z.number().default(1),
});

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  head: ({ match }) => ({
    meta: [
      {
        title: `Flights ${match.search.from} → ${match.search.to} — SkyDeep`,
      },
      {
        name: "description",
        content: `Available flights from ${match.search.from} to ${match.search.to}.`,
      },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const search = Route.useSearch();

  const { data: flights, isLoading } = useQuery({
    queryKey: ["flights", search.from, search.to, search.date],
    queryFn: async () => {
      const startOfDay = new Date(search.date + "T00:00:00").toISOString();
      const endOfDay = new Date(search.date + "T23:59:59").toISOString();
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .eq("origin_code", search.from)
        .eq("destination_code", search.to)
        .gte("departure_time", startOfDay)
        .lte("departure_time", endOfDay)
        .order("departure_time", { ascending: true });
      if (error) throw error;
      return data as Flight[];
    },
  });

  // Fallback: if none on that date, show all matching route
  const { data: anyFlights } = useQuery({
    queryKey: ["flights-any", search.from, search.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .eq("origin_code", search.from)
        .eq("destination_code", search.to)
        .gte("departure_time", new Date().toISOString())
        .order("departure_time", { ascending: true })
        .limit(8);
      if (error) throw error;
      return data as Flight[];
    },
    enabled: !isLoading && (flights?.length ?? 0) === 0,
  });

  const list = flights && flights.length > 0 ? flights : anyFlights ?? [];

  return (
    <div className="bg-muted/30 min-h-[calc(100vh-4rem)]">
      {/* Sticky search bar */}
      <div className="bg-card border-b border-border/60 py-4 px-4 md:px-6 shadow-sm">
        <div className="mx-auto max-w-6xl">
          <FlightSearchForm />
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
        <div className="flex items-baseline justify-between mb-6">
          <h1 className="font-display text-2xl md:text-3xl font-bold">
            {search.from} <ArrowRight className="inline h-5 w-5 mx-1 text-muted-foreground" />{" "}
            {search.to}
          </h1>
          <p className="text-sm text-muted-foreground">
            {list.length} flight{list.length !== 1 ? "s" : ""} found
          </p>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && list.length === 0 && (
          <div className="bg-card rounded-2xl border border-border/60 p-12 text-center">
            <Plane className="h-10 w-10 mx-auto text-muted-foreground mb-3 -rotate-45" />
            <h3 className="font-display text-lg font-semibold mb-1">No flights found</h3>
            <p className="text-sm text-muted-foreground">
              Try a different route or date.
            </p>
          </div>
        )}

        {!isLoading && flights?.length === 0 && anyFlights && anyFlights.length > 0 && (
          <p className="text-sm text-muted-foreground mb-4 italic">
            No flights on {search.date}. Showing upcoming flights on this route.
          </p>
        )}

        <div className="space-y-3">
          {list.map((flight, i) => (
            <FlightResultCard key={flight.id} flight={flight} index={i} passengers={search.passengers} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FlightResultCard({
  flight,
  index,
  passengers,
}: {
  flight: Flight;
  index: number;
  passengers: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="bg-card rounded-2xl border border-border/60 p-5 md:p-6 hover:shadow-sky transition-shadow"
    >
      <div className="flex flex-col md:flex-row md:items-center gap-5">
        {/* Times + route */}
        <div className="flex-1 flex items-center gap-4 md:gap-6">
          <div className="text-center">
            <div className="font-display text-2xl md:text-3xl font-bold">
              {formatTime(flight.departure_time)}
            </div>
            <div className="text-xs text-muted-foreground font-medium">{flight.origin_code}</div>
            <div className="text-xs text-muted-foreground">{flight.origin_city}</div>
          </div>

          <div className="flex-1 flex flex-col items-center gap-1 px-2">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
              {formatDuration(flight.departure_time, flight.arrival_time)}
            </span>
            <div className="relative w-full h-px bg-border">
              <Plane className="absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 text-accent rotate-90" />
            </div>
            <span className="text-[11px] text-muted-foreground">Direct</span>
          </div>

          <div className="text-center">
            <div className="font-display text-2xl md:text-3xl font-bold">
              {formatTime(flight.arrival_time)}
            </div>
            <div className="text-xs text-muted-foreground font-medium">
              {flight.destination_code}
            </div>
            <div className="text-xs text-muted-foreground">{flight.destination_city}</div>
          </div>
        </div>

        {/* Meta + price + cta */}
        <div className="flex items-center justify-between md:justify-end gap-4 md:gap-6 md:pl-6 md:border-l border-border/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-display text-sm font-semibold">{flight.flight_number}</span>
              <StatusBadge status={flight.status} />
            </div>
            <div className="text-xs text-muted-foreground">{flight.aircraft}</div>
            <div className="text-[11px] text-muted-foreground">{formatDate(flight.departure_time)}</div>
          </div>

          <div className="text-right">
            <div className="text-xs text-muted-foreground">from</div>
            <div className="font-display text-2xl font-bold text-accent">
              {formatCurrencyInr(Number(flight.base_price))}
            </div>
            <Button asChild size="sm" className="mt-1 shadow-sky">
              <Link to="/flights/$flightId" params={{ flightId: flight.id }} search={{ passengers }}>
                Select
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
