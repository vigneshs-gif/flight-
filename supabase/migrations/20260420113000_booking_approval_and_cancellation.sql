ALTER TYPE public.booking_status
  ADD VALUE IF NOT EXISTS 'cancellation_requested';

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_flight_id_seat_number_key;

DROP INDEX IF EXISTS idx_bookings_flight_seat_active;

CREATE UNIQUE INDEX idx_bookings_flight_seat_active
  ON public.bookings(flight_id, seat_number)
  WHERE status IN ('pending', 'confirmed', 'cancellation_requested');

CREATE OR REPLACE FUNCTION public.get_taken_seats(_flight_id UUID)
RETURNS TABLE (seat_number TEXT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.seat_number
  FROM public.bookings b
  WHERE b.flight_id = _flight_id
    AND b.status IN ('pending', 'confirmed', 'cancellation_requested');
$$;

GRANT EXECUTE ON FUNCTION public.get_taken_seats(UUID) TO anon, authenticated;
