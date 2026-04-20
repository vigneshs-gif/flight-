CREATE TYPE public.payment_method AS ENUM (
  'card',
  'upi',
  'net_banking',
  'wallet'
);

ALTER TABLE public.bookings
  ADD COLUMN payment_method public.payment_method NOT NULL DEFAULT 'card';
