import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Plane, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StatusBadge,
  formatCurrencyInr,
  formatDate,
  formatDuration,
  formatTime,
  type Flight,
} from "@/lib/flight-utils";

const searchSchema = z.object({
  passengers: z.number().default(1),
});

export const Route = createFileRoute("/flights/$flightId")({
  validateSearch: searchSchema,
  head: ({ params }) => ({
    meta: [
      { title: `Flight ${params.flightId.slice(0, 8)} — SkyDeep` },
      { name: "description", content: "Select your seat and complete your booking." },
    ],
  }),
  component: FlightDetailPage,
});

const SEAT_LETTERS = ["A", "B", "C", "D", "E", "F"];

function FlightDetailPage() {
  const { flightId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passengerName, setPassengerName] = useState("");
  const [passengerEmail, setPassengerEmail] = useState(user?.email ?? "");
  const [passengerPhone, setPassengerPhone] = useState("");

  const { data: flight, isLoading } = useQuery({
    queryKey: ["flight", flightId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .eq("id", flightId)
        .maybeSingle();
      if (error) throw error;
      return data as Flight | null;
    },
  });

  const { data: takenSeats = [] } = useQuery({
    queryKey: ["taken-seats", flightId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_taken_seats", {
        _flight_id: flightId,
      });
      if (error) throw error;
      return (data ?? []).map((r: { seat_number: string }) => r.seat_number);
    },
    refetchOnWindowFocus: true,
  });

  // Realtime subscription: when bookings change, refetch taken seats + flight
  useEffect(() => {
    const channel = supabase
      .channel(`flight-${flightId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `flight_id=eq.${flightId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["taken-seats", flightId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "flights", filter: `id=eq.${flightId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["flight", flightId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [flightId, queryClient]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="mx-auto max-w-3xl px-4 md:px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-bold">Flight not found</h1>
        <Button asChild variant="link" className="mt-4">
          <Link to="/">Search flights</Link>
        </Button>
      </div>
    );
  }

  const seatPriceMultiplier = (row: number) => {
    if (row <= 3) return 2.5; // first
    if (row <= 7) return 1.6; // business
    return 1; // economy
  };

  const seatClass = (row: number): "first" | "business" | "economy" => {
    if (row <= 3) return "first";
    if (row <= 7) return "business";
    return "economy";
  };

  const totalPrice = selectedSeat
    ? Number(flight.base_price) * seatPriceMultiplier(parseInt(selectedSeat, 10))
    : 0;

  const continueToPayment = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { mode: "signin", redirect: window.location.pathname } });
      return;
    }
    if (!selectedSeat) {
      toast.error("Please select a seat");
      return;
    }
    if (!passengerName.trim() || !passengerEmail.trim()) {
      toast.error("Passenger name and email required");
      return;
    }
    setSubmitting(true);
    setSubmitting(false);
    navigate({
      to: "/payment",
      search: {
        flightId: flight.id,
        seat: selectedSeat,
        passengerName: passengerName.trim(),
        passengerEmail: passengerEmail.trim(),
        passengerPhone: passengerPhone.trim(),
      },
    });
  };

  return (
    <div className="bg-muted/30 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link to="/">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to search
          </Link>
        </Button>

        {/* Flight summary */}
        <div className="bg-card rounded-2xl border border-border/60 p-5 md:p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-accent/15 flex items-center justify-center">
                <Plane className="h-5 w-5 text-accent -rotate-45" />
              </div>
              <div>
                <div className="font-display font-semibold">{flight.flight_number}</div>
                <div className="text-xs text-muted-foreground">{flight.aircraft}</div>
              </div>
            </div>
            <div className="flex-1 flex items-center gap-4">
              <div>
                <div className="font-display text-xl font-bold">
                  {formatTime(flight.departure_time)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {flight.origin_code} · {flight.origin_city}
                </div>
              </div>
              <div className="flex-1 text-center text-xs text-muted-foreground">
                {formatDuration(flight.departure_time, flight.arrival_time)}
              </div>
              <div>
                <div className="font-display text-xl font-bold">
                  {formatTime(flight.arrival_time)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {flight.destination_code} · {flight.destination_city}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={flight.status} />
              <div className="text-xs text-muted-foreground">
                {formatDate(flight.departure_time)}
              </div>
              {flight.gate && (
                <div className="text-xs text-muted-foreground">
                  Gate {flight.gate} · Terminal {flight.terminal}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] gap-6">
          {/* Seat map */}
          <div className="bg-card rounded-2xl border border-border/60 p-5 md:p-8">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-display text-lg font-semibold">Choose your seat</h2>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent live-dot" />
                Live availability
              </div>
            </div>
            <p className="text-xs text-muted-foreground mb-5">
              {takenSeats.length} of {flight.total_rows * flight.seats_per_row} seats booked
            </p>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 mb-6 text-xs">
              <LegendDot className="bg-card border border-border" label="Available" />
              <LegendDot className="bg-accent text-accent-foreground" label="Selected" />
              <LegendDot className="bg-muted border border-border opacity-50" label="Taken" />
              <LegendDot className="bg-secondary/40 border border-secondary" label="Premium" />
            </div>

            {/* Plane outline */}
            <div className="mx-auto max-w-md">
              <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                ✈ Front
              </div>
              <div className="space-y-1.5">
                {Array.from({ length: flight.total_rows }).map((_, rowIdx) => {
                  const row = rowIdx + 1;
                  const cls = seatClass(row);
                  return (
                    <div key={row} className="flex items-center gap-1">
                      <span className="w-6 text-center text-[10px] text-muted-foreground font-mono">
                        {row}
                      </span>
                      <div className="flex-1 grid grid-cols-[1fr_1fr_1fr_12px_1fr_1fr_1fr] gap-1">
                        {SEAT_LETTERS.map((letter, i) => {
                          const seat = `${row}${letter}`;
                          const taken = takenSeats.includes(seat);
                          const isSelected = selectedSeat === seat;
                          return (
                            <>
                              {i === 3 && <div key={`aisle-${row}`} />}
                              <button
                                key={seat}
                                type="button"
                                disabled={taken}
                                onClick={() => setSelectedSeat(seat)}
                                className={`h-7 rounded-md text-[10px] font-display font-semibold transition-all
                                  ${
                                    taken
                                      ? "bg-muted text-muted-foreground/40 cursor-not-allowed"
                                      : isSelected
                                        ? "bg-accent text-accent-foreground scale-110 shadow-sky"
                                        : cls === "first"
                                          ? "bg-secondary/30 border border-secondary hover:bg-secondary/50"
                                          : cls === "business"
                                            ? "bg-sky-glow/20 border border-sky-glow/40 hover:bg-sky-glow/30"
                                            : "bg-card border border-border hover:border-accent hover:bg-accent/5"
                                  }`}
                                aria-label={`Seat ${seat}${taken ? " (taken)" : ""}`}
                              >
                                {letter}
                              </button>
                            </>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Booking summary */}
          <div className="bg-card rounded-2xl border border-border/60 p-5 md:p-6 h-fit lg:sticky lg:top-20">
            <h3 className="font-display text-lg font-semibold mb-4">Booking summary</h3>

            <div className="space-y-3 mb-5">
              <div className="space-y-1.5">
                <Label htmlFor="pname">Passenger name</Label>
                <Input
                  id="pname"
                  value={passengerName}
                  onChange={(e) => setPassengerName(e.target.value)}
                  placeholder="As on ID"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pemail">Email</Label>
                <Input
                  id="pemail"
                  type="email"
                  value={passengerEmail}
                  onChange={(e) => setPassengerEmail(e.target.value)}
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pphone">Phone (optional)</Label>
                <Input
                  id="pphone"
                  type="tel"
                  value={passengerPhone}
                  onChange={(e) => setPassengerPhone(e.target.value)}
                  maxLength={30}
                />
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Selected seat</span>
                <span className="font-display font-semibold text-foreground">
                  {selectedSeat ?? "—"}
                </span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Class</span>
                <span className="capitalize">
                  {selectedSeat ? seatClass(parseInt(selectedSeat, 10)) : "—"}
                </span>
              </div>
              <div className="flex justify-between font-display text-xl font-bold pt-2 border-t border-border">
                <span>Total</span>
                <span className="text-accent">{formatCurrencyInr(totalPrice)}</span>
              </div>
            </div>

            <Button
              onClick={continueToPayment}
              disabled={!selectedSeat || submitting}
              size="lg"
              className="w-full mt-5 shadow-sky"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : user ? (
                "Continue to payment"
              ) : (
                "Sign in to book"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded ${className}`} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
