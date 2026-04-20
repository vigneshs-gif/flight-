import { createAPIFileRoute } from "@tanstack/react-start/api";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

type BookingRow = {
  id: string;
  user_id: string;
  status: BookingStatus;
};

export const APIRoute = createAPIFileRoute("/api/booking-status")({
  POST: async ({ request }) => {
    try {
      const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        return Response.json({ ok: false, message: "Unauthorized." }, { status: 401 });
      }

      const {
        data: { user },
        error: authError,
      } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        return Response.json({ ok: false, message: "Invalid session." }, { status: 401 });
      }

      const body = (await request.json()) as {
        bookingId?: string;
        status?: BookingStatus;
      };

      if (!body.bookingId || !body.status) {
        return Response.json(
          { ok: false, message: "Booking ID and status are required." },
          { status: 400 },
        );
      }

      if (!isSupportedStatus(body.status)) {
        return Response.json({ ok: false, message: "Unsupported booking status." }, { status: 400 });
      }

      const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status")
        .eq("id", body.bookingId)
        .maybeSingle();

      if (bookingError || !booking) {
        return Response.json({ ok: false, message: "Booking not found." }, { status: 404 });
      }

      const isAdmin = await userIsAdmin(user.id);
      const authResult = validateBookingStatusChange({
        userId: user.id,
        isAdmin,
        booking: booking as BookingRow,
        nextStatus: body.status,
      });

      if (!authResult.ok) {
        return Response.json({ ok: false, message: authResult.message }, { status: authResult.status });
      }

      const { data: updatedBooking, error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({ status: body.status })
        .eq("id", body.bookingId)
        .select("id, user_id, status")
        .maybeSingle();

      if (updateError || !updatedBooking) {
        return Response.json(
          { ok: false, message: updateError?.message ?? "Booking status was not updated." },
          { status: 400 },
        );
      }

      return Response.json({ ok: true, booking: updatedBooking }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update booking status.";
      return Response.json({ ok: false, message }, { status: 500 });
    }
  },
});

function isSupportedStatus(status: string): status is BookingStatus {
  return (
    status === "pending" ||
    status === "confirmed" ||
    status === "cancelled" ||
    status === "cancellation_requested"
  );
}

async function userIsAdmin(userId: string) {
  const { count, error } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("role", "admin");

  if (error) {
    throw new Error(error.message);
  }

  return (count ?? 0) > 0;
}

function validateBookingStatusChange({
  userId,
  isAdmin,
  booking,
  nextStatus,
}: {
  userId: string;
  isAdmin: boolean;
  booking: BookingRow;
  nextStatus: BookingStatus;
}) {
  const isOwner = booking.user_id === userId;

  if (nextStatus === "cancellation_requested") {
    if (!isOwner) {
      return { ok: false, message: "You can only cancel your own booking.", status: 403 };
    }
    if (booking.status !== "pending" && booking.status !== "confirmed") {
      return { ok: false, message: "This booking cannot request cancellation anymore.", status: 400 };
    }
    return { ok: true as const };
  }

  if (!isAdmin) {
    return { ok: false, message: "Admin access is required for this action.", status: 403 };
  }

  if (nextStatus === "confirmed" && booking.status !== "pending") {
    return { ok: false, message: "Only pending bookings can be approved.", status: 400 };
  }

  if (nextStatus === "cancelled" && booking.status !== "cancellation_requested") {
    return {
      ok: false,
      message: "Only cancellation requests can be approved for cancellation.",
      status: 400,
    };
  }

  return { ok: true as const };
}
