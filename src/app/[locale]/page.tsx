import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";

export default function Home() {
  const t = useTranslations("home");
  const locale = useLocale();

  const tools: { titleKey: string; descKey: string; href: string; icon: React.ReactNode; status: "beta" | "coming" }[] = [
    {
      titleKey: "clanBossTitle",
      descKey: "clanBossDesc",
      href: `/${locale}/clan-boss`,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      status: "beta" as const,
    },
    {
      titleKey: "shardTitle",
      descKey: "shardDesc",
      href: `/${locale}/shard`,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      status: "beta" as const,
    },
    {
      titleKey: "searchTitle",
      descKey: "searchDesc",
      href: `/${locale}/search`,
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      status: "beta" as const,
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-gold/5 to-transparent pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 pt-20 pb-16 text-center relative">
          <h1 className="text-4xl md:text-5xl font-bold text-gold tracking-tight">
            RSL Tools
          </h1>
          <p className="mt-3 text-lg md:text-xl text-gray-400">
            {t("subtitle")}
          </p>
          <p className="mt-6 text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
            {t("description")}
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href={`/${locale}/clan-boss`}
              className="bg-gold text-background px-6 py-2.5 rounded-lg font-semibold hover:bg-gold-dark transition-colors"
            >
              {t("getStarted")}
            </Link>
            <button className="border border-card-border text-gray-400 px-6 py-2.5 rounded-lg hover:border-gold hover:text-gold transition-colors cursor-pointer">
              {t("googleLogin")}
            </button>
          </div>
        </div>
      </section>

      {/* Tool Cards */}
      <section className="max-w-4xl mx-auto px-4 pb-20 w-full">
        <div className="grid md:grid-cols-3 gap-4">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group bg-card border border-card-border rounded-xl p-6 hover:border-gold/50 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="text-gold/70 group-hover:text-gold transition-colors">
                  {tool.icon}
                </div>
                {tool.status === "beta" && (
                  <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-semibold uppercase">
                    Beta
                  </span>
                )}
                {tool.status === "coming" && (
                  <span className="text-[10px] bg-card-border text-gray-500 px-2 py-0.5 rounded-full font-semibold uppercase">
                    Soon
                  </span>
                )}
              </div>
              <h3 className="mt-4 font-semibold text-white group-hover:text-gold transition-colors">
                {t(tool.titleKey)}
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                {t(tool.descKey)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-card-border py-6 text-center text-xs text-gray-600">
        <p>{t("footer")}</p>
      </footer>
    </div>
  );
}
