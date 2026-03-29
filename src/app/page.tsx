import Link from "next/link";

const tools = [
  {
    title: "클랜보스 계산기",
    description:
      "불사덱, 쉴드덱 등 클랜보스 팀의 버프 유지 여부를 턴별로 시뮬레이션합니다.",
    href: "/clan-boss",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
        />
      </svg>
    ),
    status: "beta" as const,
  },
  {
    title: "파편 확률 계산기",
    description:
      "파편 개수별 레전드·에픽 획득 확률과 역계산을 제공합니다.",
    href: "/shard",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
        />
      </svg>
    ),
    status: "beta" as const,
  },
  {
    title: "챔피언 검색",
    description:
      "특정 버프나 디버프를 보유한 챔피언을 빠르게 검색합니다.",
    href: "/search",
    icon: (
      <svg
        className="w-8 h-8"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
    status: "beta" as const,
  },
];

export default function Home() {
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
            레이드: 그림자의 전설을 위한 도구 모음
          </p>
          <p className="mt-6 text-sm text-gray-500 max-w-lg mx-auto leading-relaxed">
            클랜보스 버프 시뮬레이터, 파편 확률 계산기, 챔피언 검색 등 다양한
            도구를 제공합니다. 한국 유저들의 실제 데이터를 기반으로 더 정확한
            정보를 만들어갑니다.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/clan-boss"
              className="bg-gold text-background px-6 py-2.5 rounded-lg font-semibold hover:bg-gold-dark transition-colors"
            >
              시작하기
            </Link>
            <button className="border border-card-border text-gray-400 px-6 py-2.5 rounded-lg hover:border-gold hover:text-gold transition-colors cursor-pointer">
              Google로 로그인
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
                {tool.title}
              </h3>
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">
                {tool.description}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-card-border py-6 text-center text-xs text-gray-600">
        <p>RSL Tools는 Plarium 또는 Raid: Shadow Legends와 관련이 없습니다.</p>
      </footer>
    </div>
  );
}
