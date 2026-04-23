"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";

export function Navbar() {
  return (
    <nav className="border-b border-arc-border bg-arc-dark/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-arc-blue flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L7 13M1 7L13 7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="font-semibold text-white tracking-tight">Cadence</span>
        </Link>

        <div className="flex items-center gap-4">
          <Link href="/employer" className="text-sm text-gray-400 hover:text-white transition-colors">
            Employer
          </Link>
          <Link href="/employee" className="text-sm text-gray-400 hover:text-white transition-colors">
            Employee
          </Link>
          <ConnectButton
            chainStatus="icon"
            showBalance={false}
            accountStatus="address"
          />
        </div>
      </div>
    </nav>
  );
}
