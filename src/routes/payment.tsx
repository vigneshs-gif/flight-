import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { notifyBookingStatusEmail } from "@/lib/booking-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyInr, formatDate, formatTime, type Flight } from "@/lib/flight-utils";
import type { Database } from "@/integrations/supabase/types";

const paymentSearchSchema = z.object({
  flightId: z.string(),
  seat: z.string().optional(),
  seats: z.string().optional(),
  passengers: z.number().optional(),
  passengerName: z.string(),
  passengerEmail: z.string().email(),
  passengerPhone: z.string().optional().default(""),
});

export const Route = createFileRoute("/payment")({
  validateSearch: paymentSearchSchema,
  head: () => ({
    meta: [
      { title: "Secure Payment — SkyDeep Airlines" },
      { name: "description", content: "Choose your payment method and confirm your booking." },
    ],
  }),
  component: PaymentPage,
});

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  upi: "UPI",
  net_banking: "Net banking",
  wallet: "Wallet",
};

const WALLET_OPTIONS = ["Paytm", "PhonePe", "Amazon Pay", "Mobikwik"] as const;
const BANK_OPTIONS = ["HDFC Bank", "ICICI Bank", "SBI", "Axis Bank", "Kotak"] as const;

function normalizeUpiId(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

function formatCardNumber(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatCardExpiry(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length === 0) return "";
  if (digits.length === 1) return digits;

  const rawMonth = Number(digits.slice(0, 2));
  const normalizedMonth = String(Math.min(Math.max(rawMonth || 1, 1), 12)).padStart(2, "0");

  if (digits.length <= 2) return normalizedMonth;
  return `${normalizedMonth}/${digits.slice(2)}`;
}

function getCardDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.slice(0, 19);
}

function isSimpleCardNumber(value: string) {
  const digits = getCardDigits(value);
  return digits.length >= 12 && digits.length <= 19;
}

function isSimpleCardHolderName(value: string) {
  return value.trim().length >= 2;
}

function isSimpleCardExpiry(value: string) {
  return /^(0[1-9]|1[0-2])\/\d{2}$/.test(value);
}

function getCardValidationError({
  cardNumber,
  cardHolder,
  cardExpiry,
  cardCvv,
}: {
  cardNumber: string;
  cardHolder: string;
  cardExpiry: string;
  cardCvv: string;
}) {
  const digits = cardNumber.replace(/\D/g, "");
  const cvv = cardCvv.replace(/\D/g, "");

  if (!isSimpleCardNumber(cardNumber)) {
    return digits.length < 12 || digits.length > 19
      ? "Card number must be 12 to 19 digits"
      : "Enter card number";
  }
  if (!isSimpleCardHolderName(cardHolder)) {
    return "Enter card holder name";
  }
  if (!isSimpleCardExpiry(cardExpiry)) {
    return "Enter expiry as MM/YY";
  }
  if (cvv.length < 3 || cvv.length > 4) {
    return "CVV must be 3 or 4 digits";
  }

  return null;
}

function isValidUpiId(value: string) {
  const upiId = normalizeUpiId(value);
  const [handle, provider] = upiId.split("@");
  return Boolean(handle && provider);
}

function PaymentPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("upi");
  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [selectedBank, setSelectedBank] = useState<string>(BANK_OPTIONS[0]);
  const [selectedWallet, setSelectedWallet] = useState<string>(WALLET_OPTIONS[0]);
  const [walletMobile, setWalletMobile] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(9 * 60 + 32);

  const { data: flight, isLoading } = useQuery({
    queryKey: ["payment-flight", search.flightId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flights")
        .select("*")
        .eq("id", search.flightId)
        .maybeSingle();
      if (error) throw error;
      return data as Flight | null;
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
      </div>
    );
  }

  if (!flight) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Payment session not found</h1>
        <Button asChild variant="link" className="mt-4">
          <Link to="/">Search flights</Link>
        </Button>
      </div>
    );
  }

  const selectedSeats = getSelectedSeatsFromSearch(search);
  const passengerCount = Math.max(1, search.passengers ?? selectedSeats.length ?? 1);
  if (selectedSeats.length === 0) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold">Seat selection missing</h1>
        <Button asChild variant="link" className="mt-4">
          <Link to="/flights/$flightId" params={{ flightId: flight.id }} search={{ passengers: passengerCount }}>
            Go back to seat selection
          </Link>
        </Button>
      </div>
    );
  }

  const seatBreakdown = selectedSeats.map((seat) => {
    const row = parseInt(seat, 10);
    const seatClass = row <= 3 ? "first" : row <= 7 ? "business" : "economy";
    const seatPriceMultiplier = row <= 3 ? 2.5 : row <= 7 ? 1.6 : 1;

    return {
      seat,
      seatClass,
      totalPrice: Number(flight.base_price) * seatPriceMultiplier,
    };
  });
  const totalPriceUsd = seatBreakdown.reduce((sum, item) => sum + item.totalPrice, 0);
  const paymentReference = getPaymentReference({
    paymentMethod,
    upiId,
    cardNumber,
    selectedBank,
    selectedWallet,
    walletMobile,
  });
  const cardValidationError = getCardValidationError({
    cardNumber,
    cardHolder,
    cardExpiry,
    cardCvv,
  });
  const transactionId = `SKY${flight.flight_number.replace(/\W/g, "")}${selectedSeats[0] ?? "XX"}${selectedSeats.length}${search.passengerName
    .slice(0, 2)
    .toUpperCase()}`;

  const completePayment = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { mode: "signin", redirect: window.location.pathname } });
      return;
    }
    if (secondsLeft === 0) {
      toast.error("This payment session has expired. Please start again.");
      return;
    }
    if (!isPaymentDetailsValid({
      paymentMethod,
      upiId,
      cardNumber,
      cardHolder,
      cardExpiry,
      cardCvv,
      walletMobile,
    })) {
      toast.error(getPaymentValidationMessage(paymentMethod, cardValidationError));
      return;
    }

    setSubmitting(true);
    const { data, error } = await insertBookingWithFallback({
      userId: user.id,
      flightId: flight.id,
      passengerName: search.passengerName,
      passengerEmail: search.passengerEmail,
      passengerPhone: search.passengerPhone || null,
      seats: seatBreakdown,
      paymentMethod,
    });
    setSubmitting(false);

    if (error) {
      if (error.code === "23505") {
        toast.error("That seat was just booked. Please pick another.");
        queryClient.invalidateQueries({ queryKey: ["taken-seats", flight.id] });
        navigate({
          to: "/flights/$flightId",
          params: { flightId: flight.id },
          search: { passengers: passengerCount },
        });
      } else {
        toast.error(error.message);
      }
      return;
    }

    const emailResults = await Promise.allSettled(data.map((booking) => notifyBookingStatusEmail(booking.id)));
    const emailFailed = emailResults.some(
      (result) => result.status === "rejected" || (result.status === "fulfilled" && !result.value.ok),
    );
    toast.success(
      `${PAYMENT_METHOD_LABELS[paymentMethod]} payment submitted for ${selectedSeats.length} seat${selectedSeats.length > 1 ? "s" : ""}.`,
    );
    if (emailFailed) {
      toast.warning("Booking saved, but one or more confirmation emails could not be sent.");
    }
    navigate({ to: "/bookings" });
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_45%,#eef2ff_100%)]">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
          <Link
            to="/flights/$flightId"
            params={{ flightId: flight.id }}
            search={{ passengers: passengerCount }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to seat selection
          </Link>
        </Button>

        <div className="mx-auto max-w-3xl">
          <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_80px_rgba(15,23,42,0.08)] backdrop-blur md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Secure Checkout
                </div>
                <h1 className="font-display text-3xl font-bold">Complete your payment</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Pick the payment method that works best for you and confirm this booking.
                </p>
              </div>
              <div className="rounded-2xl bg-slate-950 p-3 text-white shadow-lg">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display text-lg font-semibold">{flight.flight_number}</div>
                    <div className="text-sm text-muted-foreground">
                      {flight.origin_code} to {flight.destination_code}
                    </div>
                  </div>
                  <div className="text-right text-sm text-muted-foreground">
                    <div>{formatDate(flight.departure_time)}</div>
                    <div>{formatTime(flight.departure_time)}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  <Info label="Passenger" value={search.passengerName} />
                  <Info label="Email" value={search.passengerEmail} />
                  <Info
                    label="Seat"
                    value={seatBreakdown.map(({ seat, seatClass }) => `${seat} · ${seatClass}`).join(", ")}
                  />
                  <Info label="Amount" value={formatCurrencyInr(totalPriceUsd)} />
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white">
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock3 className="h-4 w-4" />
                  <span className="text-xs uppercase tracking-[0.18em]">Session expires in</span>
                </div>
                <div className="mt-2 font-display text-3xl font-bold">
                  {formatCountdown(secondsLeft)}
                </div>
                <div className="mt-4 space-y-3 text-sm">
                  <InfoDark label="Merchant" value="SkyDeep Airlines" />
                  <InfoDark label="Transaction ID" value={transactionId} />
                  <InfoDark label="Amount payable" value={formatCurrencyInr(totalPriceUsd)} />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg font-semibold">Payment method</div>
                  <div className="text-sm text-muted-foreground">
                    Choose an option below and enter the required details to continue.
                  </div>
                </div>
                <div className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">
                  Protected by SkyPay
                </div>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/30 p-4 space-y-2">
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value) => setPaymentMethod(value as PaymentMethod)}
                  className="grid gap-3 md:grid-cols-2"
                >
                  {(
                    Object.entries(PAYMENT_METHOD_LABELS) as Array<[PaymentMethod, string]>
                  ).map(([method, label]) => (
                    <label
                      key={method}
                      htmlFor={`payment-${method}`}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <RadioGroupItem value={method} id={`payment-${method}`} />
                      <div>
                        <div className="font-medium text-slate-900">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {getPaymentMethodHint(method)}
                        </div>
                      </div>
                    </label>
                  ))}
                </RadioGroup>

                {paymentMethod === "upi" ? (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="upi-id">UPI ID</Label>
                      <Input
                        id="upi-id"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="name@bank"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Examples: `9876543210@ybl`, `name.singh@oksbi`, `name+travel@okicici`
                    </p>
                  </>
                ) : null}

                {paymentMethod === "card" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="card-number">Card number</Label>
                      <Input
                        id="card-number"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                        inputMode="numeric"
                        maxLength={23}
                        placeholder="1234 5678 9012 3456"
                      />
                      <p className="text-xs text-muted-foreground">
                        Enter 12 to 19 digits. Spaces are added automatically.
                      </p>
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label htmlFor="card-holder">Card holder</Label>
                      <Input
                        id="card-holder"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        placeholder="Name on card"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-expiry">Expiry</Label>
                      <Input
                        id="card-expiry"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatCardExpiry(e.target.value))}
                        inputMode="numeric"
                        maxLength={5}
                        placeholder="MM/YY"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="card-cvv">CVV</Label>
                      <Input
                        id="card-cvv"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="123"
                      />
                    </div>
                  </div>
                ) : null}

                {paymentMethod === "net_banking" ? (
                  <div className="space-y-1.5">
                    <Label>Bank</Label>
                    <Select value={selectedBank} onValueChange={setSelectedBank}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank" />
                      </SelectTrigger>
                      <SelectContent>
                        {BANK_OPTIONS.map((bank) => (
                          <SelectItem key={bank} value={bank}>
                            {bank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {paymentMethod === "wallet" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Wallet</Label>
                      <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select wallet" />
                        </SelectTrigger>
                        <SelectContent>
                          {WALLET_OPTIONS.map((wallet) => (
                            <SelectItem key={wallet} value={wallet}>
                              {wallet}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="wallet-mobile">Mobile number</Label>
                      <Input
                        id="wallet-mobile"
                        value={walletMobile}
                        onChange={(e) => setWalletMobile(e.target.value)}
                        inputMode="numeric"
                        placeholder="10-digit mobile number"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="grid gap-3">
                <Info label="Method" value={PAYMENT_METHOD_LABELS[paymentMethod]} />
                <Info label="Reference" value={paymentReference} />
                <Info label="Transaction ID" value={transactionId} />
                <Info label="Amount due" value={formatCurrencyInr(totalPriceUsd)} />
              </div>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Payment progress
              </div>
              <div className="mt-3 space-y-3">
                <StepRow
                  active
                  label="Seat reserved"
                  detail={`${selectedSeats.join(", ")} ${selectedSeats.length > 1 ? "are" : "is"} held for this session`}
                />
                <StepRow
                  active
                  label={`${PAYMENT_METHOD_LABELS[paymentMethod]} ready`}
                  detail={getPaymentProgressDetail(paymentMethod)}
                />
                <StepRow label="Booking sent for approval" detail="Created after payment confirmation" />
              </div>
              </div>

              <Button
                onClick={completePayment}
                disabled={submitting || secondsLeft === 0}
                size="lg"
                className="mt-5 w-full rounded-2xl shadow-sky"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : secondsLeft === 0 ? (
                  "Session expired"
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Confirm {PAYMENT_METHOD_LABELS[paymentMethod]} payment {formatCurrencyInr(totalPriceUsd)}
                  </>
                )}
              </Button>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                This is a simplified demo checkout. It does not charge real money yet.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}

function InfoDark({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 font-medium text-white">{value}</div>
    </div>
  );
}

function StepRow({
  label,
  detail,
  active = false,
}: {
  label: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
          active ? "bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" : "bg-slate-300"
        }`}
      />
      <div>
        <div className={`text-sm font-medium ${active ? "text-slate-900" : "text-slate-500"}`}>
          {label}
        </div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
    </div>
  );
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPaymentMethodHint(method: PaymentMethod) {
  switch (method) {
    case "upi":
      return "Pay using any UPI app or handle";
    case "card":
      return "Visa, Mastercard, RuPay, and more";
    case "net_banking":
      return "Choose your bank and continue";
    case "wallet":
      return "Use your preferred mobile wallet";
  }
}

function getPaymentProgressDetail(method: PaymentMethod) {
  switch (method) {
    case "upi":
      return "Waiting for your UPI confirmation";
    case "card":
      return "Waiting for your card authorization";
    case "net_banking":
      return "Waiting for your bank confirmation";
    case "wallet":
      return "Waiting for your wallet approval";
  }
}

function isPaymentDetailsValid({
  paymentMethod,
  upiId,
  cardNumber,
  cardHolder,
  cardExpiry,
  cardCvv,
  walletMobile,
}: {
  paymentMethod: PaymentMethod;
  upiId: string;
  cardNumber: string;
  cardHolder: string;
  cardExpiry: string;
  cardCvv: string;
  walletMobile: string;
}) {
  if (paymentMethod === "upi") return isValidUpiId(upiId);
  if (paymentMethod === "card") {
    const cvv = cardCvv.replace(/\D/g, "");
    return (
      isSimpleCardNumber(cardNumber) &&
      isSimpleCardHolderName(cardHolder) &&
      isSimpleCardExpiry(cardExpiry) &&
      cvv.length >= 3 &&
      cvv.length <= 4
    );
  }
  if (paymentMethod === "wallet") {
    return /^\d{10}$/.test(walletMobile.replace(/\D/g, ""));
  }
  return true;
}

function getPaymentValidationMessage(method: PaymentMethod, cardValidationError?: string | null) {
  switch (method) {
    case "upi":
      return "Enter a valid UPI ID";
    case "card":
      return cardValidationError ?? "Enter valid card details";
    case "net_banking":
      return "Choose a bank to continue";
    case "wallet":
      return "Enter a valid wallet mobile number";
  }
}

function getPaymentReference({
  paymentMethod,
  upiId,
  cardNumber,
  selectedBank,
  selectedWallet,
  walletMobile,
}: {
  paymentMethod: PaymentMethod;
  upiId: string;
  cardNumber: string;
  selectedBank: string;
  selectedWallet: string;
  walletMobile: string;
}) {
  if (paymentMethod === "upi") return normalizeUpiId(upiId) || "UPI payment";
  if (paymentMethod === "card") {
    const digits = cardNumber.replace(/\D/g, "");
    return digits ? `Card ending ${digits.slice(-4)}` : "Card payment";
  }
  if (paymentMethod === "net_banking") return selectedBank || "Net banking";
  const digits = walletMobile.replace(/\D/g, "");
  return digits ? `${selectedWallet} · ${digits}` : selectedWallet || "Wallet payment";
}

async function insertBookingWithFallback({
  userId,
  flightId,
  passengerName,
  passengerEmail,
  passengerPhone,
  seats,
  paymentMethod,
}: {
  userId: string;
  flightId: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string | null;
  seats: Array<{
    seat: string;
    seatClass: Database["public"]["Enums"]["seat_class"];
    totalPrice: number;
  }>;
  paymentMethod: PaymentMethod;
}) {
  const basePayload = seats.map(({ seat, seatClass, totalPrice }) => ({
    user_id: userId,
    flight_id: flightId,
    passenger_name: passengerName,
    passenger_email: passengerEmail,
    passenger_phone: passengerPhone,
    seat_number: seat,
    seat_class: seatClass,
    total_price: totalPrice,
    status: "pending" as const,
  }));

  const initialResult = await supabase
    .from("bookings")
    .insert(basePayload.map((booking) => ({ ...booking, payment_method: paymentMethod })))
    .select()
    .order("created_at", { ascending: true });

  if (!initialResult.error || !isMissingPaymentMethodColumnError(initialResult.error.message)) {
    return initialResult;
  }

  return supabase.from("bookings").insert(basePayload).select().order("created_at", { ascending: true });
}

function isMissingPaymentMethodColumnError(message: string) {
  const lowerMessage = message.toLowerCase();
  return lowerMessage.includes("payment_method") && lowerMessage.includes("schema cache");
}

function getSelectedSeatsFromSearch(search: z.infer<typeof paymentSearchSchema>) {
  const seatValues = (search.seats ?? search.seat ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(seatValues));
}
