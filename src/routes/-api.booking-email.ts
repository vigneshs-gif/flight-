import { createAPIFileRoute } from "@tanstack/react-start/api";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { formatCurrencyInr } from "@/lib/flight-utils";

type BookingStatus = "pending" | "confirmed" | "cancelled" | "cancellation_requested";

type BookingEmailRow = {
  id: string;
  user_id: string;
  status: BookingStatus;
  booking_reference: string;
  passenger_name: string;
  passenger_email: string;
  seat_number: string;
  total_price: number;
  created_at: string;
  flights: {
    flight_number: string;
    origin_code: string;
    destination_code: string;
    departure_time: string;
    arrival_time: string;
  } | null;
};

const SUPPORTED_STATUSES: BookingStatus[] = ["pending", "confirmed", "cancelled", "cancellation_requested"];

export const APIRoute = createAPIFileRoute("/api/booking-email")({
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

      const body = (await request.json()) as { bookingId?: string };
      if (!body.bookingId) {
        return Response.json({ ok: false, message: "Booking ID is required." }, { status: 400 });
      }

      const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select(
          "id, user_id, status, booking_reference, passenger_name, passenger_email, seat_number, total_price, created_at, flights(flight_number, origin_code, destination_code, departure_time, arrival_time)",
        )
        .eq("id", body.bookingId)
        .maybeSingle();

      if (bookingError || !booking) {
        return Response.json({ ok: false, message: "Booking not found." }, { status: 404 });
      }

      const { count: adminCount, error: roleError } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("role", "admin");

      if (roleError) {
        return Response.json({ ok: false, message: roleError.message }, { status: 500 });
      }

      const isAdmin = (adminCount ?? 0) > 0;
      if (booking.user_id !== user.id && !isAdmin) {
        return Response.json({ ok: false, message: "Forbidden." }, { status: 403 });
      }

      if (!SUPPORTED_STATUSES.includes(booking.status as BookingStatus)) {
        return Response.json(
          { ok: false, message: "No email template for this booking status yet." },
          { status: 400 },
        );
      }

      const emailResult = await sendBookingStatusEmail(booking as BookingEmailRow);
      return Response.json(emailResult, { status: emailResult.ok ? 200 : 502 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send booking email.";
      return Response.json({ ok: false, message }, { status: 500 });
    }
  },
});

async function sendBookingStatusEmail(booking: BookingEmailRow) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_EMAIL_FROM ?? "SkyDeep Airlines <onboarding@resend.dev>";
  const replyTo = process.env.BOOKING_EMAIL_REPLY_TO;

  if (!apiKey) {
    return {
      ok: false,
      message: "Missing RESEND_API_KEY. Set email environment variables to enable notifications.",
    };
  }

  const email = buildBookingStatusEmail(booking);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [booking.passenger_email],
      reply_to: replyTo ? [replyTo] : undefined,
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      ok: false,
      message: `Email provider error: ${errorText || response.statusText}`,
    };
  }

  return {
    ok: true,
    message: `Email sent for booking ${booking.booking_reference}.`,
  };
}

function buildBookingStatusEmail(booking: BookingEmailRow) {
  const flightLabel = booking.flights
    ? `${booking.flights.flight_number} · ${booking.flights.origin_code} to ${booking.flights.destination_code}`
    : "your flight";
  const departure = booking.flights
    ? new Date(booking.flights.departure_time).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  const statusContent =
    booking.status === "pending"
      ? {
          subject: `Booking pending: ${booking.booking_reference}`,
          heading: "Your booking is pending approval",
          intro:
            "We received your booking request and it is now waiting for admin approval.",
          statusLabel: "Pending",
        }
      : booking.status === "confirmed"
        ? {
            subject: `Booking confirmed: ${booking.booking_reference}`,
            heading: "Your ticket is confirmed",
            intro: "Good news. Your booking has been approved and your ticket is now confirmed.",
            statusLabel: "Confirmed",
          }
        : booking.status === "cancellation_requested"
          ? {
              subject: `Cancellation requested: ${booking.booking_reference}`,
              heading: "Your cancellation request is pending review",
              intro:
                "We received your cancellation request. An admin will review it before the booking is cancelled.",
              statusLabel: "Cancellation requested",
            }
        : {
            subject: `Booking cancelled: ${booking.booking_reference}`,
            heading: "Your booking has been cancelled",
            intro:
              "Your booking cancellation has been approved. This ticket is now cancelled.",
            statusLabel: "Cancelled",
          };

  const details = [
    `Booking reference: ${booking.booking_reference}`,
    `Passenger: ${booking.passenger_name}`,
    `Status: ${statusContent.statusLabel}`,
    `Flight: ${flightLabel}`,
    departure ? `Departure: ${departure}` : null,
    `Seat: ${booking.seat_number}`,
    `Total: ${formatCurrencyInr(Number(booking.total_price))}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    subject: statusContent.subject,
    text: `${statusContent.heading}\n\n${statusContent.intro}\n\n${details}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; color: #0f172a;">
        <h1 style="margin-bottom: 12px;">${escapeHtml(statusContent.heading)}</h1>
        <p style="margin-bottom: 20px; line-height: 1.6;">${escapeHtml(statusContent.intro)}</p>
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; background: #f8fafc;">
          <p style="margin: 0 0 8px;"><strong>Booking reference:</strong> ${escapeHtml(booking.booking_reference)}</p>
          <p style="margin: 0 0 8px;"><strong>Passenger:</strong> ${escapeHtml(booking.passenger_name)}</p>
          <p style="margin: 0 0 8px;"><strong>Status:</strong> ${escapeHtml(statusContent.statusLabel)}</p>
          <p style="margin: 0 0 8px;"><strong>Flight:</strong> ${escapeHtml(flightLabel)}</p>
          ${
            departure
              ? `<p style="margin: 0 0 8px;"><strong>Departure:</strong> ${escapeHtml(departure)}</p>`
              : ""
          }
          <p style="margin: 0 0 8px;"><strong>Seat:</strong> ${escapeHtml(booking.seat_number)}</p>
          <p style="margin: 0;"><strong>Total:</strong> ${escapeHtml(formatCurrencyInr(Number(booking.total_price)))}</p>
        </div>
      </div>
    `,
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
