"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, CircleUser } from "lucide-react";
import { Logo } from "./Logo";
import { ConnectWallet } from "./ConnectWallet";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/payer", label: "Pay" },
  { href: "/payee", label: "Get paid" },
];

export function Navbar() {
  const pathname = usePathname();
  const { authenticated } = usePrivy();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-liquid",
          scrolled
            ? "glass border-b border-ink/5"
            : "bg-transparent"
        )}
      >
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Logo />

          <div className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "relative rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  pathname === l.href
                    ? "text-ink"
                    : "text-ink/55 hover:text-ink"
                )}
              >
                {pathname === l.href && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-ink/5"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                {l.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            {authenticated && (
              <Link
                href="/profile"
                aria-label="Your profile"
                className={cn(
                  "hidden h-10 w-10 items-center justify-center rounded-full border border-ink/10 transition-colors md:flex",
                  pathname === "/profile"
                    ? "bg-ink/5 text-ink"
                    : "text-ink/60 hover:text-ink"
                )}
              >
                <CircleUser size={18} />
              </Link>
            )}
            <div className="hidden md:block">
              <ConnectWallet />
            </div>
            <button
              onClick={() => setOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 text-ink md:hidden"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-paper/95 backdrop-blur-xl md:hidden"
          >
            <div className="flex flex-col gap-2 px-6 pt-24">
              {links.map((l, i) => (
                <motion.div
                  key={l.href}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + i * 0.07 }}
                >
                  <Link
                    href={l.href}
                    className="block border-b border-ink/5 py-5 text-3xl font-semibold tracking-tightest text-ink"
                  >
                    {l.label}
                  </Link>
                </motion.div>
              ))}
              {authenticated && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.08 + links.length * 0.07 }}
                >
                  <Link
                    href="/profile"
                    className="flex items-center gap-3 border-b border-ink/5 py-5 text-3xl font-semibold tracking-tightest text-ink"
                  >
                    <CircleUser size={26} /> Profile
                  </Link>
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 }}
                className="mt-6"
              >
                <ConnectWallet />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
