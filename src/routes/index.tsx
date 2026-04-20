import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plane, Zap, ShieldCheck, Sparkles } from "lucide-react";
import { FlightSearchForm } from "@/components/flight-search-form";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SkyDeep Airlines — Realtime flight booking" },
      {
        name: "description",
        content:
          "Search and book flights with live seat availability. Realtime status updates from gate to landing.",
      },
      { property: "og:title", content: "SkyDeep Airlines — Realtime flight booking" },
      {
        property: "og:description",
        content: "Search and book flights with live seat availability.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [showLoader, setShowLoader] = useState(true);
  const { user, loading } = useAuth();

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoader(false), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div>
      {showLoader && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-sky-deep text-white"
        >
          <div className="loader-space">
            <div className="loader-earth-glow" />
            <div className="loader-orbit-ring" />
            <div className="loader-earth">
              <div className="loader-earth-continent loader-earth-continent-one" />
              <div className="loader-earth-continent loader-earth-continent-two" />
              <div className="loader-earth-continent loader-earth-continent-three" />
            </div>
            <div className="loader-plane-orbit">
              <div className="loader-plane-marker">
                <Plane className="h-5 w-5 -rotate-12" />
              </div>
            </div>
            <div className="loader-copy">
              <div className="loader-copy-title">Preparing your journey</div>
              <div className="loader-copy-text">Flight is orbiting the earth...</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero-gradient text-white">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-1/4 -left-20 h-72 w-72 rounded-full bg-sky-glow/40 blur-3xl animate-drift" />
          <div className="absolute bottom-1/4 -right-20 h-96 w-96 rounded-full bg-sky-teal/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 md:px-6 pt-16 md:pt-24 pb-32 md:pb-40">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs uppercase tracking-[0.2em] font-medium mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-glow live-dot" />
              Live availability
            </div>
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight">
              Book flights <span className="text-gradient-sky">in realtime.</span>
            </h1>
            <p className="mt-5 text-lg md:text-xl text-white/75 max-w-xl">
              Watch seats fill live. Track flight status from boarding to landing. No refresh
              required.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Search form floating over hero */}
      <div className="relative -mt-24 md:-mt-28 mx-auto max-w-6xl px-4 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <FlightSearchForm />
        </motion.div>
      </div>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 py-20 md:py-28">
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Zap,
              title: "Realtime seat map",
              text: "See seats lock the instant another passenger books. Pick yours with confidence.",
            },
            {
              icon: Plane,
              title: "Live flight status",
              text: "Boarding, departed, in air, landed — pushed live to your bookings page.",
            },
            {
              icon: ShieldCheck,
              title: "Secure & instant",
              text: "Encrypted authentication, instant confirmation, e-tickets ready in seconds.",
            },
          ].map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-card rounded-2xl border border-border/60 p-6 hover:shadow-sky transition-shadow"
            >
              <div className="h-11 w-11 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA strip */}
      <section className="mx-auto max-w-7xl px-4 md:px-6 pb-20">
        <div className="bg-card-gradient rounded-3xl p-10 md:p-14 text-white relative overflow-hidden">
          <Sparkles className="absolute top-6 right-6 h-6 w-6 text-sky-glow/60" />
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3 max-w-xl">
            {user ? "Track your bookings live" : "Sign up to track your bookings live"}
          </h2>
          <p className="text-white/70 mb-6 max-w-md">
            {user
              ? "Open your bookings to follow flight status, seats, and trip details in realtime."
              : "Create a free account to manage bookings and receive realtime gate & status updates."}
          </p>
          {!loading && (
            <Link
              to={user ? "/bookings" : "/auth"}
              search={user ? undefined : { mode: "signup" }}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-glow text-sky-deep font-semibold hover:bg-sky-glow/90 transition-colors"
            >
              {user ? "View bookings" : "Create account"}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
