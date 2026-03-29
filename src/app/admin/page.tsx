"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { getSupabase } from "@/lib/supabase";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());

// ── 타입 ──────────────────────────────────────
interface VisitStats {
  totalPageViews: number;
  uniqueVisitors: number;
  loggedInUsers: number;
  anonymousVisitors: number;
  pageBreakdown: { page: string; count: number }[];
}

interface UserInfo {
  id: string;
  shardAccounts: number;
  shardRecords: number;
  totalPulls: number;
  cbPresets: number;
  createdAt: string;
}

interface PullRecord {
  trackKey: string;
  pulledAt: number;
  timestamp: number;
  wasCeiling: boolean;
}

// ── 대시보드용 상수 ──────────────────────────────
const TRACKS = [
  { key: "ancient_0", label: "고대", rarity: "전설", shardName: "고대", image: "/shards/ancient.png", color: "#3B82F6", textColor: "text-blue-400", bgColor: "bg-blue-500/10" },
  { key: "void_0", label: "보이드", rarity: "전설", shardName: "보이드", image: "/shards/void.png", color: "#A855F7", textColor: "text-purple-400", bgColor: "bg-purple-500/10" },
  { key: "sacred_0", label: "신성", rarity: "전설", shardName: "신성", image: "/shards/sacred.png", color: "#EAB308", textColor: "text-yellow-400", bgColor: "bg-yellow-500/10" },
  { key: "primal_0", label: "태고 전설", rarity: "전설", shardName: "태고", image: "/shards/primal.png", color: "#EF4444", textColor: "text-red-400", bgColor: "bg-red-500/10" },
  { key: "primal_1", label: "태고 신화", rarity: "신화", shardName: "태고", image: "/shards/primal.png", color: "#F97316", textColor: "text-orange-400", bgColor: "bg-orange-500/10" },
];

const SHARD_GROUPS = [
  { keys: ["ancient_0"], label: "고대", color: "#3B82F6", image: "/shards/ancient.png" },
  { keys: ["void_0"], label: "보이드", color: "#A855F7", image: "/shards/void.png" },
  { keys: ["sacred_0"], label: "신성", color: "#EAB308", image: "/shards/sacred.png" },
  { keys: ["primal_0", "primal_1"], label: "태고", color: "#EF4444", image: "/shards/primal.png" },
];

function toTrackKey(shardType: string, rarity: string): string {
  if (rarity === "mythical") return `${shardType}_1`;
  return `${shardType}_0`;
}

// ── 차트 (대시보드 복사) ──────────────────────────
function RateTrendChart({ history, height = 300 }: { history: PullRecord[]; height?: number }) {
  const chartData = useMemo(() => {
    if (history.length === 0) return null;
    const allDates = new Map<string, number>();
    const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);
    for (const r of sorted) {
      const d = new Date(r.timestamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!allDates.has(key)) allDates.set(key, r.timestamp);
    }
    const dateKeys = Array.from(allDates.keys());
    if (dateKeys.length === 0) return null;

    const lines = SHARD_GROUPS.map((group) => {
      const records = sorted.filter((r) => group.keys.includes(r.trackKey));
      if (records.length === 0) return { ...group, points: [] as { dateKey: string; rate: number }[] };
      let cumPulls = 0, cumCount = 0;
      const dateRateMap = new Map<string, number>();
      for (const r of records) {
        const d = new Date(r.timestamp);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        cumPulls += r.pulledAt;
        cumCount += 1;
        dateRateMap.set(key, (cumCount / cumPulls) * 100);
      }
      const points: { dateKey: string; rate: number }[] = [];
      let lastRate = -1;
      for (const dk of dateKeys) {
        if (dateRateMap.has(dk)) { lastRate = dateRateMap.get(dk)!; points.push({ dateKey: dk, rate: lastRate }); }
        else if (lastRate >= 0) { points.push({ dateKey: dk, rate: lastRate }); }
      }
      return { ...group, points };
    });
    return { dateKeys, lines: lines.filter((l) => l.points.length > 0) };
  }, [history]);

  if (!chartData || chartData.lines.length === 0) {
    return <div className="flex items-center justify-center text-gray-600 text-xs" style={{ height }}>데이터 없음</div>;
  }

  const { dateKeys, lines } = chartData;
  const pad = { top: 30, right: 60, bottom: 55, left: 55 };
  const w = 700, h = height;
  const chartW = w - pad.left - pad.right, chartH = h - pad.top - pad.bottom;
  const dateCount = dateKeys.length;
  const scaleXIdx = (idx: number) => pad.left + (dateCount === 1 ? chartW / 2 : (idx / (dateCount - 1)) * chartW);

  let minRate = Infinity, maxRate = 0;
  for (const line of lines) for (const p of line.points) { if (p.rate < minRate) minRate = p.rate; if (p.rate > maxRate) maxRate = p.rate; }
  const yMin = Math.max(0, Math.floor(minRate * 0.7 * 10) / 10);
  const yMax = Math.ceil(maxRate * 1.3 * 10) / 10;
  const yRange = yMax - yMin || 1;
  const scaleY = (rate: number) => pad.top + (1 - (rate - yMin) / yRange) * chartH;

  const yTicks: number[] = [];
  const step = yRange <= 2 ? 0.5 : yRange <= 5 ? 1 : yRange <= 20 ? 5 : 10;
  for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yTicks.push(Math.round(v * 100) / 100);

  const formatDate = (dk: string) => { const [, m, d] = dk.split("-"); return `${parseInt(m)}/${parseInt(d)}`; };
  const maxLabels = 12;
  const xLabelStep = Math.max(1, Math.ceil(dateCount / maxLabels));

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {yTicks.map((v) => { const y = scaleY(v); return (<g key={`yt-${v}`}><line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#1f2937" strokeWidth={1} /><text x={pad.left - 8} y={y + 3} textAnchor="end" fill="#6B7280" fontSize={9} fontFamily="monospace">{v.toFixed(step < 1 ? 1 : 0)}%</text></g>); })}
        {dateKeys.map((dk, i) => { const show = i === 0 || i === dateCount - 1 || i % xLabelStep === 0; if (!show) return null; return <text key={`xd-${i}`} x={scaleXIdx(i)} y={h - pad.bottom + 16} textAnchor="middle" fill="#6B7280" fontSize={8} fontFamily="monospace">{formatDate(dk)}</text>; })}
        {lines.map((line) => {
          if (line.points.length === 0) return null;
          const mp = line.points.map((p) => ({ x: scaleXIdx(dateKeys.indexOf(p.dateKey)), y: scaleY(p.rate), rate: p.rate }));
          const pathD = mp.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          return (<g key={line.label}><path d={pathD} fill="none" stroke={line.color} strokeWidth={2.5} strokeLinejoin="round" opacity={0.9} />
            {mp.map((p, i) => { const isLast = i === mp.length - 1; const prev = i > 0 ? mp[i - 1].rate : -1; if (!isLast && i !== 0 && Math.abs(p.rate - prev) < 0.001) return null; return (<g key={i}><circle cx={p.x} cy={p.y} r={isLast ? 5 : 3} fill={isLast ? line.color : "#0d0d1a"} stroke={line.color} strokeWidth={isLast ? 2.5 : 1.5} />{isLast && <text x={p.x + 8} y={p.y + 4} fill={line.color} fontSize={10} fontFamily="monospace" fontWeight="bold">{p.rate.toFixed(2)}%</text>}</g>); })}
          </g>);
        })}
      </svg>
      <div className="flex justify-center gap-5 mt-3">
        {SHARD_GROUPS.map((g) => (<div key={g.label} className="flex items-center gap-1.5"><div className="w-4 h-[2.5px] rounded" style={{ backgroundColor: g.color }} /><Image src={g.image} alt={g.label} width={16} height={16} /><span className="text-[10px] text-gray-400">{g.label}</span></div>))}
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────
export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"visits" | "shards">("visits");
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // 방문 탭 데이터
  const [visits, setVisits] = useState<VisitStats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [userPage, setUserPage] = useState(0);
  const [totalVisitRows, setTotalVisitRows] = useState(0);
  const USERS_PER_PAGE = 10;

  // 파편 탭 데이터
  const [allHistory, setAllHistory] = useState<PullRecord[]>([]);
  const [allPity, setAllPity] = useState<Record<string, number>>({});

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  const loadData = useCallback(async () => {
    if (!user) return;
    const sb = getSupabase();

    // ── 방문 통계 ──
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const { data: visitRows } = await sb
      .from("page_visits").select("*")
      .gte("visited_at", todayStart).lte("visited_at", todayEnd);

    // 전체 row 수
    const { count } = await sb.from("page_visits").select("*", { count: "exact", head: true });
    setTotalVisitRows(count || 0);

    if (visitRows) {
      const filtered = visitRows.filter((v: { page: string }) => !v.page.startsWith("/admin"));
      const allVisitorIds = new Set(filtered.map((v: { visitor_id: string }) => v.visitor_id));
      const loggedInUserIds = new Set(filtered.filter((v: { user_id: string | null }) => v.user_id).map((v: { user_id: string }) => v.user_id));
      const anonymousVisitorIds = new Set(filtered.filter((v: { user_id: string | null }) => !v.user_id).map((v: { visitor_id: string }) => v.visitor_id));

      const pageVisitorMap = new Map<string, Set<string>>();
      for (const v of filtered) {
        if (!pageVisitorMap.has(v.page)) pageVisitorMap.set(v.page, new Set());
        pageVisitorMap.get(v.page)!.add(v.visitor_id);
      }
      setVisits({
        totalPageViews: filtered.length,
        uniqueVisitors: allVisitorIds.size,
        loggedInUsers: loggedInUserIds.size,
        anonymousVisitors: anonymousVisitorIds.size,
        pageBreakdown: Array.from(pageVisitorMap.entries()).map(([page, vs]) => ({ page, count: vs.size })).sort((a, b) => b.count - a.count),
      });
    }

    // ── 유저 목록 ──
    const { data: shardAccounts } = await sb.from("shard_accounts").select("*");
    const { data: shardHistoryRaw } = await sb.from("shard_history").select("account_id, count");
    const { data: cbPresets } = await sb.from("clan_boss_presets").select("user_id");

    const userMap = new Map<string, UserInfo>();
    const accountToUser = new Map<string, string>();

    if (shardAccounts) {
      for (const acc of shardAccounts) {
        accountToUser.set(acc.id, acc.user_id);
        if (!userMap.has(acc.user_id)) {
          userMap.set(acc.user_id, { id: acc.user_id, shardAccounts: 0, shardRecords: 0, totalPulls: 0, cbPresets: 0, createdAt: acc.created_at });
        }
        userMap.get(acc.user_id)!.shardAccounts += 1;
      }
      if (shardHistoryRaw) {
        for (const h of shardHistoryRaw) {
          const userId = accountToUser.get(h.account_id);
          if (userId && userMap.has(userId)) { userMap.get(userId)!.shardRecords += 1; userMap.get(userId)!.totalPulls += h.count || 0; }
        }
      }
    }
    if (cbPresets) {
      for (const p of cbPresets) {
        if (!userMap.has(p.user_id)) userMap.set(p.user_id, { id: p.user_id, shardAccounts: 0, shardRecords: 0, totalPulls: 0, cbPresets: 0, createdAt: "" });
        userMap.get(p.user_id)!.cbPresets += 1;
      }
    }
    setUsers(Array.from(userMap.values()).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()));

    // ── 파편 데이터 (전체 유저 합산) ──
    const { data: histRows } = await sb.from("shard_history").select("*");
    if (histRows) {
      setAllHistory(histRows.map((r: { shard_type: string; rarity: string; count: number; is_mercy: boolean; pulled_at: string }) => ({
        trackKey: toTrackKey(r.shard_type, r.rarity),
        pulledAt: r.count,
        timestamp: new Date(r.pulled_at).getTime(),
        wasCeiling: r.is_mercy,
      })));
    }

    // pity 합산
    const { data: pityRows } = await sb.from("shard_pity").select("*");
    if (pityRows) {
      const p: Record<string, number> = {};
      for (const r of pityRows) {
        const k0 = `${r.shard_type}_0`;
        const k1 = `${r.shard_type}_1`;
        p[k0] = (p[k0] || 0) + (r.legendary || 0);
        p[k1] = (p[k1] || 0) + (r.epic || 0);
      }
      setAllPity(p);
    }

    setLastRefresh(new Date());
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && isAdmin) loadData();
    else if (!authLoading) setLoading(false);
  }, [authLoading, isAdmin, loadData]);

  const handleRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // 오래된 방문 데이터 삭제 (7일 이전)
  const handlePurgeVisits = async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await getSupabase().from("page_visits").delete().lt("visited_at", cutoff);
    await loadData();
  };

  // ── 파편 통계 계산 ──
  const shardStats = useMemo(() => {
    const result: Record<string, { totalPulls: number; pullCount: number; avg: number; rate: string; currentPity: number }> = {};
    for (const track of TRACKS) {
      const records = allHistory.filter((r) => r.trackKey === track.key);
      const currentPity = allPity[track.key] ?? 0;
      const totalPulls = records.reduce((s, r) => s + r.pulledAt, 0) + currentPity;
      const avg = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.pulledAt, 0) / records.length) : 0;
      const rate = records.length > 0 ? ((1 / avg) * 100).toFixed(2) + "%" : "-";
      result[track.key] = { totalPulls, pullCount: records.length, avg, rate, currentPity };
    }
    return result;
  }, [allHistory, allPity]);

  const totalShardsUsed = Object.values(shardStats).reduce((s, t) => s + t.totalPulls, 0);
  const totalPullCount = Object.values(shardStats).reduce((s, t) => s + t.pullCount, 0);

  // 권한 체크
  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" /></div>;
  }
  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-[#1a1a2e] border border-red-500/30 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
          <svg className="w-12 h-12 mx-auto text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
          <h2 className="text-white text-lg font-bold mb-2">접근 권한 없음</h2>
          <p className="text-gray-500 text-sm">관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  const fmt = (d: string) => { if (!d) return "-"; const date = new Date(d); return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`; };
  const totalUserPages = Math.ceil(users.length / USERS_PER_PAGE);
  const pagedUsers = users.slice(userPage * USERS_PER_PAGE, (userPage + 1) * USERS_PER_PAGE);
  const pageName: Record<string, string> = { "/": "메인", "/clan-boss": "클랜보스 계산기", "/shard": "파편 확률 계산기", "/search": "버프/디버프 검색", "/dashboard": "대시보드" };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {lastRefresh && <span className="text-[10px] text-gray-600">마지막 갱신: {fmt(lastRefresh.toISOString())}</span>}
          </p>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-background rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors cursor-pointer disabled:opacity-50">
          <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {refreshing ? "갱신 중..." : "새로고침"}
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 mb-6 bg-[#0d0d1a] rounded-lg p-1 w-fit">
        {([["visits", "방문 통계"], ["shards", "파편 통계"]] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${tab === key ? "bg-gold text-background" : "text-gray-400 hover:text-white"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ 방문 통계 탭 ═══════════ */}
      {tab === "visits" && (
        <>
          {/* 상단 카드 */}
          <h2 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">오늘 (00:00 ~ 23:59)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">페이지뷰</div>
              <div className="text-2xl font-bold font-mono text-gold">{visits?.totalPageViews ?? 0}</div>
            </div>
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">유니크 방문자</div>
              <div className="text-2xl font-bold font-mono text-emerald-400">{visits?.uniqueVisitors ?? 0}</div>
              <div className="text-[9px] text-gray-600 mt-0.5">디바이스 ID 기준</div>
            </div>
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">로그인 유저</div>
              <div className="text-2xl font-bold font-mono text-blue-400">{visits?.loggedInUsers ?? 0}</div>
              <div className="text-[9px] text-gray-600 mt-0.5">계정 기준</div>
            </div>
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">비로그인 방문자</div>
              <div className="text-2xl font-bold font-mono text-gray-400">{visits?.anonymousVisitors ?? 0}</div>
              <div className="text-[9px] text-gray-600 mt-0.5">디바이스 ID 기준</div>
            </div>
          </div>

          {/* 페이지별 */}
          {visits && visits.pageBreakdown.length > 0 && (
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
              <h2 className="text-sm font-bold text-white mb-3">페이지별 유니크 방문자 (오늘)</h2>
              <div className="space-y-2">
                {visits.pageBreakdown.map((p) => {
                  const maxC = visits.pageBreakdown[0]?.count || 1;
                  return (
                    <div key={p.page} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-36 truncate">{pageName[p.page] || p.page}</span>
                      <div className="flex-1 h-5 bg-[#0d0d1a] rounded overflow-hidden"><div className="h-full bg-gold/30 rounded transition-all" style={{ width: `${(p.count / maxC) * 100}%` }} /></div>
                      <span className="text-xs font-mono text-gray-300 w-8 text-right">{p.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 유저 목록 */}
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
            <h2 className="text-sm font-bold text-white mb-3">
              등록 유저 <span className="ml-2 text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded">{users.length}명</span>
            </h2>
            {users.length === 0 ? <p className="text-gray-600 text-xs">아직 등록된 유저가 없습니다.</p> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-gray-500 border-b border-gray-800">
                      <th className="text-left py-2 px-2">#</th>
                      <th className="text-left py-2 px-2">User ID</th>
                      <th className="text-center py-2 px-2">파편 계정</th>
                      <th className="text-center py-2 px-2">획득 기록</th>
                      <th className="text-center py-2 px-2">총 소환</th>
                      <th className="text-center py-2 px-2">클보 프리셋</th>
                      <th className="text-right py-2 px-2">가입일</th>
                    </tr></thead>
                    <tbody>{pagedUsers.map((u, i) => (
                      <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                        <td className="py-2 px-2 text-gray-600 font-mono">{userPage * USERS_PER_PAGE + i + 1}</td>
                        <td className="py-2 px-2 font-mono text-gray-400 truncate max-w-[180px]">{u.id.slice(0, 8)}...</td>
                        <td className="py-2 px-2 text-center text-gray-300">{u.shardAccounts}</td>
                        <td className="py-2 px-2 text-center text-emerald-400 font-bold">{u.shardRecords}</td>
                        <td className="py-2 px-2 text-center text-gold font-mono">{u.totalPulls}</td>
                        <td className="py-2 px-2 text-center text-blue-400 font-bold">{u.cbPresets}</td>
                        <td className="py-2 px-2 text-right text-gray-500">{fmt(u.createdAt)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {totalUserPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-4">
                    <button onClick={() => setUserPage((p) => Math.max(0, p - 1))} disabled={userPage === 0}
                      className="px-3 py-1 text-xs rounded bg-[#0d0d1a] border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">이전</button>
                    <span className="text-xs text-gray-500">{userPage + 1} / {totalUserPages}</span>
                    <button onClick={() => setUserPage((p) => Math.min(totalUserPages - 1, p + 1))} disabled={userPage >= totalUserPages - 1}
                      className="px-3 py-1 text-xs rounded bg-[#0d0d1a] border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">다음</button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* DB 관리 */}
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-3">DB 관리</h2>
            <div className="flex items-center justify-between">
              <div className="text-xs text-gray-500">
                page_visits 총 <span className="text-white font-mono font-bold">{totalVisitRows.toLocaleString()}</span>건
              </div>
              <button onClick={handlePurgeVisits}
                className="px-3 py-1.5 text-xs bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors cursor-pointer">
                7일 이전 데이터 삭제
              </button>
            </div>
          </div>
        </>
      )}

      {/* ═══════════ 파편 통계 탭 ═══════════ */}
      {tab === "shards" && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            모든 유저의 모든 계정 합산
            <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">전체 데이터</span>
          </p>

          {/* 총합 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">총 파편 소모</div>
              <div className="text-2xl font-bold font-mono text-gold">{totalShardsUsed.toLocaleString()}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">모든 파편 합산</div>
            </div>
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">총 획득 횟수</div>
              <div className="text-2xl font-bold font-mono text-emerald-400">{totalPullCount}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">전설 + 신화</div>
            </div>
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">전체 체감 확률</div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                {totalPullCount > 0 && totalShardsUsed > 0 ? ((totalPullCount / totalShardsUsed) * 100).toFixed(2) + "%" : "-"}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">획득 / 소모</div>
            </div>
            <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
              <div className="text-[10px] text-gray-500 mb-1">참여 유저</div>
              <div className="text-2xl font-bold font-mono text-blue-400">{users.filter((u) => u.shardRecords > 0).length}명</div>
              <div className="text-[10px] text-gray-600 mt-0.5">기록이 있는 유저</div>
            </div>
          </div>

          {/* 파편별 상세 */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-8">
            {TRACKS.map((track) => {
              const s = shardStats[track.key];
              return (
                <div key={track.key} className={`bg-[#1a1a2e] border border-gray-800 rounded-xl p-3 ${track.bgColor}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Image src={track.image} alt={track.shardName} width={28} height={28} className="drop-shadow" />
                    <div className={`text-xs font-bold ${track.textColor}`}>{track.label}</div>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <div className="flex justify-between"><span className="text-gray-500">총 소환</span><span className="text-white font-mono font-bold">{s?.totalPulls.toLocaleString() || 0}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">획득</span><span className="text-emerald-400 font-mono font-bold">{s?.pullCount || 0}회</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">평균</span><span className="text-gray-300 font-mono">{s?.avg || "-"}개</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">체감</span><span className={`font-mono font-bold ${track.textColor}`}>{s?.rate || "-"}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">현재 pity 합산</span><span className="text-gray-400 font-mono">{s?.currentPity || 0}</span></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 체감 확률 추이 차트 */}
          <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-4">파편별 체감 확률 추이 (전체 유저)</h2>
            <RateTrendChart history={allHistory} height={300} />
          </div>
        </>
      )}
    </div>
  );
}
