"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { useEffect, useRef } from "react";

export default function Home() {
  const t = useTranslations("home");
  const locale = useLocale();
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -30px 0px" }
    );
    document.querySelectorAll(".landing-reveal, .landing-stagger").forEach((el) =>
      observerRef.current?.observe(el)
    );
    return () => observerRef.current?.disconnect();
  }, []);

  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* ════════════════════════════════════════════════ */}
      {/* AD SLOT — Header top banner                      */}
      {/* ════════════════════════════════════════════════ */}
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-[40px] pb-[20px]">
        <div className="hidden flex items-center justify-center h-[125px] w-full max-w-[1200px] mx-auto rounded-xl border-2 border-dashed border-card-border/60 bg-card/30" id="ad-slot-top">
          <span className="text-[11px] text-gray-700 font-mono">AD</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* HERO — Split Layout                              */}
      {/* ════════════════════════════════════════════════ */}
      <section className="relative flex items-start overflow-hidden">
        {/* Ambient gradient mesh */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-gold/5 blur-[150px] pointer-events-none" style={{ animation: "pulse-glow 6s ease-in-out infinite" }} />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] rounded-full bg-gold/3 blur-[120px] pointer-events-none" style={{ animation: "pulse-glow 8s ease-in-out infinite 2s" }} />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-0 pb-12 md:pt-0 md:pb-16 w-full">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8 items-center">
            {/* Left: Content */}
            <div className="md:col-span-7 landing-reveal">
              <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.15em] font-medium bg-gold/10 text-gold border border-gold/20 mb-8">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t("heroTag")}
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-[3.5rem] font-bold tracking-tight leading-tight" style={{ wordBreak: "keep-all" }}>
                {t("heroTitle1")}<br />
                <span className="text-gold">{t("heroTitle2")}</span>
              </h1>
              <p className="text-base md:text-lg text-gray-400 leading-relaxed mt-6 max-w-[52ch]" style={{ wordBreak: "keep-all" }}>
                {t("heroDesc")}
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mt-10">
                <Link
                  href={`/${locale}/clan-boss`}
                  className="inline-flex items-center justify-center gap-3 bg-gold text-background font-bold rounded-full px-8 py-4 text-lg hover:bg-gold-dark hover:scale-[1.02] active:scale-[0.98] transition-all duration-500 shadow-[0_8px_32px_rgba(201,170,113,0.2)]"
                  style={{ transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
                >
                  {t("heroCta")}
                  <span className="w-8 h-8 rounded-full bg-background/20 flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </span>
                </Link>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 text-gray-400 font-medium rounded-full px-6 py-4 border border-card-border hover:border-gold/40 hover:text-gold transition-all duration-500"
                  style={{ transition: "all 0.5s cubic-bezier(0.16, 1, 0.3, 1)" }}
                >
                  {t("heroSecondary")}
                </a>
              </div>
              <p className="text-xs text-gray-600 mt-4">{t("heroCtaSub")}</p>
            </div>

            {/* Right: Simulator Mockup */}
            <div className="md:col-span-5 landing-reveal" style={{ transitionDelay: "200ms" }}>
              <div className="relative">
                {/* Glass card mockup of the calculator */}
                <div className="bg-card/80 backdrop-blur-xl border border-card-border rounded-2xl p-5 shadow-[0_32px_80px_rgba(0,0,0,0.3)]">
                  {/* Mock header */}
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    <span className="text-[10px] text-gray-600 ml-2 font-mono">rsl-tools.vercel.app/clan-boss</span>
                  </div>
                  {/* Difficulty buttons */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {["Easy", "Normal", "Hard", "Brutal", "NM"].map((d) => (
                      <span key={d} className="text-[10px] px-2.5 py-1 rounded-md bg-input-bg border border-input-border text-gray-500">
                        {d}
                      </span>
                    ))}
                    <span className="text-[10px] px-2.5 py-1 rounded-md bg-gold text-background font-bold">
                      UNM
                    </span>
                  </div>
                  {/* Champion slots mock */}
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {[
                      { name: "Demytha", color: "border-purple-500/60" },
                      { name: "Seeker", color: "border-yellow-500/60" },
                      { name: "Heiress", color: "border-blue-500/60" },
                      { name: "Fayne", color: "border-purple-500/60" },
                      { name: "DPS", color: "border-blue-500/60" },
                    ].map((c) => (
                      <div key={c.name} className={`aspect-square rounded-lg bg-input-bg border-2 ${c.color} flex items-center justify-center`}>
                        <span className="text-[8px] text-gray-500 font-mono">{c.name}</span>
                      </div>
                    ))}
                  </div>
                  {/* Sim result mock */}
                  <div className="space-y-1">
                    {[
                      { actor: "Demytha", skill: "A3", buffs: ["Block", "Unkill"], isBoss: false },
                      { actor: "Clanboss", skill: "AOE1", buffs: [], isBoss: true },
                      { actor: "Seeker", skill: "A2", buffs: ["SPD+", "TM+30%"], isBoss: false },
                      { actor: "Heiress", skill: "A2", buffs: ["SPD+"], isBoss: false },
                    ].map((row, i) => (
                      <div key={i} className={`flex items-center px-2 py-1 rounded text-[10px] ${row.isBoss ? "bg-background/50 text-gray-600" : ""}`}>
                        <span className={`w-16 truncate ${row.isBoss ? "text-gray-600" : "text-gray-400"}`}>{row.actor}</span>
                        <div className="flex-1 flex gap-1">
                          {row.buffs.map((b) => (
                            <span key={b} className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 text-[8px]">{b}</span>
                          ))}
                        </div>
                        <span className={`font-mono font-bold ${row.isBoss ? "text-red-400/60" : "text-gold"}`}>{row.skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Floating badge */}
                <div className="absolute -top-3 -right-3 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-1.5 backdrop-blur-sm" style={{ animation: "float 5s ease-in-out infinite" }}>
                  <span className="text-[10px] text-green-400 font-semibold">Buffs OK</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* TRUST STRIP — Metrics Marquee                    */}
      {/* ════════════════════════════════════════════════ */}
      <section className="border-y border-card-border/50 bg-card/30 py-4 overflow-hidden">
        <div className="flex whitespace-nowrap" style={{ animation: "marquee 20s linear infinite" }}>
          {[0, 1, 2, 3].map((dup) => (
            <div key={dup} className="flex items-center shrink-0">
              {[t("trustMetric1"), t("trustMetric2"), t("trustMetric3")].map((text, i) => (
                <div key={`${dup}-${i}`} className="flex items-center">
                  <span className="text-sm font-semibold text-gold/90 px-8">{text}</span>
                  <div className="w-1 h-1 rounded-full bg-gold/30" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* FEATURES — Bento Grid                            */}
      {/* ════════════════════════════════════════════════ */}
      <section id="features" className="py-8 md:py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 landing-reveal">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.15em] font-medium bg-gold/10 text-gold border border-gold/20 mb-6">
              {t("featuresTag")}
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight" style={{ wordBreak: "keep-all" }}>
              {t("featuresTitle")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 landing-stagger">
            {/* Clan Boss — Large card */}
            <Link href={`/${locale}/clan-boss`} className="md:col-span-8 md:row-span-2 group">
              <div className="h-full rounded-[1.5rem] bg-card border border-card-border p-8 md:p-10 hover:border-gold/30 transition-all duration-500 cursor-pointer">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center group-hover:bg-gold/20 transition-all duration-500">
                    <svg className="w-6 h-6 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-semibold uppercase mt-1">Core</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white group-hover:text-gold transition-colors duration-500 mb-3" style={{ wordBreak: "keep-all" }}>
                  {t("clanBossTitle")}
                </h3>
                <p className="text-gray-400 text-sm md:text-base leading-relaxed max-w-[50ch]" style={{ wordBreak: "keep-all" }}>
                  {t("clanBossDesc")}
                </p>
                {/* Mini simulation visualization */}
                <div className="mt-8 flex items-end gap-1.5 h-20">
                  {[40, 60, 35, 80, 55, 70, 45, 90, 60, 75, 50, 85].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t bg-gradient-to-t from-gold/20 to-gold/5 group-hover:from-gold/30 group-hover:to-gold/10 transition-all duration-500"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            </Link>

            {/* Shard Calculator */}
            <Link href={`/${locale}/shard`} className="md:col-span-4 group">
              <div className="h-full rounded-[1.5rem] bg-card border border-card-border p-8 hover:border-gold/30 transition-all duration-500 cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-4 group-hover:bg-gold/20 transition-all duration-500">
                  <svg className="w-6 h-6 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-gold transition-colors duration-500 mb-2" style={{ wordBreak: "keep-all" }}>
                  {t("shardTitle")}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed" style={{ wordBreak: "keep-all" }}>
                  {t("shardDesc")}
                </p>
              </div>
            </Link>

            {/* Buff/Debuff Search */}
            <Link href={`/${locale}/search`} className="md:col-span-4 group">
              <div className="h-full rounded-[1.5rem] bg-card border border-card-border p-8 hover:border-gold/30 transition-all duration-500 cursor-pointer">
                <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 flex items-center justify-center mb-4 group-hover:bg-gold/20 transition-all duration-500">
                  <svg className="w-6 h-6 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-white group-hover:text-gold transition-colors duration-500 mb-2" style={{ wordBreak: "keep-all" }}>
                  {t("searchTitle")}
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed" style={{ wordBreak: "keep-all" }}>
                  {t("searchDesc")}
                </p>
              </div>
            </Link>

          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* HOW IT WORKS — 3 Steps                           */}
      {/* ════════════════════════════════════════════════ */}
      <section className="py-8 md:py-10 bg-card/30 border-y border-card-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10 landing-reveal">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.15em] font-medium bg-gold/10 text-gold border border-gold/20 mb-6">
              {t("howTag")}
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight" style={{ wordBreak: "keep-all" }}>
              {t("howTitle")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 landing-stagger">
            {[
              { num: "01", titleKey: "step1Title" as const, descKey: "step1Desc" as const, icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
              { num: "02", titleKey: "step2Title" as const, descKey: "step2Desc" as const, icon: "M13 10V3L4 14h7v7l9-11h-7z" },
              { num: "03", titleKey: "step3Title" as const, descKey: "step3Desc" as const, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
            ].map((step) => (
              <div key={step.num} className="text-center md:text-left">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-card border border-card-border mb-6">
                  <svg className="w-6 h-6 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={step.icon} />
                  </svg>
                </div>
                <div className="text-gold/40 text-xs font-mono font-bold tracking-wider mb-2">STEP {step.num}</div>
                <h3 className="text-xl font-bold text-white mb-3" style={{ wordBreak: "keep-all" }}>{t(step.titleKey)}</h3>
                <p className="text-gray-500 text-sm leading-relaxed" style={{ wordBreak: "keep-all" }}>{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════ */}
      {/* AD SLOT — Bottom banner                          */}
      {/* ════════════════════════════════════════════════ */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="hidden flex items-center justify-center h-[125px] w-full max-w-[1200px] mx-auto rounded-xl border-2 border-dashed border-card-border/60 bg-card/30" id="ad-slot-bottom">
          <span className="text-[11px] text-gray-700 font-mono">AD</span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════ */}
      {/* FOOTER                                           */}
      {/* ════════════════════════════════════════════════ */}
      <footer className="border-t border-card-border py-8 text-center text-xs text-gray-600">
        <p>{t("footer")}</p>
      </footer>
    </div>
  );
}
