import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Loader2, Users, Plane as PlaneIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { notifyBookingStatusEmail } from "@/lib/booking-email";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatusBadge,
  STATUS_META,
  formatCurrencyInr,
  formatDate,
  formatTime,
  type Flight,
  type FlightStatus,
} from "@/lib/flight-utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { Database } from "@/integrations/supabase/types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];
const PAYMENT_METHOD_LABELS: Record<Database["public"]["Enums"]["payment_method"], string> = {
  card: "Card",
  upi: "UPI",
  net_banking: "Net banking",
  wallet: "Wallet",
};

function getPaymentMethodLabel(method?: string | null) {
  if (!method) return "Card";
  return PAYMENT_METHOD_LABELS[method as Database["public"]["Enums"]["payment_method"]] ?? "Card";
}

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — SkyDeep Airlines" },
      { name: "description", content: "Manage flights and bookings." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <ShieldCheck className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h1 className="font-display text-2xl font-bold mb-2">Sign in required</h1>
        <Button asChild className="shadow-sky mt-2">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (!isAdmin) {
    return <PromoteToAdmin userId={user.id} userEmail={user.email ?? ""} />;
  }

  return <AdminDashboard />;
}

// Helper to grant first user admin access (no admin exists yet flow)
function PromoteToAdmin({ userId, userEmail }: { userId: string; userEmail: string }) {
  const [busy, setBusy] = useState(false);

  const promote = async () => {
    setBusy(true);
    // Check if any admin exists
    const { count } = await supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");

    if ((count ?? 0) > 0) {
      setBusy(false);
      toast.error("Admin already exists. Ask an existing admin to grant you access.");
      return;
    }

    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("You are now an admin. Reloading...");
      setTimeout(() => window.location.reload(), 800);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <ShieldCheck className="h-12 w-12 mx-auto text-accent mb-4" />
      <h1 className="font-display text-2xl font-bold mb-2">Become the first admin</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Signed in as <span className="font-medium">{userEmail}</span>. The first user to claim admin
        access gets the role automatically. Subsequent admins must be added by an existing admin.
      </p>
      <Button onClick={promote} disabled={busy} className="shadow-sky">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Claim admin role"}
      </Button>
    </div>
  );
}

function AdminDashboard() {
  return (
    <div className="bg-muted/30 min-h-[calc(100vh-4rem)]">
      <div className="mx-auto max-w-7xl px-4 md:px-6 py-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Admin panel</h1>
            <p className="text-sm text-muted-foreground">
              Update flight status — changes go live to passengers instantly.
            </p>
          </div>
        </div>

        <Tabs defaultValue="flights">
          <TabsList>
            <TabsTrigger value="flights">
              <PlaneIcon className="h-3.5 w-3.5 mr-1.5" /> Flights
            </TabsTrigger>
            <TabsTrigger value="bookings">
              <Users className="h-3.5 w-3.5 mr-1.5" /> Bookings
            </TabsTrigger>
          </TabsList>
          <TabsContent value="flights" className="mt-5">
            <FlightsAdmin />
          </TabsContent>
          <TabsContent value="bookings" className="mt-5">
            <BookingsAdmin />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function FlightsAdmin() {
  const queryClient = useQueryClient();

  const { data: flights, isLoading } = useQuery({
    queryKey: ["admin-flights"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .order("departure_time", { ascending: true });
      if (error) throw error;
      return data as Flight[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-flights-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "flights" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-flights"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateStatus = async (id: string, status: FlightStatus) => {
    const { error } = await supabase.from("flights").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`Status set to ${STATUS_META[status].label} — broadcast live.`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Flight</th>
              <th className="text-left px-4 py-3">Route</th>
              <th className="text-left px-4 py-3">Departure</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Update</th>
            </tr>
          </thead>
          <tbody>
            {flights?.map((f) => (
              <tr key={f.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="px-4 py-3 font-display font-semibold">{f.flight_number}</td>
                <td className="px-4 py-3">
                  {f.origin_code} → {f.destination_code}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(f.departure_time)} · {formatTime(f.departure_time)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={f.status} />
                </td>
                <td className="px-4 py-3">
                  <Select
                    value={f.status}
                    onValueChange={(v) => updateStatus(f.id, v as FlightStatus)}
                  >
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_META) as FlightStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_META[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BookingsAdmin() {
  const queryClient = useQueryClient();
  const { data: bookings, isLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, flights(flight_number, origin_code, destination_code)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("admin-bookings-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () =>
        queryClient.invalidateQueries({ queryKey: ["admin-bookings"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const updateBookingStatus = async (id: string, status: BookingStatus) => {
    const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }

    const emailResult = await notifyBookingStatusEmail(id);
    queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
    const message =
      status === "confirmed"
        ? "Booking approved successfully."
        : status === "cancelled"
          ? "Booking cancelled successfully."
          : "Booking updated successfully.";
    toast.success(message);
    if (!emailResult.ok) {
      toast.warning(emailResult.message ?? "Status updated, but the email could not be sent.");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Ref</th>
              <th className="text-left px-4 py-3">Passenger</th>
              <th className="text-left px-4 py-3">Flight</th>
              <th className="text-left px-4 py-3">Seat</th>
              <th className="text-left px-4 py-3">Payment</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-left px-4 py-3">Total</th>
              <th className="text-left px-4 py-3">Booked</th>
              <th className="text-left px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                  No bookings yet.
                </td>
              </tr>
            )}
            {bookings?.map((b) => (
              <tr key={b.id} className="border-t border-border/60 hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-xs">{b.booking_reference}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{b.passenger_name}</div>
                  <div className="text-xs text-muted-foreground">{b.passenger_email}</div>
                </td>
                <td className="px-4 py-3">
                  {b.flights?.flight_number}{" "}
                  <span className="text-muted-foreground">
                    {b.flights?.origin_code} → {b.flights?.destination_code}
                  </span>
                </td>
                <td className="px-4 py-3 font-display font-semibold">{b.seat_number}</td>
                <td className="px-4 py-3">{getPaymentMethodLabel(b.payment_method)}</td>
                <td className="px-4 py-3">
                  <AdminBookingStatusBadge status={b.status as BookingStatus} />
                </td>
                <td className="px-4 py-3">{formatCurrencyInr(Number(b.total_price))}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(b.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateBookingStatus(b.id, "confirmed")}
                      disabled={b.status !== "pending"}
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateBookingStatus(b.id, "cancelled")}
                      disabled={b.status !== "cancellation_requested"}
                    >
                      Approve cancellation
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminBookingStatusBadge({ status }: { status: BookingStatus }) {
  const meta =
    status === "confirmed"
      ? "bg-success/15 text-success border-success/30"
      : status === "pending"
        ? "bg-warning/15 text-warning-foreground border-warning/40"
        : status === "cancellation_requested"
          ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
          : "bg-destructive/15 text-destructive border-destructive/30";

  const label = status === "cancellation_requested" ? "Cancellation requested" : status;

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${meta}`}>
      {label.replace("_", " ")}
    </span>
  );
}
