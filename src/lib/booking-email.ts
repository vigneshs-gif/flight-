import { supabase } from "@/integrations/supabase/client";

type NotifyBookingStatusEmailResult = {
  ok: boolean;
  message?: string;
};

export async function notifyBookingStatusEmail(
  bookingId: string,
): Promise<NotifyBookingStatusEmailResult> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const response = await fetch("/api/booking-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify({ bookingId }),
  });

  const result = (await response.json().catch(() => null)) as
    | { ok?: boolean; message?: string }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      message: result?.message ?? "Unable to send booking email.",
    };
  }

  return {
    ok: result?.ok === true,
    message: result?.message,
  };
}
