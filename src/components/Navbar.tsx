"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useTranslations, useLocale } from "next-intl";
import { useRouter, usePathname } from "next/navigation";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

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

  const switchLocale = () => {
    const newLocale = locale === "ko" ? "en" : "ko";
    // 쿠키에 선택 저장
    document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=${60 * 60 * 24 * 365}`;
    // 현재 경로에서 locale 부분만 교체
    const pathWithoutLocale = pathname.replace(/^\/(ko|en)/, "");
    router.push(`/${newLocale}${pathWithoutLocale}`);
  };

  const avatarUrl = user?.user_metadata?.avatar_url;
  const displayName =
    user?.user_metadata?.full_name || user?.email || t("user");

  return (
    <nav className="bg-card border-b border-card-border sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href={`/${locale}`} className="text-gold font-bold text-lg tracking-wide">
          RSL Tools
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <Link
            href={`/${locale}/dashboard`}
            className="text-gray-400 hover:text-gold transition-colors"
          >
            {t("dashboard")}
          </Link>
          <Link
            href={`/${locale}/clan-boss`}
            className="text-gray-400 hover:text-gold transition-colors"
          >
            {t("clanBoss")}
          </Link>
          <Link
            href={`/${locale}/shard`}
            className="text-gray-400 hover:text-gold transition-colors"
          >
            {t("shard")}
          </Link>
          <Link
            href={`/${locale}/search`}
            className="text-gray-400 hover:text-gold transition-colors"
          >
            {t("search")}
          </Link>

          {/* Language Switch */}
          <button
            onClick={switchLocale}
            className="text-gray-500 hover:text-gold transition-colors text-xs font-mono border border-card-border rounded px-2 py-1 cursor-pointer"
            title={locale === "ko" ? "Switch to English" : "한국어로 전환"}
          >
            {locale === "ko" ? "EN" : "KO"}
          </button>

          {/* Login/User */}
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
                    alt={t("profile")}
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
                    {t("logout")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="bg-gold text-background px-4 py-1.5 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors"
            >
              {t("googleLogin")}
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
            href={`/${locale}/dashboard`}
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t("dashboard")}
          </Link>
          <Link
            href={`/${locale}/clan-boss`}
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t("clanBoss")}
          </Link>
          <Link
            href={`/${locale}/shard`}
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t("shard")}
          </Link>
          <Link
            href={`/${locale}/search`}
            className="text-gray-400 hover:text-gold transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            {t("search")}
          </Link>

          {/* Language Switch (Mobile) */}
          <button
            onClick={() => { switchLocale(); setMenuOpen(false); }}
            className="text-gray-500 hover:text-gold transition-colors text-xs font-mono border border-card-border rounded px-2 py-1 w-fit cursor-pointer"
          >
            {locale === "ko" ? "English" : "한국어"}
          </button>

          {/* Mobile Login/User */}
          {loading ? null : user ? (
            <div className="border-t border-card-border pt-3 mt-1">
              <div className="flex items-center gap-3 mb-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={t("profile")}
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
                {t("logout")}
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
              {t("googleLogin")}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
