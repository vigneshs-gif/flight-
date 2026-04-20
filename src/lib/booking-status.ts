import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

type UpdateBookingStatusResult = {
  ok: boolean;
  message?: string;
};

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<UpdateBookingStatusResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/booking-status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ bookingId, status }),
  });

  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; message?: string }
    | null;

  if (!response.ok || result?.ok !== true) {
    return {
      ok: false,
      message: result?.message ?? "Unable to update booking status.",
    };
  }

  return {
    ok: true,
    message: result?.message,
  };
}
