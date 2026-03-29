"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";

// ── 타입 ────────────────────────────────────────────
interface PullRecord {
  trackKey: string;
  pulledAt: number;
  timestamp: number;
  wasCeiling: boolean;
  championName?: string;
}

interface TrackDef {
  key: string;
  label: string;
  rarity: string;
  shardName: string;
  image: string;
  color: string;
  textColor: string;
  bgColor: string;
}

const TRACKS: TrackDef[] = [
  { key: "ancient_0", label: "고대", rarity: "전설", shardName: "고대", image: "/shards/ancient.png", color: "#3B82F6", textColor: "text-blue-400", bgColor: "bg-blue-500/10" },
  { key: "void_0", label: "보이드", rarity: "전설", shardName: "보이드", image: "/shards/void.png", color: "#A855F7", textColor: "text-purple-400", bgColor: "bg-purple-500/10" },
  { key: "sacred_0", label: "신성", rarity: "전설", shardName: "신성", image: "/shards/sacred.png", color: "#EAB308", textColor: "text-yellow-400", bgColor: "bg-yellow-500/10" },
  { key: "primal_0", label: "태고 전설", rarity: "전설", shardName: "태고", image: "/shards/primal.png", color: "#EF4444", textColor: "text-red-400", bgColor: "bg-red-500/10" },
  { key: "primal_1", label: "태고 신화", rarity: "신화", shardName: "태고", image: "/shards/primal.png", color: "#F97316", textColor: "text-orange-400", bgColor: "bg-orange-500/10" },
];

// 꺾은선 차트에 쓸 파편 그룹 (고대/보이드/신성/태고 4개)
const SHARD_GROUPS = [
  { keys: ["ancient_0"], label: "고대", color: "#3B82F6", image: "/shards/ancient.png" },
  { keys: ["void_0"], label: "보이드", color: "#A855F7", image: "/shards/void.png" },
  { keys: ["sacred_0"], label: "신성", color: "#EAB308", image: "/shards/sacred.png" },
  { keys: ["primal_0", "primal_1"], label: "태고", color: "#EF4444", image: "/shards/primal.png" },
];

// ── localStorage ────────────────────────────────────
function loadPity(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem("rsl_shard_pity") || "{}"); }
  catch { return {}; }
}

function loadHistory(): PullRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("rsl_shard_history") || "[]"); }
  catch { return []; }
}

// ── 파편별 체감 확률 추이 차트 ──────────────────────
function RateTrendChart({ history, height = 300 }: {
  history: PullRecord[];
  height?: number;
}) {
  const chartData = useMemo(() => {
    if (history.length === 0) return null;

    // 모든 레코드에서 고유 날짜 추출 (시간순)
    const allDates = new Map<string, number>(); // dateKey -> timestamp
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    for (const r of sorted) {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!allDates.has(key)) allDates.set(key, r.timestamp);
    }
    const dateKeys = Array.from(allDates.keys()); // 이미 시간순
    if (dateKeys.length === 0) return null;

    // 각 그룹별로 날짜 시점마다의 누적 체감 확률 계산
    const lines = SHARD_GROUPS.map((group) => {
      const records = sorted.filter((r) => group.keys.includes(r.trackKey));
      if (records.length === 0) return { ...group, points: [] as { dateKey: string; rate: number }[] };

      // 날짜별로 누적
      let cumPulls = 0;
      let cumCount = 0;
      const dateRateMap = new Map<string, number>();
      for (const r of records) {
        const d = new Date(r.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        cumPulls += r.pulledAt;
        cumCount += 1;
        dateRateMap.set(key, (cumCount / cumPulls) * 100);
      }

      // 전체 날짜 배열에 대해 포인트 생성 (값이 없으면 이전 값 유지)
      const points: { dateKey: string; rate: number }[] = [];
      let lastRate = -1;
      for (const dk of dateKeys) {
        if (dateRateMap.has(dk)) {
          lastRate = dateRateMap.get(dk)!;
          points.push({ dateKey: dk, rate: lastRate });
        } else if (lastRate >= 0) {
          // 이 그룹에 데이터 없는 날 → 이전 값 유지 (라인 연결)
          points.push({ dateKey: dk, rate: lastRate });
        }
      }

      return { ...group, points };
    });

    return { dateKeys, lines: lines.filter((l) => l.points.length > 0) };
  }, [history]);

  if (!chartData || chartData.lines.length === 0) {
    return (
      <div className="flex items-center justify-center text-gray-600 text-xs" style={{ height }}>
        획득 기록이 없습니다. <a href="/shard" className="text-gold ml-1 hover:underline">파편 계산기</a>에서 기록을 입력하세요.
      </div>
    );
  }

  const { dateKeys, lines } = chartData;
  const pad = { top: 30, right: 60, bottom: 55, left: 55 };
  const w = 700;
  const h = height;
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  // X축: 날짜 인덱스
  const dateCount = dateKeys.length;
  const scaleXIdx = (idx: number) => pad.left + (dateCount === 1 ? chartW / 2 : (idx / (dateCount - 1)) * chartW);

  // Y축: 체감 확률 범위
  let minRate = Infinity;
  let maxRate = 0;
  for (const line of lines) {
    for (const p of line.points) {
      if (p.rate < minRate) minRate = p.rate;
      if (p.rate > maxRate) maxRate = p.rate;
    }
  }
  const yMin = Math.max(0, Math.floor(minRate * 0.7 * 10) / 10);
  const yMax = Math.ceil(maxRate * 1.3 * 10) / 10;
  const yRange = yMax - yMin || 1;
  const scaleY = (rate: number) => pad.top + (1 - (rate - yMin) / yRange) * chartH;

  // Y축 그리드
  const yTicks: number[] = [];
  const step = yRange <= 2 ? 0.5 : yRange <= 5 ? 1 : yRange <= 20 ? 5 : 10;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) {
    yTicks.push(Math.round(v * 100) / 100);
  }

  // X축 날짜 라벨 (너무 많으면 건너뛰기)
  const formatDate = (dk: string) => {
    const [, m, d] = dk.split("-");
    return `${parseInt(m)}/${parseInt(d)}`;
  };
  const maxLabels = 12;
  const xLabelStep = Math.max(1, Math.ceil(dateCount / maxLabels));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {/* Y축 그리드 + 라벨 */}
        {yTicks.map((v) => {
          const y = scaleY(v);
          return (
            <g key={`yt-${v}`}>
              <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#1f2937" strokeWidth={1} />
              <text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#6B7280" fontSize={9} fontFamily="monospace">
                {v.toFixed(step < 1 ? 1 : 0)}%
              </text>
            </g>
          );
        })}

        {/* X축 날짜 라벨 */}
        {dateKeys.map((dk, i) => {
          const show = i === 0 || i === dateCount - 1 || i % xLabelStep === 0;
          if (!show) return null;
          const x = scaleXIdx(i);
          return (
            <text key={`xd-${i}`} x={x} y={h - pad.bottom + 16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily="monospace">
              {formatDate(dk)}
            </text>
          );
        })}

        {/* 라인들 */}
        {lines.map((line) => {
          if (line.points.length === 0) return null;
          // 각 포인트의 dateKey → dateKeys 인덱스로 X 매핑
          const mappedPoints = line.points.map((p) => {
            const idx = dateKeys.indexOf(p.dateKey);
            return { x: scaleXIdx(idx), y: scaleY(p.rate), rate: p.rate, dateKey: p.dateKey };
          });
          const pathD = mappedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          const last = mappedPoints[mappedPoints.length - 1];
          return (
            <g key={line.label}>
              <path d={pathD} fill="none" stroke={line.color} strokeWidth={2.5} strokeLinejoin="round" opacity={0.9} />
              {mappedPoints.map((p, i) => {
                const isLast = i === mappedPoints.length - 1;
                // 데이터가 실제로 변한 포인트만 dot 표시 (또는 처음/마지막)
                const prevRate = i > 0 ? mappedPoints[i - 1].rate : -1;
                const showDot = isLast || i === 0 || Math.abs(p.rate - prevRate) > 0.001;
                if (!showDot) return null;
                return (
                  <g key={`${line.label}-${i}`}>
                    <circle cx={p.x} cy={p.y} r={isLast ? 5 : 3} fill={isLast ? line.color : "#0d0d1a"} stroke={line.color} strokeWidth={isLast ? 2.5 : 1.5} />
                    {isLast && (
                      <text x={p.x + 8} y={p.y + 4} fill={line.color} fontSize={10} fontFamily="monospace" fontWeight="bold">
                        {p.rate.toFixed(2)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="flex justify-center gap-5 mt-3">
        {SHARD_GROUPS.map((g) => (
          <div key={g.label} className="flex items-center gap-1.5">
            <div className="w-4 h-[2.5px] rounded" style={{ backgroundColor: g.color }} />
            <Image src={g.image} alt={g.label} width={16} height={16} />
            <span className="text-[10px] text-gray-400">{g.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 스탯 카드 ────────────────────────────────────────
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
      <div className="text-[10px] text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color || "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── 기간 필터 드롭다운 ──────────────────────────────
const PERIOD_OPTIONS = [
  { label: "전체 기간", value: 0 },
  { label: "오늘", value: 1 },
  { label: "최근 7일", value: 7 },
  { label: "최근 30일", value: 30 },
  { label: "최근 90일", value: 90 },
];

function PeriodDropdown({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = PERIOD_OPTIONS.find((o) => o.value === value) || PERIOD_OPTIONS[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs bg-[#1a1a2e] border border-gray-700 hover:border-gold/50 text-gray-300 px-3 py-1.5 rounded-lg transition-colors"
      >
        {selected.label}
        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-[#1a1a2e] border border-gray-700 rounded-lg overflow-hidden z-10 shadow-xl min-w-[120px]">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-800 transition-colors ${opt.value === value ? "text-gold font-bold" : "text-gray-400"}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 메인 ────────────────────────────────────────────
export default function Dashboard() {
  const [pity, setPity] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<PullRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [period, setPeriod] = useState(0); // 0 = 전체

  useEffect(() => {
    setPity(loadPity());
    setHistory(loadHistory());
    setLoaded(true);
  }, []);

  // 기간 필터 적용된 히스토리
  const filteredHistory = useMemo(() => {
    if (period === 0) return history;
    const cutoff = Date.now() - period * 24 * 60 * 60 * 1000;
    return history.filter((r) => r.timestamp >= cutoff);
  }, [history, period]);

  const stats = useMemo(() => {
    const result: Record<string, {
      totalPulls: number;
      pullCount: number;
      avg: number;
      rate: string;
      records: PullRecord[];
      currentPity: number;
    }> = {};

    for (const track of TRACKS) {
      const records = filteredHistory.filter((r) => r.trackKey === track.key);
      const currentPity = pity[track.key] ?? 0;
      // 기간 필터가 있으면 현재 pity 미포함 (해당 기간 데이터만)
      const totalPulls = records.reduce((s, r) => s + r.pulledAt, 0) + (period === 0 ? currentPity : 0);
      const avg = records.length > 0
        ? Math.round(records.reduce((s, r) => s + r.pulledAt, 0) / records.length)
        : 0;
      const rate = records.length > 0
        ? ((1 / avg) * 100).toFixed(2) + "%"
        : "-";

      result[track.key] = { totalPulls, pullCount: records.length, avg, rate, records, currentPity: period === 0 ? currentPity : 0 };
    }

    return result;
  }, [filteredHistory, pity, period]);

  const totalShardsUsed = useMemo(() => {
    return Object.values(stats).reduce((s, t) => s + t.totalPulls, 0);
  }, [stats]);

  const totalPulls = useMemo(() => {
    return Object.values(stats).reduce((s, t) => s + t.pullCount, 0);
  }, [stats]);

  if (!loaded) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">
            파편 소모 현황 및 체감 확률 통계
            <span className="ml-2 text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">내 데이터</span>
          </p>
        </div>
        <PeriodDropdown value={period} onChange={setPeriod} />
      </div>

      {/* 총합 스탯 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="총 파편 소모" value={totalShardsUsed} sub="모든 파편 합산" color="text-gold" />
        <StatCard label="총 획득 횟수" value={totalPulls} sub="전설 + 신화" color="text-emerald-400" />
        <StatCard
          label="전체 체감 확률"
          value={totalPulls > 0 && totalShardsUsed > 0 ? ((totalPulls / totalShardsUsed) * 100).toFixed(2) + "%" : "-"}
          sub="획득 / 소모"
          color="text-amber-400"
        />
        <StatCard
          label="가장 많이 깐 파편"
          value={(() => {
            const max = TRACKS.reduce((best, t) => {
              const s = stats[t.key];
              return s && s.totalPulls > (best?.totalPulls || 0) ? { ...s, name: t.shardName } : best;
            }, null as (typeof stats[string] & { name: string }) | null);
            return max?.name || "-";
          })()}
          sub={(() => {
            const max = TRACKS.reduce((best, t) => {
              const s = stats[t.key];
              return s && s.totalPulls > (best?.totalPulls || 0) ? s : best;
            }, null as typeof stats[string] | null);
            return max ? `${max.totalPulls}개` : "";
          })()}
        />
      </div>

      {/* 파편별 상세 스탯 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
        {TRACKS.map((track) => {
          const s = stats[track.key];
          return (
            <div key={track.key} className={`bg-[#1a1a2e] border border-gray-800 rounded-xl p-3 ${track.bgColor}`}>
              <div className="flex items-center gap-2 mb-2">
                <Image src={track.image} alt={track.shardName} width={28} height={28} className="drop-shadow" />
                <div className={`text-xs font-bold ${track.textColor}`}>{track.label}</div>
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">총 소환</span>
                  <span className="text-white font-mono font-bold">{s?.totalPulls || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">획득</span>
                  <span className="text-emerald-400 font-mono font-bold">{s?.pullCount || 0}회</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">평균</span>
                  <span className="text-gray-300 font-mono">{s?.avg || "-"}개</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">체감</span>
                  <span className={`font-mono font-bold ${track.textColor}`}>{s?.rate || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">현재 pity</span>
                  <span className="text-gray-400 font-mono">{s?.currentPity || 0}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 그래프: 파편별 체감 확률 추이 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
        <h2 className="text-sm font-bold text-white mb-4">파편별 체감 확률 추이</h2>
        <RateTrendChart history={filteredHistory} height={300} />
      </div>

      {/* 안내 */}
      {totalShardsUsed === 0 && period === 0 && (
        <div className="text-center text-gray-600 text-sm py-8">
          아직 데이터가 없습니다. <a href="/shard" className="text-gold hover:underline">파편 계산기</a>에서 소환 기록을 입력해보세요!
        </div>
      )}
      {totalShardsUsed === 0 && period > 0 && (
        <div className="text-center text-gray-600 text-sm py-8">
          선택한 기간에 데이터가 없습니다.
        </div>
      )}

      {/* 로그인 유도 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-6 text-center">
        <p className="text-gray-400 text-sm mb-2">
          다른 유저들의 데이터와 비교하고 싶다면?
        </p>
        <p className="text-gray-600 text-xs mb-4">
          Google 로그인 후 데이터가 서버에 저장되며, 전체 한국 유저 통계를 확인할 수 있습니다.
        </p>
        <button className="bg-gold text-background px-6 py-2 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors cursor-pointer">
          Google로 로그인 (준비 중)
        </button>
      </div>
    </div>
  );
}
