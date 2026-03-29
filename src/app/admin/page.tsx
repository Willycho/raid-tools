"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getSupabase } from "@/lib/supabase";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());

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

interface ShardTypeStats {
  type: string;
  label: string;
  records: number;
  totalPulls: number;
  avgPulls: number;
  rate: string;
}

interface ShardAggStats {
  totalRecords: number;
  totalPulls: number;
  totalUsers: number;
  byType: ShardTypeStats[];
}

const SHARD_LABELS: Record<string, string> = {
  ancient_legendary: "🔵 고대 → 전설",
  void_legendary: "🟣 보이드 → 전설",
  sacred_legendary: "🟡 신성 → 전설",
  primal_legendary: "🔴 태고 → 전설",
  primal_mythical: "🟠 태고 → 신화",
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<VisitStats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [shardStats, setShardStats] = useState<ShardAggStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [userPage, setUserPage] = useState(0);
  const USERS_PER_PAGE = 10;

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  const loadData = useCallback(async () => {
    if (!user) return;
    const sb = getSupabase();

    // ── 1. 방문 통계 (오늘 00:00:00 ~ 23:59:59) ──
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

    const { data: visitRows } = await sb
      .from("page_visits")
      .select("*")
      .gte("visited_at", todayStart)
      .lte("visited_at", todayEnd);

    if (visitRows) {
      // /admin 제외
      const filtered = visitRows.filter((v: { page: string }) => !v.page.startsWith("/admin"));

      // 유니크 방문자 (visitor_id 기준, 하루 여러 번 와도 1)
      const allVisitorIds = new Set(filtered.map((v: { visitor_id: string }) => v.visitor_id));

      // 로그인 유저 (user_id 기준, 하루에 여러 번 와도 1)
      const loggedInUserIds = new Set(
        filtered.filter((v: { user_id: string | null }) => v.user_id).map((v: { user_id: string }) => v.user_id)
      );

      // 비로그인 방문자 (user_id가 없는 visitor_id 중 유니크)
      const anonymousVisitorIds = new Set(
        filtered.filter((v: { user_id: string | null }) => !v.user_id).map((v: { visitor_id: string }) => v.visitor_id)
      );

      // 페이지별 유니크 방문 수 (visitor_id 기준)
      const pageVisitorMap = new Map<string, Set<string>>();
      for (const v of filtered) {
        if (!pageVisitorMap.has(v.page)) pageVisitorMap.set(v.page, new Set());
        pageVisitorMap.get(v.page)!.add(v.visitor_id);
      }
      const pageBreakdown = Array.from(pageVisitorMap.entries())
        .map(([page, visitors]) => ({ page, count: visitors.size }))
        .sort((a, b) => b.count - a.count);

      setVisits({
        totalPageViews: filtered.length,
        uniqueVisitors: allVisitorIds.size,
        loggedInUsers: loggedInUserIds.size,
        anonymousVisitors: anonymousVisitorIds.size,
        pageBreakdown,
      });
    }

    // ── 2. 유저 목록 (데이터 기반) ──
    const { data: shardAccounts } = await sb.from("shard_accounts").select("*");
    const { data: shardHistory } = await sb.from("shard_history").select("account_id, count");
    const { data: cbPresets } = await sb.from("clan_boss_presets").select("user_id");

    const userMap = new Map<string, UserInfo>();

    if (shardAccounts) {
      // account_id → user_id 매핑
      const accountToUser = new Map<string, string>();
      for (const acc of shardAccounts) {
        accountToUser.set(acc.id, acc.user_id);
        if (!userMap.has(acc.user_id)) {
          userMap.set(acc.user_id, {
            id: acc.user_id,
            shardAccounts: 0,
            shardRecords: 0,
            totalPulls: 0,
            cbPresets: 0,
            createdAt: acc.created_at,
          });
        }
        userMap.get(acc.user_id)!.shardAccounts += 1;
      }

      // 히스토리 집계
      if (shardHistory) {
        for (const h of shardHistory) {
          const userId = accountToUser.get(h.account_id);
          if (userId && userMap.has(userId)) {
            const u = userMap.get(userId)!;
            u.shardRecords += 1;
            u.totalPulls += h.count || 0;
          }
        }
      }
    }

    if (cbPresets) {
      for (const p of cbPresets) {
        if (!userMap.has(p.user_id)) {
          userMap.set(p.user_id, {
            id: p.user_id,
            shardAccounts: 0,
            shardRecords: 0,
            totalPulls: 0,
            cbPresets: 0,
            createdAt: "",
          });
        }
        userMap.get(p.user_id)!.cbPresets += 1;
      }
    }

    const userList = Array.from(userMap.values()).sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    setUsers(userList);

    // ── 3. 전체 파편 통계 ──
    const { data: allHistory } = await sb.from("shard_history").select("shard_type, rarity, count, is_mercy, account_id");
    if (allHistory && allHistory.length > 0) {
      const typeMap = new Map<string, { records: number; pulls: number }>();
      const userIds = new Set<string>();

      for (const h of allHistory) {
        const key = `${h.shard_type}_${h.rarity}`;
        if (!typeMap.has(key)) typeMap.set(key, { records: 0, pulls: 0 });
        const t = typeMap.get(key)!;
        t.records += 1;
        t.pulls += h.count || 0;

        // 유니크 유저 수 (account → user 매핑)
        if (shardAccounts) {
          const acc = shardAccounts.find((a: { id: string }) => a.id === h.account_id);
          if (acc) userIds.add(acc.user_id);
        }
      }

      const byType: ShardTypeStats[] = Array.from(typeMap.entries()).map(([type, d]) => ({
        type,
        label: SHARD_LABELS[type] || type,
        records: d.records,
        totalPulls: d.pulls,
        avgPulls: d.records > 0 ? Math.round(d.pulls / d.records) : 0,
        rate: d.pulls > 0 ? ((d.records / d.pulls) * 100).toFixed(2) + "%" : "-",
      }));

      // 정렬: 고대 → 보이드 → 신성 → 태고전설 → 태고신화
      const order = ["ancient_legendary", "void_legendary", "sacred_legendary", "primal_legendary", "primal_mythical"];
      byType.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

      setShardStats({
        totalRecords: allHistory.length,
        totalPulls: allHistory.reduce((s: number, h: { count: number }) => s + (h.count || 0), 0),
        totalUsers: userIds.size,
        byType,
      });
    }

    setLastRefresh(new Date());
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!authLoading && isAdmin) {
      loadData();
    } else if (!authLoading) {
      setLoading(false);
    }
  }, [authLoading, isAdmin, loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // 권한 체크
  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-[#1a1a2e] border border-red-500/30 rounded-2xl p-8 max-w-sm w-full mx-4 text-center">
          <svg className="w-12 h-12 mx-auto text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          <h2 className="text-white text-lg font-bold mb-2">접근 권한 없음</h2>
          <p className="text-gray-500 text-sm">관리자만 접근할 수 있습니다.</p>
        </div>
      </div>
    );
  }

  const fmt = (d: string) => {
    if (!d) return "-";
    const date = new Date(d);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  };

  // 유저 페이지네이션
  const totalUserPages = Math.ceil(users.length / USERS_PER_PAGE);
  const pagedUsers = users.slice(userPage * USERS_PER_PAGE, (userPage + 1) * USERS_PER_PAGE);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            관리자 전용
            {lastRefresh && (
              <span className="ml-2 text-[10px] text-gray-600">
                마지막 갱신: {fmt(lastRefresh.toISOString())}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gold text-background rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors cursor-pointer disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {refreshing ? "갱신 중..." : "새로고침"}
        </button>
      </div>

      {/* ── 오늘의 방문 통계 ── */}
      <h2 className="text-xs text-gray-500 mb-2 uppercase tracking-wider">오늘의 방문 (00:00 ~ 23:59)</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">페이지뷰</div>
          <div className="text-2xl font-bold font-mono text-gold">{visits?.totalPageViews ?? 0}</div>
          <div className="text-[9px] text-gray-600 mt-0.5">중복 포함 총 조회수</div>
        </div>
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">유니크 방문자</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{visits?.uniqueVisitors ?? 0}</div>
          <div className="text-[9px] text-gray-600 mt-0.5">디바이스 ID 기준</div>
        </div>
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">로그인 유저</div>
          <div className="text-2xl font-bold font-mono text-blue-400">{visits?.loggedInUsers ?? 0}</div>
          <div className="text-[9px] text-gray-600 mt-0.5">계정 기준 유니크</div>
        </div>
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">비로그인 방문자</div>
          <div className="text-2xl font-bold font-mono text-gray-400">{visits?.anonymousVisitors ?? 0}</div>
          <div className="text-[9px] text-gray-600 mt-0.5">디바이스 ID 기준 유니크</div>
        </div>
      </div>

      {/* ── 페이지별 방문 ── */}
      {visits && visits.pageBreakdown.length > 0 && (
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
          <h2 className="text-sm font-bold text-white mb-3">페이지별 유니크 방문자 (오늘)</h2>
          <div className="space-y-2">
            {visits.pageBreakdown.map((p) => {
              const maxCount = visits.pageBreakdown[0]?.count || 1;
              const pct = (p.count / maxCount) * 100;
              const pageName: Record<string, string> = {
                "/": "메인",
                "/clan-boss": "클랜보스 계산기",
                "/shard": "파편 확률 계산기",
                "/search": "버프/디버프 검색",
                "/dashboard": "대시보드",
              };
              return (
                <div key={p.page} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-36 truncate">{pageName[p.page] || p.page}</span>
                  <div className="flex-1 h-5 bg-[#0d0d1a] rounded overflow-hidden">
                    <div
                      className="h-full bg-gold/30 rounded transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-8 text-right">{p.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 등록 유저 ── */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
        <h2 className="text-sm font-bold text-white mb-3">
          등록 유저
          <span className="ml-2 text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded">{users.length}명</span>
        </h2>
        {users.length === 0 ? (
          <p className="text-gray-600 text-xs">아직 등록된 유저가 없습니다.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 px-2">#</th>
                    <th className="text-left py-2 px-2">User ID</th>
                    <th className="text-center py-2 px-2">파편 계정</th>
                    <th className="text-center py-2 px-2">획득 기록</th>
                    <th className="text-center py-2 px-2">총 소환</th>
                    <th className="text-center py-2 px-2">클보 프리셋</th>
                    <th className="text-right py-2 px-2">가입일</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedUsers.map((u, i) => (
                    <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                      <td className="py-2 px-2 text-gray-600 font-mono">{userPage * USERS_PER_PAGE + i + 1}</td>
                      <td className="py-2 px-2 font-mono text-gray-400 truncate max-w-[180px]">{u.id.slice(0, 8)}...</td>
                      <td className="py-2 px-2 text-center text-gray-300">{u.shardAccounts}</td>
                      <td className="py-2 px-2 text-center text-emerald-400 font-bold">{u.shardRecords}</td>
                      <td className="py-2 px-2 text-center text-gold font-mono">{u.totalPulls}</td>
                      <td className="py-2 px-2 text-center text-blue-400 font-bold">{u.cbPresets}</td>
                      <td className="py-2 px-2 text-right text-gray-500">{fmt(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* 페이지네이션 */}
            {totalUserPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => setUserPage((p) => Math.max(0, p - 1))}
                  disabled={userPage === 0}
                  className="px-3 py-1 text-xs rounded bg-[#0d0d1a] border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  이전
                </button>
                <span className="text-xs text-gray-500">
                  {userPage + 1} / {totalUserPages}
                </span>
                <button
                  onClick={() => setUserPage((p) => Math.min(totalUserPages - 1, p + 1))}
                  disabled={userPage >= totalUserPages - 1}
                  className="px-3 py-1 text-xs rounded bg-[#0d0d1a] border border-gray-700 text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── 전체 파편 통계 ── */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
        <h2 className="text-sm font-bold text-white mb-3">전체 파편 통계 (모든 유저 합산)</h2>
        {!shardStats ? (
          <p className="text-gray-600 text-xs">데이터가 없습니다.</p>
        ) : (
          <>
            {/* 총합 카드 */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-[#0d0d1a] rounded-lg p-3">
                <div className="text-[10px] text-gray-500">참여 유저</div>
                <div className="text-xl font-bold font-mono text-blue-400">{shardStats.totalUsers}명</div>
              </div>
              <div className="bg-[#0d0d1a] rounded-lg p-3">
                <div className="text-[10px] text-gray-500">총 파편 소모</div>
                <div className="text-xl font-bold font-mono text-gold">{shardStats.totalPulls.toLocaleString()}개</div>
              </div>
              <div className="bg-[#0d0d1a] rounded-lg p-3">
                <div className="text-[10px] text-gray-500">총 획득</div>
                <div className="text-xl font-bold font-mono text-emerald-400">{shardStats.totalRecords}회</div>
              </div>
            </div>

            {/* 파편별 상세 */}
            <div className="space-y-3">
              {shardStats.byType.map((t) => (
                <div key={t.type} className="bg-[#0d0d1a] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-white">{t.label}</span>
                    <span className="text-sm font-mono font-bold text-gold">{t.rate}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-[11px]">
                    <div>
                      <span className="text-gray-500">소모한 파편</span>
                      <div className="text-white font-mono font-bold mt-0.5">{t.totalPulls.toLocaleString()}개</div>
                    </div>
                    <div>
                      <span className="text-gray-500">획득 횟수</span>
                      <div className="text-emerald-400 font-mono font-bold mt-0.5">{t.records}회</div>
                    </div>
                    <div>
                      <span className="text-gray-500">평균 소환</span>
                      <div className="text-gray-300 font-mono font-bold mt-0.5">{t.avgPulls}개</div>
                    </div>
                  </div>
                  {/* 체감 확률 바 */}
                  <div className="mt-2 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gold/60 rounded-full transition-all"
                      style={{ width: `${Math.min(100, t.totalPulls > 0 ? (t.records / t.totalPulls) * 100 * 10 : 0)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
