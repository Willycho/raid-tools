"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="bg-card border-b border-card-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="text-gold font-bold text-lg tracking-wide">
          RSL Tools
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-gold transition-colors"
          >
            대시보드
          </Link>
          <Link
            href="/clan-boss"
            className="text-gray-400 hover:text-gold transition-colors"
          >
            클랜보스 계산기
          </Link>
          <Link
            href="/shard"
            className="text-gray-400 hover:text-gold transition-colors"
          >
            파편 확률 계산기
          </Link>
          <Link
            href="/search"
            className="text-gray-400 hover:text-gold transition-colors"
          >
            버프/디버프 검색
          </Link>
          <button className="bg-gold text-background px-4 py-1.5 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors">
            Google 로그인
          </button>
        </div>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden text-gray-400 hover:text-gold"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {menuOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-card-border px-4 py-3 flex flex-col gap-3 text-sm">
          <Link
            href="/dashboard"
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            대시보드
          </Link>
          <Link
            href="/clan-boss"
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            클랜보스 계산기
          </Link>
          <Link
            href="/shard"
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            파편 확률 계산기
          </Link>
          <Link
            href="/search"
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            버프/디버프 검색
          </Link>
          <button className="bg-gold text-background px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors w-full">
            Google 로그인
          </button>
        </div>
      )}
    </nav>
  );
}
