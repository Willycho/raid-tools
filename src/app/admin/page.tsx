"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getSupabase } from "@/lib/supabase";

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase());

interface VisitStats {
  total24h: number;
  unique24h: number;
  loggedIn24h: number;
  anonymous24h: number;
  pageBreakdown: { page: string; count: number }[];
}

interface UserInfo {
  id: string;
  email: string;
  name: string;
  avatar: string;
  createdAt: string;
  lastSignIn: string;
  shardAccounts: number;
  shardRecords: number;
  cbPresets: number;
}

interface ShardAggStats {
  totalRecords: number;
  totalPulls: number;
  byType: { type: string; records: number; pulls: number; avgPulls: number }[];
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState<VisitStats | null>(null);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [shardStats, setShardStats] = useState<ShardAggStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const isAdmin = user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());

  const loadData = useCallback(async () => {
    if (!user) return;
    const sb = getSupabase();

    // 1. 방문 통계 (24시간)
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: visitRows } = await sb
      .from("page_visits")
      .select("*")
      .gte("visited_at", since24h);

    if (visitRows) {
      const uniqueVisitors = new Set(visitRows.map((v: { visitor_id: string }) => v.visitor_id));
      const loggedInVisitors = new Set(
        visitRows.filter((v: { user_id: string | null }) => v.user_id).map((v: { visitor_id: string }) => v.visitor_id)
      );
      const pageMap = new Map<string, number>();
      for (const v of visitRows) {
        pageMap.set(v.page, (pageMap.get(v.page) || 0) + 1);
      }
      const pageBreakdown = Array.from(pageMap.entries())
        .map(([page, count]) => ({ page, count }))
        .sort((a, b) => b.count - a.count);

      setVisits({
        total24h: visitRows.length,
        unique24h: uniqueVisitors.size,
        loggedIn24h: loggedInVisitors.size,
        anonymous24h: uniqueVisitors.size - loggedInVisitors.size,
        pageBreakdown,
      });
    }

    // 2. 유저 목록 — shard_accounts에서 user_id 추출
    const { data: shardAccounts } = await sb.from("shard_accounts").select("*");
    const { data: shardHistory } = await sb.from("shard_history").select("account_id");
    const { data: cbPresets } = await sb.from("clan_boss_presets").select("user_id");

    // user_id별 집계
    const userMap = new Map<string, UserInfo>();
    if (shardAccounts) {
      for (const acc of shardAccounts) {
        if (!userMap.has(acc.user_id)) {
          userMap.set(acc.user_id, {
            id: acc.user_id,
            email: "",
            name: "",
            avatar: "",
            createdAt: acc.created_at,
            lastSignIn: "",
            shardAccounts: 0,
            shardRecords: 0,
            cbPresets: 0,
          });
        }
        const u = userMap.get(acc.user_id)!;
        u.shardAccounts += 1;

        // 이 계정의 히스토리 수
        if (shardHistory) {
          u.shardRecords += shardHistory.filter((h: { account_id: string }) => h.account_id === acc.id).length;
        }
      }
    }
    if (cbPresets) {
      for (const p of cbPresets) {
        if (userMap.has(p.user_id)) {
          userMap.get(p.user_id)!.cbPresets += 1;
        } else {
          userMap.set(p.user_id, {
            id: p.user_id,
            email: "",
            name: "",
            avatar: "",
            createdAt: "",
            lastSignIn: "",
            shardAccounts: 0,
            shardRecords: 0,
            cbPresets: 1,
          });
        }
      }
    }
    setUsers(Array.from(userMap.values()));

    // 3. 파편 집계 통계
    if (shardHistory) {
      const { data: allHistory } = await sb.from("shard_history").select("*");
      if (allHistory) {
        const typeMap = new Map<string, { records: number; pulls: number }>();
        for (const h of allHistory) {
          const key = `${h.shard_type}_${h.rarity}`;
          if (!typeMap.has(key)) typeMap.set(key, { records: 0, pulls: 0 });
          const t = typeMap.get(key)!;
          t.records += 1;
          t.pulls += h.count || 0;
        }
        const byType = Array.from(typeMap.entries()).map(([type, d]) => ({
          type,
          records: d.records,
          pulls: d.pulls,
          avgPulls: d.records > 0 ? Math.round(d.pulls / d.records) : 0,
        }));
        setShardStats({
          totalRecords: allHistory.length,
          totalPulls: allHistory.reduce((s: number, h: { count: number }) => s + (h.count || 0), 0),
          byType,
        });
      }
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

  const SHARD_LABELS: Record<string, string> = {
    ancient_legendary: "고대 전설",
    void_legendary: "보이드 전설",
    sacred_legendary: "신성 전설",
    primal_legendary: "태고 전설",
    primal_mythical: "태고 신화",
  };

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

      {/* 방문 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">24시간 페이지뷰</div>
          <div className="text-2xl font-bold font-mono text-gold">{visits?.total24h ?? 0}</div>
        </div>
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">24시간 유니크 방문자</div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{visits?.unique24h ?? 0}</div>
        </div>
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">로그인 유저</div>
          <div className="text-2xl font-bold font-mono text-blue-400">{visits?.loggedIn24h ?? 0}</div>
        </div>
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4">
          <div className="text-[10px] text-gray-500 mb-1">비로그인 방문자</div>
          <div className="text-2xl font-bold font-mono text-gray-400">{visits?.anonymous24h ?? 0}</div>
        </div>
      </div>

      {/* 페이지별 방문 */}
      {visits && visits.pageBreakdown.length > 0 && (
        <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
          <h2 className="text-sm font-bold text-white mb-3">페이지별 방문 (24시간)</h2>
          <div className="space-y-2">
            {visits.pageBreakdown.map((p) => {
              const pct = visits.total24h > 0 ? (p.count / visits.total24h) * 100 : 0;
              return (
                <div key={p.page} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-32 truncate font-mono">{p.page}</span>
                  <div className="flex-1 h-5 bg-[#0d0d1a] rounded overflow-hidden">
                    <div
                      className="h-full bg-gold/30 rounded transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-300 w-12 text-right">{p.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 유저 목록 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
        <h2 className="text-sm font-bold text-white mb-3">
          등록 유저
          <span className="ml-2 text-[10px] bg-gold/20 text-gold px-1.5 py-0.5 rounded">{users.length}명</span>
        </h2>
        {users.length === 0 ? (
          <p className="text-gray-600 text-xs">아직 등록된 유저가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 px-2">User ID</th>
                  <th className="text-center py-2 px-2">파편 계정</th>
                  <th className="text-center py-2 px-2">파편 기록</th>
                  <th className="text-center py-2 px-2">클보 프리셋</th>
                  <th className="text-right py-2 px-2">가입일</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                    <td className="py-2 px-2 font-mono text-gray-400 truncate max-w-[200px]">{u.id.slice(0, 8)}...</td>
                    <td className="py-2 px-2 text-center text-gray-300">{u.shardAccounts}</td>
                    <td className="py-2 px-2 text-center text-emerald-400 font-bold">{u.shardRecords}</td>
                    <td className="py-2 px-2 text-center text-blue-400 font-bold">{u.cbPresets}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{fmt(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 파편 통계 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-8">
        <h2 className="text-sm font-bold text-white mb-3">전체 파편 통계 (모든 유저 합산)</h2>
        {!shardStats ? (
          <p className="text-gray-600 text-xs">데이터가 없습니다.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-[#0d0d1a] rounded-lg p-3">
                <div className="text-[10px] text-gray-500">총 획득 기록</div>
                <div className="text-xl font-bold font-mono text-gold">{shardStats.totalRecords}회</div>
              </div>
              <div className="bg-[#0d0d1a] rounded-lg p-3">
                <div className="text-[10px] text-gray-500">총 파편 소모</div>
                <div className="text-xl font-bold font-mono text-emerald-400">{shardStats.totalPulls}개</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left py-2 px-2">파편</th>
                    <th className="text-center py-2 px-2">획득 수</th>
                    <th className="text-center py-2 px-2">총 소환</th>
                    <th className="text-center py-2 px-2">평균 소환</th>
                    <th className="text-right py-2 px-2">체감 확률</th>
                  </tr>
                </thead>
                <tbody>
                  {shardStats.byType.map((t) => (
                    <tr key={t.type} className="border-b border-gray-800/50">
                      <td className="py-2 px-2 text-gray-300">{SHARD_LABELS[t.type] || t.type}</td>
                      <td className="py-2 px-2 text-center text-emerald-400 font-bold">{t.records}</td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono">{t.pulls}</td>
                      <td className="py-2 px-2 text-center text-gray-300 font-mono">{t.avgPulls}</td>
                      <td className="py-2 px-2 text-right text-gold font-mono font-bold">
                        {t.pulls > 0 ? ((t.records / t.pulls) * 100).toFixed(2) + "%" : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
