"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  // 유저 메뉴 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName =
    user?.user_metadata?.full_name || user?.email || "사용자";

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

          {/* 로그인/유저 영역 */}
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-card-border animate-pulse" />
          ) : user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="프로필"
                    className="w-8 h-8 rounded-full border border-card-border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gold/20 text-gold flex items-center justify-center text-sm font-bold">
                    {displayName.charAt(0)}
                  </div>
                )}
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-card-border rounded-lg shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-card-border">
                    <p className="text-sm text-white font-medium truncate">
                      {displayName}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {user.email}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      signOut();
                      setUserMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-400 hover:text-red-400 hover:bg-card-border/50 transition-colors"
                  >
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="bg-gold text-background px-4 py-1.5 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors"
            >
              Google 로그인
            </button>
          )}
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

          {/* 모바일 로그인/유저 */}
          {loading ? null : user ? (
            <div className="border-t border-card-border pt-3 mt-1">
              <div className="flex items-center gap-3 mb-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="프로필"
                    className="w-8 h-8 rounded-full border border-card-border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gold/20 text-gold flex items-center justify-center text-sm font-bold">
                    {displayName.charAt(0)}
                  </div>
                )}
                <div>
                  <p className="text-sm text-white font-medium truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {user.email}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  signOut();
                  setMenuOpen(false);
                }}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                signInWithGoogle();
                setMenuOpen(false);
              }}
              className="bg-gold text-background px-4 py-2 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors w-full"
            >
              Google 로그인
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
