"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/AuthContext";
import { getSupabase } from "@/lib/supabase";

// ── 타입 & 상수 ─────────────────────────────────────
type ShardType = "ancient" | "void" | "sacred" | "primal";

interface MercyTrack {
  rarity: string;
  color: string;
  borderColor: string;
  baseRate: number;
  base2xRate: number;
  mercyStart: number;
  mercyPerPull: number;
}

interface ShardDef {
  name: string;
  image: string;
  borderColor: string;
  bgGlow: string;
  mercyTracks: MercyTrack[];
}

interface PullRecord {
  trackKey: string;
  pulledAt: number;
  timestamp: number;
  wasCeiling: boolean;
  championName?: string;
  /** DB row id (only present for logged-in users) */
  dbId?: string;
}

const SHARDS: Record<ShardType, ShardDef> = {
  ancient: {
    name: "고대",
    image: "/shards/ancient.png",
    borderColor: "border-blue-500/60",
    bgGlow: "shadow-blue-500/20",
    mercyTracks: [
      {
        rarity: "전설",
        color: "text-yellow-400",
        borderColor: "border-yellow-500/50",
        baseRate: 0.5,
        base2xRate: 1,
        mercyStart: 200,
        mercyPerPull: 5,
      },
    ],
  },
  void: {
    name: "보이드",
    image: "/shards/void.png",
    borderColor: "border-purple-500/60",
    bgGlow: "shadow-purple-500/20",
    mercyTracks: [
      {
        rarity: "전설",
        color: "text-yellow-400",
        borderColor: "border-yellow-500/50",
        baseRate: 0.5,
        base2xRate: 1,
        mercyStart: 200,
        mercyPerPull: 5,
      },
    ],
  },
  sacred: {
    name: "신성",
    image: "/shards/sacred.png",
    borderColor: "border-yellow-500/60",
    bgGlow: "shadow-yellow-500/20",
    mercyTracks: [
      {
        rarity: "전설",
        color: "text-yellow-400",
        borderColor: "border-yellow-500/50",
        baseRate: 6,
        base2xRate: 12,
        mercyStart: 12,
        mercyPerPull: 2,
      },
    ],
  },
  primal: {
    name: "태고",
    image: "/shards/primal.png",
    borderColor: "border-red-500/60",
    bgGlow: "shadow-red-500/20",
    mercyTracks: [
      {
        rarity: "전설",
        color: "text-yellow-400",
        borderColor: "border-yellow-500/50",
        baseRate: 0.5,
        base2xRate: 1,
        mercyStart: 75,
        mercyPerPull: 1,
      },
      {
        rarity: "신화",
        color: "text-red-400",
        borderColor: "border-red-500/50",
        baseRate: 0.5,
        base2xRate: 1,
        mercyStart: 200,
        mercyPerPull: 10,
      },
    ],
  },
};

// ── 확률 계산 ───────────────────────────────────────
function currentRate(track: MercyTrack, pity: number, is2x: boolean): number {
  const base = is2x ? track.base2xRate : track.baseRate;
  if (pity <= track.mercyStart) return base;
  const bonus = (pity - track.mercyStart) * track.mercyPerPull;
  return Math.min(100, base + bonus);
}

function getCeiling(track: MercyTrack, is2x: boolean): number {
  const base = is2x ? track.base2xRate : track.baseRate;
  return track.mercyStart + Math.ceil((100 - base) / track.mercyPerPull);
}

function pullsToCeiling(track: MercyTrack, pity: number, is2x: boolean): number {
  return Math.max(0, getCeiling(track, is2x) - pity);
}

/** 평균 획득 확률 계산: 각 기록의 pulledAt을 기준으로 1/pulledAt 의 평균 */
function avgPullRate(records: PullRecord[], track: MercyTrack): string | null {
  if (records.length === 0) return null;
  // 실제 확률 = 1 / 평균소환수 × 100
  const avg = records.reduce((s, r) => s + r.pulledAt, 0) / records.length;
  const pct = (1 / avg) * 100;
  if (pct >= 100) return "100%";
  if (pct < 0.01) return "<0.01%";
  return pct.toFixed(2) + "%";
}

// ── trackKey ↔ DB 매핑 헬퍼 ─────────────────────────
function trackKeyToShardType(trackKey: string): string {
  return trackKey.split("_")[0];
}

function trackKeyToRarity(trackKey: string): string {
  const idx = parseInt(trackKey.split("_")[1]);
  return idx === 0 ? "legendary" : "mythical";
}

function rarityToTrackIndex(rarity: string): number {
  return rarity === "legendary" ? 0 : 1;
}

function toTrackKey(shardType: string, rarity: string): string {
  return `${shardType}_${rarityToTrackIndex(rarity)}`;
}

/** pity column: _0 → legendary, _1 → epic (used for mythical track) */
function trackKeyToPityColumn(trackKey: string): "legendary" | "epic" {
  const idx = parseInt(trackKey.split("_")[1]);
  return idx === 0 ? "legendary" : "epic";
}

// ── Supabase CRUD 헬퍼 ──────────────────────────────
async function dbLoadAccounts(userId: string): Promise<ShardAccount[]> {
  const { data, error } = await getSupabase()
    .from("shard_accounts")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  if (error) { console.error("dbLoadAccounts error:", error); return []; }
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

async function dbCreateAccount(userId: string, name: string): Promise<ShardAccount | null> {
  const { data, error } = await getSupabase()
    .from("shard_accounts")
    .insert({ user_id: userId, name })
    .select("id, name, created_at")
    .single();
  if (error) { console.error("dbCreateAccount error:", error); return null; }
  return { id: data.id, name: data.name, createdAt: new Date(data.created_at).getTime() };
}

async function dbDeleteAccount(accountId: string): Promise<void> {
  const { error } = await getSupabase().from("shard_accounts").delete().eq("id", accountId);
  if (error) console.error("dbDeleteAccount error:", error);
}

async function dbLoadPity(accountId: string): Promise<Record<string, number>> {
  const { data, error } = await getSupabase()
    .from("shard_pity")
    .select("shard_type, legendary, epic")
    .eq("account_id", accountId);
  if (error) { console.error("dbLoadPity error:", error); return {}; }
  const result: Record<string, number> = {};
  for (const row of data || []) {
    if (row.legendary > 0) result[`${row.shard_type}_0`] = row.legendary;
    if (row.epic > 0) result[`${row.shard_type}_1`] = row.epic;
  }
  return result;
}

async function dbSavePity(accountId: string, trackKey: string, value: number): Promise<void> {
  const shardType = trackKeyToShardType(trackKey);
  const col = trackKeyToPityColumn(trackKey);

  const { error } = await getSupabase()
    .from("shard_pity")
    .upsert(
      { account_id: accountId, shard_type: shardType, [col]: value },
      { onConflict: "account_id,shard_type" }
    );
  if (error) console.error("dbSavePity error:", error);
}

async function dbLoadHistory(accountId: string): Promise<PullRecord[]> {
  const { data, error } = await getSupabase()
    .from("shard_history")
    .select("id, shard_type, rarity, count, is_mercy, pulled_at")
    .eq("account_id", accountId)
    .order("pulled_at", { ascending: true });
  if (error) { console.error("dbLoadHistory error:", error); return []; }
  return (data || []).map((row) => ({
    trackKey: toTrackKey(row.shard_type, row.rarity),
    pulledAt: row.count,
    timestamp: new Date(row.pulled_at).getTime(),
    wasCeiling: row.is_mercy,
    dbId: row.id,
  }));
}

async function dbAddHistory(accountId: string, record: PullRecord): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from("shard_history")
    .insert({
      account_id: accountId,
      shard_type: trackKeyToShardType(record.trackKey),
      rarity: trackKeyToRarity(record.trackKey),
      count: record.pulledAt,
      is_mercy: record.wasCeiling,
      pulled_at: new Date(record.timestamp).toISOString(),
    })
    .select("id")
    .single();
  if (error) { console.error("dbAddHistory error:", error); return null; }
  return data?.id ?? null;
}

async function dbDeleteHistory(dbId: string): Promise<void> {
  const { error } = await getSupabase().from("shard_history").delete().eq("id", dbId);
  if (error) console.error("dbDeleteHistory error:", error);
}

// ── 계정 시스템 ────────────────────────────────────
interface ShardAccount {
  id: string;
  name: string;
  createdAt: number;
}

const STORAGE_KEY_ACCOUNTS = "rsl_shard_accounts";
const STORAGE_KEY_ACTIVE_ACCOUNT = "rsl_shard_active_account";

function loadAccounts(): ShardAccount[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_ACCOUNTS) || "[]"); }
  catch { return []; }
}
function saveAccounts(accounts: ShardAccount[]) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_ACCOUNTS, JSON.stringify(accounts));
}
function loadActiveAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY_ACTIVE_ACCOUNT);
}
function saveActiveAccountId(id: string) {
  if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_ACTIVE_ACCOUNT, id);
}

// ── localStorage (계정별) ────────────────────────────
function pityKey(accountId: string) { return `rsl_shard_pity_${accountId}`; }
function historyKey(accountId: string) { return `rsl_shard_history_${accountId}`; }

function loadPity(accountId: string): Record<string, number> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(pityKey(accountId)) || "{}"); }
  catch { return {}; }
}
function savePity(accountId: string, state: Record<string, number>) {
  if (typeof window !== "undefined") localStorage.setItem(pityKey(accountId), JSON.stringify(state));
}
function loadHistory(accountId: string): PullRecord[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(historyKey(accountId)) || "[]"); }
  catch { return []; }
}
function saveHistory(accountId: string, records: PullRecord[]) {
  if (typeof window !== "undefined") localStorage.setItem(historyKey(accountId), JSON.stringify(records));
}

// 기존 데이터 마이그레이션 (계정 시스템 이전 데이터)
function migrateOldData(accountId: string) {
  if (typeof window === "undefined") return;
  const oldPity = localStorage.getItem("rsl_shard_pity");
  const oldHistory = localStorage.getItem("rsl_shard_history");
  if (oldPity || oldHistory) {
    if (oldPity) {
      localStorage.setItem(pityKey(accountId), oldPity);
      localStorage.removeItem("rsl_shard_pity");
    }
    if (oldHistory) {
      localStorage.setItem(historyKey(accountId), oldHistory);
      localStorage.removeItem("rsl_shard_history");
    }
  }
}

// ── 날짜 포맷 ───────────────────────────────────────
function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 원형 프로그레스 ──────────────────────────────────
function CircleProgress({ value, max, size = 80, stroke = 6, children }: {
  value: number; max: number; size?: number; stroke?: number; children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, max > 0 ? value / max : 0);
  const offset = circumference * (1 - pct);

  let strokeColor = "#4B5563";
  if (pct >= 1) strokeColor = "#10B981";
  else if (pct >= 0.8) strokeColor = "#F59E0B";
  else if (pct >= 0.5) strokeColor = "#3B82F6";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1f2937" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={strokeColor} strokeWidth={stroke}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-300" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

// ── 획득 기록 모달 ──────────────────────────────────
function HistoryModal({
  trackKey,
  track,
  shard,
  records,
  onClose,
  onDelete,
  onUpdateName,
}: {
  trackKey: string;
  track: MercyTrack;
  shard: ShardDef;
  records: PullRecord[];
  onClose: () => void;
  onDelete: (timestamp: number) => void;
  onUpdateName: (timestamp: number, name: string) => void;
}) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const trackRecords = records.filter((r) => r.trackKey === trackKey);

  const avg = trackRecords.length > 0
    ? Math.round(trackRecords.reduce((s, r) => s + r.pulledAt, 0) / trackRecords.length)
    : null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className={`bg-[#12122a] border ${track.borderColor} rounded-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col shadow-2xl`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <Image src={shard.image} alt={shard.name} width={32} height={32} className="drop-shadow" />
            <div>
              <h3 className={`font-bold ${track.color}`}>{shard.name} - {track.rarity} 획득 기록</h3>
              <div className="text-[11px] text-gray-500">
                총 {trackRecords.length}회
                {avg !== null && <span className="ml-2">평균 {avg}개</span>}
                {avgPullRate(trackRecords, track) !== null && (
                  <span className="ml-2">체감 확률 <span className={track.color}>{avgPullRate(trackRecords, track)}</span></span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl cursor-pointer p-1">✕</button>
        </div>

        {/* 기록 목록 */}
        <div className="flex-1 overflow-y-auto p-4">
          {trackRecords.length === 0 ? (
            <div className="text-center text-gray-600 py-8">아직 획득 기록이 없습니다</div>
          ) : (
            <div className="space-y-2">
              {trackRecords.slice().reverse().map((r, i) => (
                <div key={r.timestamp} className="bg-[#1a1a2e] border border-gray-800 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold font-mono ${track.color}`}>
                        #{trackRecords.length - i}
                      </span>
                      <span className="text-xs text-gray-400">
                        {r.pulledAt}번째 소환
                      </span>
                      {r.wasCeiling && (
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">천장</span>
                      )}
                    </div>
                    <button
                      onClick={() => onDelete(r.timestamp)}
                      className="text-gray-600 hover:text-red-400 text-xs cursor-pointer"
                    >
                      삭제
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <input
                      type="text"
                      placeholder="획득한 챔피언 이름 입력..."
                      defaultValue={r.championName || ""}
                      onBlur={(e) => onUpdateName(r.timestamp, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none border-b border-gray-700 focus:border-gray-500 py-0.5 mr-3 transition-colors"
                    />
                    <span className="text-[10px] text-gray-600 whitespace-nowrap">{formatDate(r.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 파편 트랙 카드 ──────────────────────────────────
function TrackCard({
  shardType,
  track,
  trackKey,
  pity,
  setPity,
  is2x,
  onPull,
  history,
  onOpenHistory,
}: {
  shardType: ShardType;
  track: MercyTrack;
  trackKey: string;
  pity: number;
  setPity: (key: string, val: number) => void;
  is2x: boolean;
  onPull: (trackKey: string, pulledAt: number, wasCeiling: boolean) => void;
  history: PullRecord[];
  onOpenHistory: (trackKey: string) => void;
}) {
  const shard = SHARDS[shardType];
  const rate = currentRate(track, pity, is2x);
  const remaining = pullsToCeiling(track, pity, is2x);
  const ceiling = getCeiling(track, is2x);
  const base = is2x ? track.base2xRate : track.baseRate;
  const isMercyActive = pity > track.mercyStart;
  const isBoosted = rate > base;
  const isCeiling = pity >= ceiling;

  // 천장 도달 시 자동 리셋
  useEffect(() => {
    if (isCeiling && pity > 0) {
      onPull(trackKey, pity, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCeiling]);

  const adjust = (delta: number) => setPity(trackKey, Math.max(0, pity + delta));

  const handlePull = () => {
    if (pity <= 0) return;
    onPull(trackKey, pity, false);
  };

  const trackHistory = history.filter((r) => r.trackKey === trackKey);
  const totalPulls = trackHistory.reduce((s, r) => s + r.pulledAt, 0) + pity;
  const avg = trackHistory.length > 0
    ? Math.round(trackHistory.reduce((s, r) => s + r.pulledAt, 0) / trackHistory.length)
    : null;
  const pullRate = avgPullRate(trackHistory, track);

  return (
    <div className={`bg-[#1a1a2e] border ${track.borderColor} rounded-xl p-4 shadow-lg ${shard.bgGlow} flex flex-col`}>
      {/* 상단: 이미지 + 원형 진행률 */}
      <div className="flex items-center gap-3 mb-3">
        <Image src={shard.image} alt={shard.name} width={56} height={56} className="drop-shadow-lg flex-shrink-0" />
        <CircleProgress value={pity} max={ceiling} size={72} stroke={5}>
          <span className="text-white font-bold font-mono text-lg">{pity}</span>
        </CircleProgress>
      </div>

      {/* 버튼 행 */}
      <div className="flex items-center gap-1.5 mb-2">
        <button onClick={() => adjust(-1)}
          className="flex-1 h-8 rounded-lg bg-[#0d0d1a] border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer font-mono text-base">
          -
        </button>
        <button onClick={() => adjust(1)}
          className="flex-1 h-8 rounded-lg bg-[#0d0d1a] border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer font-mono text-base">
          +
        </button>
        <button onClick={() => adjust(10)}
          className="flex-1 h-8 rounded-lg bg-[#0d0d1a] border border-gray-700 text-amber-600 hover:text-amber-400 hover:border-amber-700 transition-colors cursor-pointer font-mono text-xs font-bold">
          +10
        </button>
      </div>

      {/* 획득 버튼 */}
      <button
        onClick={handlePull}
        disabled={pity <= 0}
        className={`w-full h-9 rounded-lg font-bold text-sm mb-3 transition-all cursor-pointer border
          ${pity > 0
            ? `${track.borderColor} ${track.color} bg-[#0d0d1a] hover:bg-[#1a1a3a] shadow-md`
            : "border-gray-800 text-gray-600 bg-[#0d0d1a] cursor-not-allowed"}`}
      >
        {track.rarity} 획득! ({pity}번째)
      </button>

      {/* 진행 바 */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-[#0d0d1a] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isMercyActive ? "bg-emerald-500" : "bg-gray-600"}`}
            style={{ width: `${Math.min(100, (pity / ceiling) * 100)}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 font-mono whitespace-nowrap">{pity} / {ceiling}</span>
      </div>

      {/* 확률 */}
      <div className={`text-center text-sm font-bold ${track.color}`}>
        {track.rarity} chance: {rate.toFixed(1)}%
        {isBoosted && <span className="text-emerald-400 text-[10px] ml-1">▲</span>}
      </div>

      {/* 세부 정보 */}
      <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-gray-500">
        <div>
          보정: <span className={isMercyActive ? "text-emerald-400" : "text-gray-400"}>
            {isMercyActive ? "ON" : `${pity}/${track.mercyStart}`}
          </span>
        </div>
        <div className="text-right">
          천장까지: <span className={remaining <= 10 ? "text-emerald-400 font-bold" : "text-gray-400"}>{remaining}개</span>
        </div>
        <div>기본: {base}%</div>
        <div className="text-right">+{track.mercyPerPull}%/개</div>
      </div>

      {/* 통계 + 기록 버튼 */}
      <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
        <div className="text-[10px] text-gray-500 leading-relaxed">
          {trackHistory.length > 0 ? (
            <>
              <div>
                평균 <span className={`font-mono font-bold ${track.color}`}>{avg}</span>개
                <span className="mx-1">|</span>
                체감 <span className={`font-mono font-bold ${track.color}`}>{pullRate}</span>
              </div>
              <div>
                총 <span className="font-mono font-bold text-gray-300">{totalPulls}</span>개 소환
              </div>
            </>
          ) : (
            <span className="text-gray-600">총 <span className="font-mono text-gray-400">{totalPulls}</span>개 소환</span>
          )}
        </div>
        <button
          onClick={() => onOpenHistory(trackKey)}
          className={`text-[10px] px-2 py-1 rounded-md border transition-colors cursor-pointer
            ${trackHistory.length > 0
              ? `${track.borderColor} ${track.color} hover:bg-white/5`
              : "border-gray-800 text-gray-600 hover:text-gray-400"}`}
        >
          획득 기록 ({trackHistory.length})
        </button>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ────────────────────────────────────
export default function ShardCalculator() {
  const { user } = useAuth();
  const isLoggedIn = !!user;

  const [is2x, setIs2x] = useState(false);
  const [pityState, setPityState] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<PullRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modalTrackKey, setModalTrackKey] = useState<string | null>(null);

  // 계정 시스템
  const [accounts, setAccounts] = useState<ShardAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [showAccountPrompt, setShowAccountPrompt] = useState(false);
  const [showAccountInput, setShowAccountInput] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // pity 디바운스 저장용 ref (Supabase 모드)
  const pityTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 계정 메뉴 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── 초기 로드 ─────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (isLoggedIn) {
        // === Supabase 모드 ===
        const accs = await dbLoadAccounts(user!.id);
        if (cancelled) return;
        setAccounts(accs);

        if (accs.length > 0) {
          const savedId = loadActiveAccountId();
          const activeId = (savedId && accs.find((a) => a.id === savedId)) ? savedId : accs[0].id;
          setActiveAccountId(activeId);
          saveActiveAccountId(activeId);
          const [pity, hist] = await Promise.all([
            dbLoadPity(activeId),
            dbLoadHistory(activeId),
          ]);
          if (cancelled) return;
          setPityState(pity);
          setHistory(hist);
        }
      } else {
        // === localStorage 모드 (게스트) ===
        const accs = loadAccounts();
        setAccounts(accs);

        if (accs.length > 0) {
          const savedId = loadActiveAccountId();
          const activeId = (savedId && accs.find((a) => a.id === savedId)) ? savedId : accs[0].id;
          setActiveAccountId(activeId);
          saveActiveAccountId(activeId);
          setPityState(loadPity(activeId));
          setHistory(loadHistory(activeId));
        } else {
          const hasOldData = !!(localStorage.getItem("rsl_shard_pity") || localStorage.getItem("rsl_shard_history"));
          if (hasOldData) {
            const defaultAcc: ShardAccount = { id: "default", name: "기본 계정", createdAt: Date.now() };
            migrateOldData(defaultAcc.id);
            setAccounts([defaultAcc]);
            saveAccounts([defaultAcc]);
            setActiveAccountId(defaultAcc.id);
            saveActiveAccountId(defaultAcc.id);
            setPityState(loadPity(defaultAcc.id));
            setHistory(loadHistory(defaultAcc.id));
          }
        }
      }
      if (!cancelled) setLoaded(true);
    }

    setLoaded(false);
    init();
    return () => { cancelled = true; };
    // user 변경 (로그인/로그아웃) 시 데이터 새로 로드
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── 계정 전환 ─────────────────────────────────────
  const switchAccount = useCallback(async (id: string) => {
    if (activeAccountId && loaded && !isLoggedIn) {
      // 게스트: 현재 계정 데이터 localStorage에 저장
      savePity(activeAccountId, pityState);
      saveHistory(activeAccountId, history);
    }
    // Supabase 모드에서는 이미 실시간 저장되므로 별도 저장 불필요

    setActiveAccountId(id);
    saveActiveAccountId(id);

    if (isLoggedIn) {
      const [pity, hist] = await Promise.all([
        dbLoadPity(id),
        dbLoadHistory(id),
      ]);
      setPityState(pity);
      setHistory(hist);
    } else {
      setPityState(loadPity(id));
      setHistory(loadHistory(id));
    }
    setAccountMenuOpen(false);
  }, [activeAccountId, pityState, history, loaded, isLoggedIn]);

  // ── 계정 추가 (최대 10개) ─────────────────────────
  const handleAddAccount = useCallback(async () => {
    const name = newAccountName.trim();
    if (!name) return;
    if (accounts.length >= 10) {
      setShowAccountInput(false);
      setNewAccountName("");
      return;
    }

    if (isLoggedIn) {
      const newAcc = await dbCreateAccount(user!.id, name);
      if (!newAcc) return;
      const updated = [...accounts, newAcc];
      setAccounts(updated);
      setNewAccountName("");
      setShowAccountInput(false);
      setActiveAccountId(newAcc.id);
      saveActiveAccountId(newAcc.id);
      setPityState({});
      setHistory([]);
    } else {
      const newAcc: ShardAccount = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        createdAt: Date.now(),
      };
      const updated = [...accounts, newAcc];
      setAccounts(updated);
      saveAccounts(updated);
      setNewAccountName("");
      setShowAccountInput(false);
      if (activeAccountId && loaded) {
        savePity(activeAccountId, pityState);
        saveHistory(activeAccountId, history);
      }
      setActiveAccountId(newAcc.id);
      saveActiveAccountId(newAcc.id);
      setPityState({});
      setHistory([]);
    }
  }, [newAccountName, accounts, activeAccountId, pityState, history, loaded, isLoggedIn, user]);

  // ── 계정 삭제 ─────────────────────────────────────
  const handleDeleteAccount = useCallback(async (id: string) => {
    if (isLoggedIn) {
      await dbDeleteAccount(id);
    } else {
      localStorage.removeItem(pityKey(id));
      localStorage.removeItem(historyKey(id));
    }

    const updated = accounts.filter((a) => a.id !== id);
    setAccounts(updated);
    if (!isLoggedIn) saveAccounts(updated);

    if (activeAccountId === id) {
      if (updated.length > 0) {
        await switchAccount(updated[0].id);
      } else {
        setActiveAccountId(null);
        setPityState({});
        setHistory([]);
      }
    }
  }, [accounts, activeAccountId, switchAccount, isLoggedIn]);

  // 계정 없이 조작 시 프롬프트
  const requireAccount = useCallback((): boolean => {
    if (activeAccountId) return true;
    setShowAccountPrompt(true);
    return false;
  }, [activeAccountId]);

  // ── 데이터 자동 저장 (게스트 전용) ─────────────────
  useEffect(() => {
    if (loaded && activeAccountId && !isLoggedIn) savePity(activeAccountId, pityState);
  }, [pityState, loaded, activeAccountId, isLoggedIn]);
  useEffect(() => {
    if (loaded && activeAccountId && !isLoggedIn) saveHistory(activeAccountId, history);
  }, [history, loaded, activeAccountId, isLoggedIn]);

  // ── pity 변경 ─────────────────────────────────────
  const getPity = (key: string) => pityState[key] ?? 0;
  const setPity = useCallback((key: string, val: number) => {
    if (!requireAccount()) return;
    const clamped = Math.max(0, val);
    setPityState((prev) => ({ ...prev, [key]: clamped }));

    // Supabase 디바운스 저장 (300ms)
    if (isLoggedIn && activeAccountId) {
      if (pityTimerRef.current[key]) clearTimeout(pityTimerRef.current[key]);
      pityTimerRef.current[key] = setTimeout(() => {
        dbSavePity(activeAccountId, key, clamped);
      }, 300);
    }
  }, [requireAccount, isLoggedIn, activeAccountId]);

  // ── 획득 기록 ─────────────────────────────────────
  const handlePull = useCallback(async (trackKey: string, pulledAt: number, wasCeiling: boolean) => {
    if (!requireAccount()) return;

    const record: PullRecord = { trackKey, pulledAt, timestamp: Date.now(), wasCeiling };

    // pity를 0으로 리셋
    setPityState((prev) => ({ ...prev, [trackKey]: 0 }));

    if (isLoggedIn && activeAccountId) {
      // Supabase: pity 즉시 0으로 저장 + 기록 추가
      dbSavePity(activeAccountId, trackKey, 0);
      const dbId = await dbAddHistory(activeAccountId, record);
      if (dbId) record.dbId = dbId;
    }

    setHistory((prev) => [...prev, record]);
  }, [requireAccount, isLoggedIn, activeAccountId]);

  // ── 기록 삭제 ─────────────────────────────────────
  const handleDeleteRecord = useCallback(async (timestamp: number) => {
    if (isLoggedIn) {
      const record = history.find((r) => r.timestamp === timestamp);
      if (record?.dbId) {
        await dbDeleteHistory(record.dbId);
      }
    }
    setHistory((prev) => prev.filter((r) => r.timestamp !== timestamp));
  }, [isLoggedIn, history]);

  // ── 챔피언 이름 업데이트 ──────────────────────────
  const handleUpdateName = useCallback((timestamp: number, name: string) => {
    setHistory((prev) =>
      prev.map((r) => r.timestamp === timestamp ? { ...r, championName: name } : r)
    );
    // Note: championName is not stored in DB (column not available).
    // It is kept in local state for the current session.
  }, []);

  // 모달에 필요한 트랙 정보 찾기
  const getTrackInfo = (trackKey: string) => {
    const [shardKey, idxStr] = trackKey.split("_");
    const shardType = shardKey as ShardType;
    const shard = SHARDS[shardType];
    const track = shard.mercyTracks[parseInt(idxStr)];
    return { shardType, shard, track };
  };

  if (!loaded) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="flex items-end justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">파편 확률 계산기</h1>
          <p className="text-sm text-gray-500 mt-1">보정(자비) 시스템 추적</p>
        </div>
        <button
          onClick={() => setIs2x(!is2x)}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer border-2
            ${is2x
              ? "border-amber-500 text-amber-400 bg-amber-500/10 shadow-lg shadow-amber-500/20"
              : "border-gray-700 text-gray-500 bg-[#1a1a2e] hover:border-gray-600"}`}
        >
          2x 이벤트 {is2x ? "ON" : "OFF"}
        </button>
      </div>

      {/* 계정 선택 */}
      <div className="flex items-center gap-3 mb-6">
        {/* 현재 계정 / 계정 목록 */}
        {accounts.length > 0 ? (
          <div ref={accountMenuRef} className="relative">
            <button
              onClick={() => setAccountMenuOpen(!accountMenuOpen)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer border ${
                accountMenuOpen
                  ? "bg-gold/10 border-gold/50 text-gold"
                  : "bg-card border-card-border text-gray-300 hover:border-gold/30"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {accounts.find(a => a.id === activeAccountId)?.name || "계정 선택"}
              <svg className={`w-3 h-3 transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {accountMenuOpen && (
              <div className="absolute top-full mt-1 left-0 bg-[#12122a] border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[200px] overflow-hidden">
                {accounts.map((acc) => (
                  <div key={acc.id} className="group flex items-center hover:bg-gray-800/40 transition-colors">
                    <button
                      onClick={() => switchAccount(acc.id)}
                      className="flex-1 text-left px-4 py-2.5 cursor-pointer"
                    >
                      <div className={`text-sm ${acc.id === activeAccountId ? "text-gold font-bold" : "text-gray-300"}`}>
                        {acc.name}
                        {acc.id === activeAccountId && (
                          <span className="ml-1.5 text-[9px] bg-gold/20 text-gold px-1.5 py-0.5 rounded">현재</span>
                        )}
                      </div>
                    </button>
                    {accounts.length > 1 && (
                      <button
                        onClick={() => handleDeleteAccount(acc.id)}
                        className="px-3 py-2.5 text-gray-700 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        title="계정 삭제"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {/* 계정 추가 버튼 / 입력 */}
        {accounts.length >= 10 ? null : showAccountInput ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newAccountName}
              onChange={(e) => setNewAccountName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddAccount(); if (e.key === "Escape") { setShowAccountInput(false); setNewAccountName(""); } }}
              placeholder="계정 이름"
              className="bg-input-bg border border-input-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-gold w-36"
              autoFocus
            />
            <button
              onClick={handleAddAccount}
              disabled={!newAccountName.trim()}
              className="px-3 py-1.5 bg-gold text-background rounded-lg text-sm font-semibold hover:bg-gold-dark transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              저장
            </button>
            <button
              onClick={() => { setShowAccountInput(false); setNewAccountName(""); }}
              className="text-gray-500 hover:text-white text-sm cursor-pointer"
            >
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAccountInput(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-gray-500 border border-dashed border-gray-700 hover:border-gold/40 hover:text-gold transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            계정 추가
          </button>
        )}
      </div>

      {/* 계정 추가 프롬프트 모달 */}
      {showAccountPrompt && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAccountPrompt(false)}>
          <div className="bg-[#12122a] border border-gray-700 rounded-xl p-6 w-full max-w-xs shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <svg className="w-10 h-10 mx-auto text-gold mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="text-white font-medium mb-1">계정을 먼저 추가해주세요</p>
            <p className="text-gray-500 text-xs mb-4">데이터를 저장하려면 계정이 필요합니다</p>
            <button
              onClick={() => {
                setShowAccountPrompt(false);
                setShowAccountInput(true);
              }}
              className="w-full px-4 py-2.5 bg-gold text-background rounded-lg text-sm font-semibold hover:bg-gold-dark transition-colors cursor-pointer"
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 상단 3개 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {(["ancient", "void", "sacred"] as const).map((type) => (
          <TrackCard
            key={`${type}_0`}
            shardType={type}
            track={SHARDS[type].mercyTracks[0]}
            trackKey={`${type}_0`}
            pity={getPity(`${type}_0`)}
            setPity={setPity}
            is2x={is2x}
            onPull={handlePull}
            history={history}
            onOpenHistory={setModalTrackKey}
          />
        ))}
      </div>

      {/* 하단 태고 2개 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SHARDS.primal.mercyTracks.map((track, idx) => (
          <TrackCard
            key={`primal_${idx}`}
            shardType="primal"
            track={track}
            trackKey={`primal_${idx}`}
            pity={getPity(`primal_${idx}`)}
            setPity={setPity}
            is2x={is2x}
            onPull={handlePull}
            history={history}
            onOpenHistory={setModalTrackKey}
          />
        ))}
      </div>

      {/* 모달 */}
      {modalTrackKey && (() => {
        const { shard, track } = getTrackInfo(modalTrackKey);
        return (
          <HistoryModal
            trackKey={modalTrackKey}
            track={track}
            shard={shard}
            records={history}
            onClose={() => setModalTrackKey(null)}
            onDelete={handleDeleteRecord}
            onUpdateName={handleUpdateName}
          />
        );
      })()}
    </div>
  );
}
