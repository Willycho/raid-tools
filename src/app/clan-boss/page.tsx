"use client";

import React, { useState, useEffect, useRef, memo, useCallback } from "react";
import { useAuth } from "@/lib/AuthContext";
import { getSupabase } from "@/lib/supabase";

interface BuffDebuff {
  name: string;
  turns: number | null;
}

interface TmFill {
  target: "all_allies" | "self";
  value: number;
}

interface CdReduce {
  target: "all_allies" | "other_allies" | "target_ally" | "self";
  value: number;
  type: "reduce" | "reset";
  targetSkillLabel?: string; // 특정 스킬만 쿨감 (예: "A2")
}

interface BuffExtend {
  target: "all_allies" | "other_allies";
  value: number;
}

interface Cleanse {
  count: number | "all";
  target: string;
}

interface Skill {
  label: string;
  name: string;
  type: string;
  cooldown: number;
  buffs: BuffDebuff[];
  debuffs: BuffDebuff[];
  extra_turn?: boolean;
  tm_fill?: TmFill[];
  is_passive?: boolean;
  cd_reduce?: CdReduce;
  buff_extend?: BuffExtend;
  booked_cooldown?: number;
  cleanse?: Cleanse | Cleanse[]; // JSON에서 1개면 객체, 2개 이상이면 배열
}

interface Champion {
  slug: string;
  name: string;
  display_name: string;
  rarity: string;
  faction: string;
  affinity: string;
  image: string;
  affinity_image: string;
  base_speed: number;
  form: string | null;
  skills: Skill[];
}

interface SkillConfig {
  label: string;
  cooldown: number; // 사용자가 조정한 쿨타임
  priority: number; // 낮을수록 우선 사용 (0 = 최우선)
  disabled: boolean; // 스킬 사용 안 함 (잠금)
  delay: number; // 딜레이: 시뮬 시작 후 몇 턴 뒤에 처음 사용할지 (0 = 즉시)
  cdReduceTarget?: string; // 쿨다운 감소 스킬의 대상 챔피언 slug
}

interface SlotData {
  champion: Champion | null;
  speed: number;
  speedAura: number; // 슬롯1 전용, 스피드 오라 %
  skillConfigs: SkillConfig[];
  steelEpic: boolean; // 강철의 서사시 on/off
  setBonusPct: number; // 아이템 세트 스피드 보너스 총 %
}

const RARITY_COLORS: Record<string, string> = {
  Mythical: "border-red-500 text-red-400",
  Legendary: "border-yellow-500 text-yellow-400",
  Epic: "border-purple-500 text-purple-400",
  Rare: "border-blue-500 text-blue-400",
};

const AFFINITY_COLORS: Record<string, string> = {
  Magic: "text-blue-400",
  Force: "text-red-400",
  Spirit: "text-green-400",
  Void: "text-purple-400",
};

const BOSS_SPEEDS: Record<string, number> = {
  Easy: 130,
  Normal: 140,
  Hard: 150,
  Brutal: 160,
  Nightmare: 170,
  "Ultra Nightmare": 190,
};

// 패시브 스킬인지 판별
function isPassive(skill: Skill): boolean {
  if (skill.is_passive) return true;
  if (skill.type === "Passive") return true;
  if (skill.name.includes("[P]") || skill.name.includes("[HP]")) return true;
  if (skill.name.toLowerCase().includes("passive")) return true;
  if (skill.name.includes("(Secret Skill)")) return true;
  return false;
}

// 오라/파트너/메타모프 등 시뮬레이션에서 제외할 스킬
function isExcludedSkill(skill: Skill): boolean {
  const n = skill.name.toLowerCase();
  if (n.includes("metamorph")) return true;
  if (n.includes("(aura)") || (skill.label !== "A1" && n.trim() === "aura")) return true;
  if (n.includes("partner") && skill.cooldown > 0) return true; // 태그팀 파트너 스킬
  return false;
}

// 비신화 챔피언의 A4+ 중 cd=0인 스킬은 패시브로 간주
function isEffectivelyPassive(skill: Skill, champion: Champion): boolean {
  if (isPassive(skill)) return true;
  if (isExcludedSkill(skill)) return true;
  // A4 이상 + cd=0 + 비신화 → 패시브 취급
  const labelNum = parseInt(skill.label.replace("A", ""), 10);
  if (labelNum >= 4 && skill.cooldown <= 0 && champion.rarity !== "Mythical") return true;
  return false;
}

// 표시할 스킬 필터 (패시브/오라/파트너/메타모프 제외)
function getActiveSkills(champion: Champion): Skill[] {
  return champion.skills.filter((s) => !isEffectivelyPassive(s, champion));
}

// 버프/디버프 중복 제거 (같은 이름은 1개만)
function dedupeEffects(effects: BuffDebuff[]): BuffDebuff[] {
  const seen = new Map<string, BuffDebuff>();
  for (const e of effects) {
    if (!seen.has(e.name) || (e.turns && e.turns > (seen.get(e.name)!.turns || 0))) {
      seen.set(e.name, e);
    }
  }
  return Array.from(seen.values());
}

function ChampionSearch({
  champions,
  onSelect,
  onClose,
  krNames,
}: {
  champions: Champion[];
  onSelect: (c: Champion) => void;
  onClose: () => void;
  krNames: Record<string, string>;
}) {
  const [query, setQuery] = useState("");
  const [filterRarity, setFilterRarity] = useState<string>("all");
  const [filterFaction, setFilterFaction] = useState<string>("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const factions = Array.from(new Set(champions.map((c) => c.faction))).sort();

  const filtered = champions.filter((c) => {
    if (query) {
      const q = query.toLowerCase();
      const engMatch = c.display_name.toLowerCase().includes(q);
      const kr = krNames[c.slug];
      const krList = Array.isArray(kr) ? kr : kr ? [kr] : [];
      const krMatch = krList.some((n) => n.includes(q));
      if (!engMatch && !krMatch) return false;
    }
    if (filterRarity !== "all" && c.rarity !== filterRarity) return false;
    if (filterFaction !== "all" && c.faction !== filterFaction) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start justify-center pt-10 px-4">
      <div className="bg-card border border-card-border rounded-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-card-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-gold font-semibold">챔피언 선택</h3>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            placeholder="챔피언 이름 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-gold"
          />
          <div className="flex gap-2 mt-2">
            <select
              value={filterRarity}
              onChange={(e) => setFilterRarity(e.target.value)}
              className="bg-input-bg border border-input-border rounded px-2 py-1 text-xs text-gray-300 outline-none"
            >
              <option value="all">전체 등급</option>
              <option value="Mythical">신화</option>
              <option value="Legendary">전설</option>
              <option value="Epic">에픽</option>
              <option value="Rare">레어</option>
            </select>
            <select
              value={filterFaction}
              onChange={(e) => setFilterFaction(e.target.value)}
              className="bg-input-bg border border-input-border rounded px-2 py-1 text-xs text-gray-300 outline-none flex-1"
            >
              <option value="all">전체 세력</option>
              {factions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-500 py-8 text-sm">
              검색 결과가 없습니다
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1">
              {filtered.slice(0, 100).map((c) => (
                <button
                  key={c.slug}
                  onClick={() => onSelect(c)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-card-hover transition-colors text-left cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-lg border-2 overflow-hidden flex-shrink-0 ${RARITY_COLORS[c.rarity] || "border-gray-600"}`}
                  >
                    <img
                      src={c.image}
                      alt={c.display_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">
                      {c.display_name}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      <span className={AFFINITY_COLORS[c.affinity] || ""}>
                        {c.affinity}
                      </span>
                      {" · "}
                      {c.faction}
                      {" · "}
                      <span
                        className={
                          RARITY_COLORS[c.rarity]?.split(" ")[1] || ""
                        }
                      >
                        {c.rarity}
                      </span>
                    </p>
                  </div>
                </button>
              ))}
              {filtered.length > 100 && (
                <p className="text-center text-gray-500 text-xs py-2">
                  +{filtered.length - 100}개 더...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ChampionSlot = React.memo(function ChampionSlot({
  slot,
  index,
  allSlots,
  onOpenSearch,
  onUpdate,
  onRemove,
}: {
  slot: SlotData;
  index: number;
  allSlots: SlotData[];
  onOpenSearch: () => void;
  onUpdate: (updated: Partial<SlotData>) => void;
  onRemove: () => void;
}) {
  const champ = slot.champion;
  const isLeader = index === 0;

  if (!champ) {
    return (
      <div
        onClick={onOpenSearch}
        className="bg-card border border-dashed border-card-border rounded-xl p-4 flex flex-col items-center justify-center min-h-[200px] cursor-pointer hover:border-gold/50 transition-colors"
      >
        <div className="w-16 h-16 rounded-full bg-input-bg border border-input-border flex items-center justify-center mb-3">
          <svg
            className="w-8 h-8 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
        <p className="text-sm text-gray-500">
          {isLeader ? "리더" : `슬롯 ${index + 1}`}
        </p>
        <p className="text-xs text-gray-600 mt-1">클릭하여 챔피언 선택</p>
      </div>
    );
  }

  const activeSkills = getActiveSkills(champ);

  const handleCooldownChange = (label: string, newCd: number) => {
    const updated = slot.skillConfigs.map((sc) =>
      sc.label === label ? { ...sc, cooldown: Math.max(1, newCd) } : sc
    );
    onUpdate({ skillConfigs: updated });
  };

  const handleToggleDisable = (label: string) => {
    const updated = slot.skillConfigs.map((sc) =>
      sc.label === label ? { ...sc, disabled: !sc.disabled } : sc
    );
    onUpdate({ skillConfigs: updated });
  };

  const handleDelayChange = (label: string, newDelay: number) => {
    const updated = slot.skillConfigs.map((sc) =>
      sc.label === label ? { ...sc, delay: Math.max(0, newDelay) } : sc
    );
    onUpdate({ skillConfigs: updated });
  };

  const handleResetSkills = () => {
    if (!champ) return;
    onUpdate({ skillConfigs: buildSkillConfigs(champ) });
  };

  const handlePriorityChange = (label: string, dir: "up" | "down") => {
    // A1은 이동 불가 (항상 fallback)
    if (label === "A1") return;
    const configs = [...slot.skillConfigs];
    const idx = configs.findIndex((sc) => sc.label === label);
    if (idx < 0) return;
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= configs.length) return;
    // A1과는 스왑 불가
    if (configs[swapIdx].label === "A1") return;
    // swap priorities
    const tmp = configs[idx].priority;
    configs[idx] = { ...configs[idx], priority: configs[swapIdx].priority };
    configs[swapIdx] = { ...configs[swapIdx], priority: tmp };
    // re-sort
    configs.sort((a, b) => a.priority - b.priority);
    onUpdate({ skillConfigs: configs });
  };

  // skillConfigs 순서대로 정렬된 액티브 스킬
  const sortedSkills = [...activeSkills].sort((a, b) => {
    const aConf = slot.skillConfigs.find((sc) => sc.label === a.label);
    const bConf = slot.skillConfigs.find((sc) => sc.label === b.label);
    return (aConf?.priority ?? 99) - (bConf?.priority ?? 99);
  });

  return (
    <div
      className={`bg-card border rounded-xl p-4 ${RARITY_COLORS[champ.rarity]?.split(" ")[0] || "border-card-border"}`}
    >
      {/* Leader Badge */}
      {isLeader && (
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[10px] bg-gold/20 text-gold px-2 py-0.5 rounded-full font-semibold uppercase">
            Leader
          </span>
        </div>
      )}

      {/* Champion Header */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-12 h-12 rounded-lg border-2 overflow-hidden flex-shrink-0 ${RARITY_COLORS[champ.rarity] || "border-gray-600"}`}
        >
          <img
            src={champ.image}
            alt={champ.display_name}
            className="w-full h-full object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {champ.display_name}
          </p>
          <p className="text-[11px] text-gray-500">
            <span className={AFFINITY_COLORS[champ.affinity] || ""}>
              {champ.affinity}
            </span>
            {" · "}
            {champ.faction}
          </p>
        </div>
        <button
          onClick={onRemove}
          className="text-gray-600 hover:text-red-400 transition-colors p-1"
          title="제거"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Speed Input */}
      <div className="mb-3">
        <label className="text-[11px] text-gray-500 block mb-1">스피드</label>
        <input
          type="number"
          value={slot.speed || ""}
          onChange={(e) => onUpdate({ speed: Number(e.target.value) })}
          placeholder="예: 171"
          className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-gold"
        />
      </div>

      {/* Speed Aura - Leader Only */}
      {isLeader && (
        <div className="mb-3">
          <label className="text-[11px] text-gold block mb-1">
            스피드 오라 (%)
          </label>
          <input
            type="number"
            value={slot.speedAura || ""}
            onChange={(e) => onUpdate({ speedAura: Number(e.target.value) })}
            placeholder="예: 19"
            className="w-full bg-input-bg border border-gold/30 rounded-lg px-3 py-1.5 text-sm text-gold placeholder-gray-600 outline-none focus:border-gold"
          />
        </div>
      )}

      {/* 강철의 서사시 (Lore of Steel) Toggle */}
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-gray-400">
            강철의 서사시 (Lore of Steel)
          </label>
          <button
            onClick={() => onUpdate({ steelEpic: !slot.steelEpic })}
            className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
              slot.steelEpic ? "bg-gold" : "bg-input-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                slot.steelEpic ? "translate-x-5" : ""
              }`}
            />
          </button>
        </div>
        {slot.steelEpic && (
          <div className="mt-1.5 space-y-1.5">
            {/* 기본 스피드 */}
            <div className="bg-gold/10 border border-gold/20 rounded-lg px-3 py-1.5 flex items-center justify-between">
              <span className="text-[11px] text-gold/70">기본 스피드</span>
              <span className="text-sm font-mono text-gold font-semibold">
                {champ.base_speed}
              </span>
            </div>

            {/* 세트 스피드 보너스 % 입력 */}
            <div>
              <label className="text-[10px] text-gray-500 block mb-1">
                세트 스피드 보너스 총 %
              </label>
              <input
                type="number"
                value={slot.setBonusPct || ""}
                onChange={(e) =>
                  onUpdate({ setBonusPct: Number(e.target.value) })
                }
                placeholder="예: 12 (Speed 1세트)"
                className="w-full bg-input-bg border border-gold/20 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 outline-none focus:border-gold"
              />
            </div>

            {/* True Speed 계산 결과 */}
            {slot.speed > 0 && slot.setBonusPct > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-emerald-400/70">
                    True Speed
                  </span>
                  <span className="text-sm font-mono text-emerald-400 font-bold">
                    {calcTrueSpeed(
                      slot.speed,
                      champ.base_speed,
                      slot.setBonusPct,
                      true
                    ).toFixed(3)}
                  </span>
                </div>
                <p className="text-[9px] text-gray-500 mt-1">
                  세트 보너스 {slot.setBonusPct}% x 1.15 ={" "}
                  {(slot.setBonusPct * 1.15).toFixed(2)}% | 추가 스피드:{" "}
                  +
                  {(
                    champ.base_speed *
                    (slot.setBonusPct / 100) *
                    0.15
                  ).toFixed(3)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Skills - Priority Order */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] text-gray-500">
            스킬 (우선순위 순)
          </label>
          <button
            onClick={handleResetSkills}
            className="text-[10px] text-gray-600 hover:text-gold transition-colors cursor-pointer"
          >
            초기화
          </button>
        </div>
        <div className="space-y-2">
          {sortedSkills.map((skill) => {
            const config = slot.skillConfigs.find(
              (sc) => sc.label === skill.label
            );
            const isA1 = skill.label === "A1";
            const isDisabled = config?.disabled ?? false;

            return (
              <div
                key={skill.label}
                className={`bg-input-bg rounded-lg p-2 transition-opacity ${isDisabled ? "opacity-30" : ""}`}
              >
                {/* Skill Header */}
                <div className="flex items-center gap-1.5 mb-1">
                  {/* Priority Arrows (A1 제외 — A1은 항상 fallback) */}
                  {!isA1 && !isDisabled && (
                    <div className="flex flex-col gap-0">
                      <button
                        onClick={() => handlePriorityChange(skill.label, "up")}
                        className="text-gray-500 hover:text-gold text-[10px] leading-none cursor-pointer"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() =>
                          handlePriorityChange(skill.label, "down")
                        }
                        className="text-gray-500 hover:text-gold text-[10px] leading-none cursor-pointer"
                      >
                        ▼
                      </button>
                    </div>
                  )}
                  <span className={`text-[11px] font-mono ${isDisabled ? "text-gray-600" : "text-gold"}`}>
                    {skill.label}
                  </span>
                  <span className={`text-xs truncate flex-1 ${isDisabled ? "text-gray-600 line-through" : "text-gray-300"}`}>
                    {skill.name}
                  </span>
                  {/* Disable 버튼 (A1 제외) */}
                  {!isA1 && (
                    <button
                      onClick={() => handleToggleDisable(skill.label)}
                      className={`w-5 h-5 rounded flex items-center justify-center text-[10px] cursor-pointer transition-colors ${
                        isDisabled
                          ? "bg-gray-700 text-gray-400 hover:text-white"
                          : "text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                      }`}
                      title={isDisabled ? "스킬 활성화" : "스킬 사용 안 함"}
                    >
                      {isDisabled ? "↩" : "✕"}
                    </button>
                  )}
                </div>

                {/* Cooldown Control (A2+ only) */}
                {!isA1 && config && skill.cooldown > 0 && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-gray-500">CD:</span>
                    <button
                      onClick={() =>
                        handleCooldownChange(skill.label, config.cooldown - 1)
                      }
                      className="w-5 h-5 rounded bg-card border border-card-border text-gray-400 hover:text-gold text-xs flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-xs text-white font-mono w-4 text-center">
                      {config.cooldown}
                    </span>
                    <button
                      onClick={() =>
                        handleCooldownChange(skill.label, config.cooldown + 1)
                      }
                      className="w-5 h-5 rounded bg-card border border-card-border text-gray-400 hover:text-gold text-xs flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                )}

                {/* Delay Control (A2+ only) */}
                {!isA1 && config && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-gray-500">딜레이:</span>
                    <button
                      onClick={() =>
                        handleDelayChange(skill.label, config.delay - 1)
                      }
                      className="w-5 h-5 rounded bg-card border border-card-border text-gray-400 hover:text-gold text-xs flex items-center justify-center cursor-pointer"
                    >
                      -
                    </button>
                    <span className="text-xs text-white font-mono w-4 text-center">
                      {config.delay}
                    </span>
                    <button
                      onClick={() =>
                        handleDelayChange(skill.label, config.delay + 1)
                      }
                      className="w-5 h-5 rounded bg-card border border-card-border text-gray-400 hover:text-gold text-xs flex items-center justify-center cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                )}

                {/* CD Reduce Target (쿨다운 감소 스킬에만 표시) */}
                {skill.cd_reduce && skill.cd_reduce.target === "target_ally" && config && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-yellow-400">타겟:</span>
                    <select
                      value={config.cdReduceTarget ?? ""}
                      onChange={(e) => {
                        const updated = slot.skillConfigs.map((sc) =>
                          sc.label === skill.label
                            ? { ...sc, cdReduceTarget: e.target.value || undefined }
                            : sc
                        );
                        onUpdate({ skillConfigs: updated });
                      }}
                      className="bg-input-bg border border-input-border rounded px-1.5 py-0.5 text-[10px] text-gray-300 outline-none flex-1"
                    >
                      <option value="">자동 (최저 HP)</option>
                      {allSlots
                        .filter((s) => s.champion && s.champion.slug !== champ?.slug)
                        .map((s) => (
                          <option key={s.champion!.slug} value={s.champion!.display_name}>
                            {s.champion!.display_name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Buffs */}
                {skill.buffs.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {skill.buffs.map((b, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded"
                      >
                        {b.name}
                        {b.turns ? ` ${b.turns}t` : ""}
                      </span>
                    ))}
                  </div>
                )}

                {/* Debuffs */}
                {skill.debuffs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {skill.debuffs.map((d, i) => (
                      <span
                        key={i}
                        className="text-[9px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded"
                      >
                        {d.name}
                        {d.turns ? ` ${d.turns}t` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Change Champion */}
      <button
        onClick={onOpenSearch}
        className="w-full mt-2 text-[11px] text-gray-500 hover:text-gold py-1 transition-colors cursor-pointer"
      >
        챔피언 변경
      </button>
    </div>
  );
});

// Lore of Steel(강철의 서사시) True Speed 계산
// 세트 보너스에 15%를 추가 적용하지만, 게임은 floor 처리하므로 소수점이 숨겨짐
function calcTrueSpeed(
  enteredSpeed: number,
  baseSpeed: number,
  setBonusPct: number,
  steelEpic: boolean
): number {
  if (!steelEpic || setBonusPct <= 0 || baseSpeed <= 0) return enteredSpeed;

  // 세트 보너스로 오른 스피드 (Lore of Steel 적용)
  const setSpeedWithLoS = baseSpeed * (setBonusPct / 100) * 1.15;
  // 게임이 표시하는 값 (floor)
  const setSpeedFloored = Math.floor(setSpeedWithLoS);
  // 소수점 잔여분 = 게임이 숨긴 진짜 스피드
  const fractional = setSpeedWithLoS - setSpeedFloored;

  return enteredSpeed + fractional;
}

// 시뮬레이션에 적용되는 최종 스피드
// sim_speed = trueSpeed + (기본속도 × 스피드오라%) + 지역보너스
// 입력값은 챔피언 페이지 속도 (오라 미포함), 오라는 전체 값을 더함
// 예: Ruella 294 + 112×0.19 = 294 + 21.28 = 315.28 (DWJ 일치)
function calcSimSpeed(
  enteredSpeed: number,
  baseSpeed: number,
  setBonusPct: number,
  steelEpic: boolean,
  speedAuraPct: number,
  regionBonusVal: number
): number {
  const trueSpeed = calcTrueSpeed(
    enteredSpeed,
    baseSpeed,
    setBonusPct,
    steelEpic
  );
  const auraBonus = baseSpeed * (speedAuraPct / 100);
  return trueSpeed + auraBonus + regionBonusVal;
}

// ==================== 시뮬레이션 엔진 ====================

// 보스 로테이션: 모든 속성 동일 AOE1 → AOE2 → STUN
const BOSS_ROTATION = ["AOE1", "AOE2", "STUN"] as const;
type BossSkill = "AOE1" | "AOE2" | "STUN";

// 보스 속성별 디버프: Void=AOE1 후 Poison, 나머지=AOE2 후 속성 디버프
interface BossAffinityDebuff {
  name: string;
  turns: number;
  afterSkill: BossSkill; // 어떤 스킬 후에 디버프 거는지
}
const BOSS_AFFINITY_DEBUFFS: Record<string, BossAffinityDebuff | null> = {
  Void:   { name: "Poison",       turns: 2, afterSkill: "AOE1" },
  Spirit: { name: "Decrease SPD", turns: 2, afterSkill: "AOE2" },
  Force:  { name: "Decrease ATK", turns: 2, afterSkill: "AOE2" },
  Magic:  { name: "Decrease ACC", turns: 2, afterSkill: "AOE2" },
};

interface ActiveBuff {
  name: string;
  remainingTurns: number;
  sourceSkill: string; // 어떤 스킬이 건 버프인지
  justApplied?: boolean; // 시전자 본인만: 시전 턴에 감소 방지
}

interface TmSnapshot {
  name: string;
  tm: number;
}

interface TurnAction {
  actor: string;
  actorImage?: string;
  skill: string;
  skillName: string;
  activeBuffs: ActiveBuff[];
  activeDebuffs?: ActiveBuff[]; // 보스가 건 디버프
  tmFillInfo?: string; // 턴미터 채우기 정보 (예: "TM +30%")
  isChampion: boolean;
  tmSnapshot?: TmSnapshot[]; // 행동 시점 전체 TM 스냅샷
  bossTm?: number;
}

interface SimTurn {
  turnNumber: number;
  actions: TurnAction[];
}

interface SimSkill {
  label: string;
  name: string;
  cooldownMax: number;
  cooldownCurrent: number; // 0이면 사용 가능
  disabled: boolean;
  priority: number;
  buffs: BuffDebuff[];
  extraTurn: boolean;
  tmFill: TmFill[];
  delayRemaining: number; // 딜레이 남은 턴 수 (0이면 사용 가능)
  cdReduce?: CdReduce; // 쿨다운 감소 효과
  cdReduceTarget?: string; // 쿨다운 감소 대상 챔피언 이름
  buffExtend?: BuffExtend; // 버프 연장 효과
  cleanse?: Cleanse[]; // 디버프 제거 효과
}

interface SimParticipant {
  name: string;
  displayName: string;
  image: string;
  speed: number;
  slotIndex: number; // 슬롯 위치 (타이브레이킹용)
  turnMeter: number;
  skills: SimSkill[];
  activeBuffs: ActiveBuff[];
  activeDebuffs: ActiveBuff[]; // 보스가 건 디버프 (Decrease SPD 등)
  isChampion: true;
  extraTurnPending: boolean; // Extra Turn 대기 여부
  isExtraTurn: boolean; // 현재 Extra Turn 중인지 (중첩 방지)
}

interface BossParticipant {
  name: "Clanboss";
  speed: number;
  turnMeter: number;
  rotationIndex: number;
  isChampion: false;
}

function applyOrRefreshBuff(
  target: SimParticipant,
  buffName: string,
  turns: number,
  sourceSkill: string
) {
  const existing = target.activeBuffs.findIndex((b) => b.name === buffName);
  if (existing >= 0) {
    target.activeBuffs[existing].remainingTurns = turns;
    target.activeBuffs[existing].sourceSkill = sourceSkill;
  } else {
    target.activeBuffs.push({
      name: buffName,
      remainingTurns: turns,
      sourceSkill,
    });
  }
}

function runSimulation(
  slots: SlotData[],
  bossSpeed: number,
  speedAuraPct: number,
  regionBonusVal: number,
  maxTurns: number = 50,
  bossAffinity: string = "Void"
): SimTurn[] {
  const TICK_RATE = 0.07;
  const results: SimTurn[] = [];

  // 참가자 초기화
  const champions: SimParticipant[] = [];
  for (const slot of slots) {
    if (!slot.champion) continue;
    const champ = slot.champion;
    const simSpeed = calcSimSpeed(
      slot.speed,
      champ.base_speed,
      slot.setBonusPct,
      slot.steelEpic,
      speedAuraPct,
      regionBonusVal
    );

    const activeSkills = getActiveSkills(champ);
    const skills: SimSkill[] = activeSkills.map((s) => {
      const config = slot.skillConfigs.find((sc) => sc.label === s.label);
      return {
        label: s.label,
        name: s.name,
        cooldownMax: config?.cooldown ?? s.booked_cooldown ?? s.cooldown,
        cooldownCurrent: 0,
        disabled: config?.disabled ?? false,
        priority: config?.priority ?? 99,
        buffs: dedupeEffects(s.buffs),
        extraTurn: s.extra_turn ?? false,
        tmFill: s.tm_fill ?? [],
        delayRemaining: config?.delay ?? 0,
        cdReduce: s.cd_reduce,
        cdReduceTarget: config?.cdReduceTarget,
        buffExtend: s.buff_extend,
        cleanse: (() => {
          const raw = (s as Skill).cleanse;
          if (!raw) return undefined;
          return Array.isArray(raw) ? raw : [raw];
        })(),
      };
    });

    // 우선순위 순서대로 정렬 (낮은 priority가 먼저)
    skills.sort((a, b) => a.priority - b.priority);

    champions.push({
      name: champ.name,
      displayName: champ.display_name,
      image: champ.image,
      speed: simSpeed,
      slotIndex: champions.length,
      turnMeter: 0,
      skills,
      activeBuffs: [],
      activeDebuffs: [],
      isChampion: true,
      extraTurnPending: false,
      isExtraTurn: false,
    });
  }

  const boss: BossParticipant = {
    name: "Clanboss",
    speed: bossSpeed,
    turnMeter: 0,
    rotationIndex: 0,
    isChampion: false,
  };

  let bossActionCount = 0;
  let safetyCounter = 0;
  const MAX_ITERATIONS = 10000;

  // 턴 끝 처리: 버프/디버프 감소 + 쿨다운/딜레이 감소
  function finalizeChampionTurn(c: SimParticipant, usedSkill: SimSkill) {
    // 버프 지속턴 감소: justApplied(시전자 본인)는 스킵, 나머지 -1
    c.activeBuffs = c.activeBuffs
      .map((b) => {
        if (b.justApplied) return { ...b, justApplied: false };
        return { ...b, remainingTurns: b.remainingTurns - 1 };
      })
      .filter((b) => b.remainingTurns > 0);

    // 디버프 지속턴 감소 (보스가 건 디버프)
    c.activeDebuffs = c.activeDebuffs
      .map((d) => {
        if (d.justApplied) return { ...d, justApplied: false };
        return { ...d, remainingTurns: d.remainingTurns - 1 };
      })
      .filter((d) => d.remainingTurns > 0);

    for (const skill of c.skills) {
      if (skill.delayRemaining > 0) {
        skill.delayRemaining--;
      }
      if (skill.cooldownCurrent > 0) {
        skill.cooldownCurrent--;
      }
    }
  }

  // 챔피언이 턴을 수행하는 함수
  function championTakeTurn(c: SimParticipant) {
    // 스킬 선택: 우선순위 순 (A3 > A2 기본) → A1 fallback
    // skills 배열은 priority 오름차순 정렬됨 (낮은 숫자 = 높은 우선순위)
    const a1 = c.skills.find((s) => s.label === "A1")!;
    let chosenSkill = a1; // fallback: 다른 스킬 못 쓰면 A1
    for (const skill of c.skills) {
      if (skill.label === "A1") continue;
      if (skill.disabled) continue;
      if (skill.delayRemaining > 0) continue;
      if (skill.cooldownCurrent <= 0 && skill.cooldownMax > 0) {
        chosenSkill = skill;
        break;
      }
    }

    // 버프 적용: 모든 아군에게 적용, 시전자 본인만 justApplied 마킹
    for (const buff of chosenSkill.buffs) {
      if (buff.turns && buff.turns > 0) {
        for (const ally of champions) {
          applyOrRefreshBuff(ally, buff.name, buff.turns, chosenSkill.label);
        }
        // 시전자 본인의 버프만 justApplied (시전 턴 감소 방지)
        const casterBuff = c.activeBuffs.find((b) => b.name === buff.name);
        if (casterBuff) casterBuff.justApplied = true;
      }
    }

    // 버프 연장 효과 적용
    if (chosenSkill.buffExtend) {
      const ext = chosenSkill.buffExtend;
      if (ext.target === "all_allies") {
        for (const ally of champions) {
          for (const b of ally.activeBuffs) {
            b.remainingTurns += ext.value;
          }
        }
      } else if (ext.target === "other_allies") {
        for (const ally of champions) {
          if (ally !== c) {
            for (const b of ally.activeBuffs) {
              b.remainingTurns += ext.value;
            }
          }
        }
      }
    }

    // 클렌즈 효과: 디버프 제거
    if (chosenSkill.cleanse && chosenSkill.cleanse.length > 0) {
      for (const cl of chosenSkill.cleanse) {
        const targets =
          cl.target === "all_allies" ? champions :
          cl.target === "self" ? [c] :
          cl.target === "other_allies" ? champions.filter((a) => a !== c) :
          champions; // fallback
        for (const ally of targets) {
          if (ally.activeDebuffs.length === 0) continue;
          if (cl.count === "all") {
            ally.activeDebuffs = [];
          } else {
            // N개 랜덤 제거 (시뮬에서는 앞에서부터 제거)
            const removeCount = typeof cl.count === "number" ? cl.count : 1;
            ally.activeDebuffs.splice(0, removeCount);
          }
        }
      }
    }

    // 쿨다운 설정
    if (chosenSkill.cooldownMax > 0) {
      chosenSkill.cooldownCurrent = chosenSkill.cooldownMax;
    }

    // 행동 기록
    const currentTurnNum = bossActionCount;
    if (
      results.length === 0 ||
      results[results.length - 1].turnNumber !== currentTurnNum
    ) {
      results.push({ turnNumber: currentTurnNum, actions: [] });
    }
    // 턴미터 채우기 정보 생성
    let tmInfo: string | undefined;
    if (chosenSkill.tmFill.length > 0) {
      const fill = chosenSkill.tmFill[0];
      tmInfo = fill.target === "all_allies"
        ? `팀 TM+${fill.value}%`
        : `TM+${fill.value}%`;
    }

    // 행동 기록 (행동 전 TM 스냅샷 — 리셋 전 값)
    results[results.length - 1].actions.push({
      actor: c.displayName,
      actorImage: c.image,
      skill: chosenSkill.label,
      skillName: chosenSkill.name,
      activeBuffs: c.activeBuffs.map((b) => ({ ...b })),
      activeDebuffs: c.activeDebuffs.map((d) => ({ ...d })),
      tmFillInfo: tmInfo,
      isChampion: true,
      tmSnapshot: champions.map((ch) => ({
        name: ch.displayName.substring(0, 4),
        tm: Math.round(ch.turnMeter * 10000) / 10000,
      })),
      bossTm: Math.round(boss.turnMeter * 10000) / 10000,
    });

    // 턴미터 리셋: 행동 후 즉시 0으로 리셋 (TM Fill 전에 리셋해야 시전자도 자기 Fill 혜택 받음)
    c.turnMeter = 0;

    // 턴미터 채우기 효과 적용 (리셋 후 적용 — 시전자도 self-fill 유지)
    for (const tmFill of chosenSkill.tmFill) {
      if (tmFill.target === "all_allies") {
        for (const ally of champions) {
          ally.turnMeter += tmFill.value;
        }
      } else if (tmFill.target === "self") {
        c.turnMeter += tmFill.value;
      }
    }

    // 쿨다운 감소 효과 적용
    if (chosenSkill.cdReduce) {
      const cdR = chosenSkill.cdReduce;
      const reduceSkills = (target: SimParticipant) => {
        for (const sk of target.skills) {
          // targetSkillLabel이 있으면 해당 스킬만 쿨감 (예: 닌자 A3→A2만)
          if (cdR.targetSkillLabel && sk.label !== cdR.targetSkillLabel) continue;
          if (cdR.type === "reset") {
            sk.cooldownCurrent = 0;
          } else {
            sk.cooldownCurrent = Math.max(0, sk.cooldownCurrent - cdR.value);
          }
        }
      };

      if (cdR.target === "self") {
        reduceSkills(c);
      } else if (cdR.target === "all_allies") {
        for (const ally of champions) {
          reduceSkills(ally);
        }
      } else if (cdR.target === "other_allies") {
        for (const ally of champions) {
          if (ally !== c) reduceSkills(ally);
        }
      } else if (cdR.target === "target_ally") {
        // 타겟 지정된 챔피언 찾기
        if (chosenSkill.cdReduceTarget) {
          const target = champions.find(
            (a) => a.name === chosenSkill.cdReduceTarget || a.displayName === chosenSkill.cdReduceTarget
          );
          if (target && target !== c) reduceSkills(target);
        } else {
          // 타겟 미지정 시: HP가 가장 낮은 아군 (보스 스턴 타겟과 동일 로직)
          // 간단하게 첫 번째 다른 아군에게 사용
          const other = champions.find((a) => a !== c);
          if (other) reduceSkills(other);
        }
      }
    }

    // Extra Turn: 즉시 추가 턴 1회 (Extra Turn 중에는 발동 안 함)
    if (chosenSkill.extraTurn && !c.isExtraTurn) {
      c.extraTurnPending = true;
    }

    // 턴 끝: 버프 감소 + 쿨다운/딜레이 감소 (justApplied인 버프는 감소 안 함)
    finalizeChampionTurn(c, chosenSkill);
  }

  // 시뮬레이션 루프 — DeadwoodJedi 방식
  // 매 반복: 틱 먼저 → TM >= 100 확인 → 가장 높은 1명 행동 → TM = 0
  type Actor =
    | { type: "champion"; ref: SimParticipant }
    | { type: "boss"; ref: BossParticipant };

  while (bossActionCount < maxTurns && safetyCounter < MAX_ITERATIONS) {
    safetyCounter++;

    // Extra Turn 처리: Extra Turn 대기 중인 챔피언이 틱 없이 즉시 1회 행동
    let extraTurnHandled = false;
    for (const c of champions) {
      if (c.extraTurnPending) {
        c.extraTurnPending = false;
        c.isExtraTurn = true;
        championTakeTurn(c);
        c.isExtraTurn = false;
        extraTurnHandled = true;
        break;
      }
    }
    if (extraTurnHandled) continue;

    // 매 행동 후 반드시 1틱 진행 (DWJ 모델)
    // 틱 → ≥100 확인 → 행동 → 다시 틱 (추가 턴만 예외로 틱 생략)
    for (const c of champions) {
      let eff = c.speed;
      // 속도 버프/디버프는 합연산 (게임 내 동작: +30% -15% = +15%, 곱연산 아님)
      let spdMod = 0;
      if (c.activeBuffs.some((b) => b.name === "Increase SPD")) spdMod += 0.3;
      if (c.activeBuffs.some((b) => b.name === "Decrease SPD") ||
          c.activeDebuffs.some((b) => b.name === "Decrease SPD")) spdMod -= 0.15;
      eff *= (1 + spdMod);
      c.turnMeter += eff * TICK_RATE;
    }
    boss.turnMeter += boss.speed * TICK_RATE;

    // 틱 후 TM >= 100인 참가자 중 가장 높은 TM 행동 (동률 시 슬롯 순서 타이브레이커)
    let actor: Actor | null = null;
    let bestTm = -1;
    let bestSlot = Infinity; // 슬롯 번호 낮을수록 우선 (리더=0)

    for (const c of champions) {
      if (c.turnMeter >= 100 - 0.001) {
        if (
          c.turnMeter > bestTm + 0.001 ||
          (Math.abs(c.turnMeter - bestTm) <= 0.001 && c.slotIndex < bestSlot)
        ) {
          actor = { type: "champion", ref: c };
          bestTm = c.turnMeter;
          bestSlot = c.slotIndex;
        }
      }
    }
    if (boss.turnMeter >= 100 - 0.001) {
      if (boss.turnMeter > bestTm + 0.001) {
        actor = { type: "boss", ref: boss };
      }
    }

    if (!actor) continue; // 아직 아무도 100 안넘음 → 다음 틱

    if (actor.type === "champion") {
      const c = actor.ref as SimParticipant;
      championTakeTurn(c);
    } else {
      // 보스 턴 — 로테이션은 모든 속성 동일: AOE1 → AOE2 → STUN
      const bossSkill = BOSS_ROTATION[boss.rotationIndex % 3] as BossSkill;
      boss.rotationIndex++;

      const currentTurnNum = bossActionCount;
      if (
        results.length === 0 ||
        results[results.length - 1].turnNumber !== currentTurnNum
      ) {
        results.push({ turnNumber: currentTurnNum, actions: [] });
      }

      // 보스 속성별 디버프 적용 (afterSkill과 일치하는 스킬에서만)
      const affinityDebuff = BOSS_AFFINITY_DEBUFFS[bossAffinity];
      const debuffApplied = affinityDebuff && bossSkill === affinityDebuff.afterSkill;
      if (debuffApplied && affinityDebuff) {
        for (const c of champions) {
          // Block Debuffs가 있으면 디버프 무효화
          const hasBlockDebuffs = c.activeBuffs.some((b) => b.name === "Block Debuffs");
          if (!hasBlockDebuffs) {
            // Poison은 스피드튠에 영향 없으므로 스킵 (데미지 계산기에서만 처리)
            if (affinityDebuff.name === "Poison") continue;
            // 디버프 적용 (동일 디버프 갱신)
            const existing = c.activeDebuffs.findIndex((d) => d.name === affinityDebuff.name);
            if (existing >= 0) {
              c.activeDebuffs[existing].remainingTurns = affinityDebuff.turns;
              c.activeDebuffs[existing].justApplied = true;
            } else {
              c.activeDebuffs.push({
                name: affinityDebuff.name,
                remainingTurns: affinityDebuff.turns,
                sourceSkill: bossSkill,
                justApplied: true,
              });
            }
          }
        }
      }

      // 행동 기록 (행동 전 TM 스냅샷 — 리셋 전 값)
      results[results.length - 1].actions.push({
        actor: "Clanboss",
        skill: bossSkill,
        skillName: `${bossSkill}${debuffApplied && affinityDebuff ? ` [${affinityDebuff.name}]` : ""}`,
        activeBuffs: [],
        isChampion: false,
        tmSnapshot: champions.map((ch) => ({
          name: ch.displayName.substring(0, 4),
          tm: Math.round(ch.turnMeter * 10000) / 10000,
        })),
        bossTm: Math.round(boss.turnMeter * 10000) / 10000,
      });

      // 보스도 TM 리셋 (0으로)
      boss.turnMeter = 0;
      bossActionCount++;
    }
  }

  return results;
}

// 버프 이름 → 짧은 표시 & 색상
const BUFF_DISPLAY: Record<string, { short: string; color: string }> = {
  Unkillable: { short: "불사", color: "bg-yellow-500/30 text-yellow-300" },
  "Block Damage": {
    short: "뎀블",
    color: "bg-emerald-500/30 text-emerald-300",
  },
  "Block Debuffs": {
    short: "디블",
    color: "bg-cyan-500/30 text-cyan-300",
  },
  Shield: { short: "쉴드", color: "bg-blue-500/30 text-blue-300" },
  "Increase DEF": { short: "방증", color: "bg-green-500/30 text-green-300" },
  "Increase ATK": { short: "공증", color: "bg-red-500/30 text-red-300" },
  "Increase SPD": { short: "속증", color: "bg-sky-500/30 text-sky-300" },
  "Increase C.RATE": {
    short: "크확",
    color: "bg-orange-500/30 text-orange-300",
  },
  "Increase C.DMG": {
    short: "크뎀",
    color: "bg-orange-500/30 text-orange-300",
  },
  "Increase ACC": { short: "적중", color: "bg-teal-500/30 text-teal-300" },
  "Increase RES": { short: "저항", color: "bg-indigo-500/30 text-indigo-300" },
  Strengthen: { short: "강화", color: "bg-lime-500/30 text-lime-300" },
  Counterattack: { short: "역공", color: "bg-amber-500/30 text-amber-300" },
  "Counter Attack": { short: "역공", color: "bg-amber-500/30 text-amber-300" },
  "Continuous Heal": {
    short: "지힐",
    color: "bg-green-500/30 text-green-300",
  },
  "Ally Protection": {
    short: "보호",
    color: "bg-blue-500/30 text-blue-300",
  },
  "Revive On Death": {
    short: "부활",
    color: "bg-purple-500/30 text-purple-300",
  },
  "Reflect Damage": { short: "반사", color: "bg-pink-500/30 text-pink-300" },
  "Perfect Veil": { short: "은신", color: "bg-violet-500/30 text-violet-300" },
  Veil: { short: "은신", color: "bg-violet-500/30 text-violet-300" },
  "Stone Skin": { short: "석피", color: "bg-gray-500/30 text-gray-300" },
  Taunt: { short: "도발", color: "bg-rose-500/30 text-rose-300" },
};

const DEBUFF_DISPLAY: Record<string, { short: string; color: string }> = {
  "Decrease DEF": { short: "방감", color: "bg-red-600/30 text-red-400" },
  "Decrease ATK": { short: "공감", color: "bg-red-600/30 text-red-400" },
  "Decrease SPD": { short: "속감", color: "bg-red-600/30 text-red-400" },
  Weaken: { short: "약화", color: "bg-red-600/30 text-red-400" },
  Poison: { short: "독", color: "bg-green-600/30 text-green-400" },
  "HP Burn": { short: "화상", color: "bg-orange-600/30 text-orange-400" },
  Stun: { short: "기절", color: "bg-yellow-600/30 text-yellow-400" },
  Provoke: { short: "도발", color: "bg-rose-600/30 text-rose-400" },
  Freeze: { short: "빙결", color: "bg-cyan-600/30 text-cyan-400" },
  Sleep: { short: "수면", color: "bg-indigo-600/30 text-indigo-400" },
  Fear: { short: "공포", color: "bg-purple-600/30 text-purple-400" },
  "True Fear": { short: "진공포", color: "bg-purple-600/30 text-purple-400" },
  Leech: { short: "흡혈", color: "bg-pink-600/30 text-pink-400" },
};

const BOSS_SKILL_COLORS: Record<string, string> = {
  AOE1: "text-blue-400",
  AOE2: "text-blue-400",
  STUN: "text-red-400",
};

// TM 스냅샷 행 (디버그용)
function TmSnapshotRow({ snapshot, bossTm }: { snapshot: { name: string; tm: number }[]; bossTm: number }) {
  const allTms = [...snapshot.map(s => s.tm), bossTm];
  const maxTm = Math.max(...allTms);
  return (
    <div className="px-3 pb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] font-mono text-gray-500">
      {snapshot.map((s, i) => {
        const isMax = Math.abs(s.tm - maxTm) < 0.001;
        return (
          <span key={i} className={isMax ? "text-yellow-300 font-bold" : ""}>
            {s.name} {s.tm.toFixed(4)}
          </span>
        );
      })}
      <span className={Math.abs(bossTm - maxTm) < 0.001 ? "text-yellow-300 font-bold" : "text-red-400/70"}>
        Boss {bossTm.toFixed(4)}
      </span>
    </div>
  );
}

// 시뮬레이션 결과 컴포넌트
const SimulationResults = React.memo(function SimulationResults({ results }: { results: SimTurn[] }) {
  const [showTm, setShowTm] = useState(false);
  if (results.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex justify-end mb-1">
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showTm}
            onChange={(e) => setShowTm(e.target.checked)}
            className="accent-gold"
          />
          TM 디버그
        </label>
      </div>
      {results.map((turn) => (
        <div
          key={turn.turnNumber}
          className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg overflow-hidden"
        >
          {turn.actions.map((action, actionIdx) => (
            <div
              key={actionIdx}
              className={`${
                !action.isChampion ? "bg-[#0f0f1a]" : ""
              } ${actionIdx > 0 ? "border-t border-[#2a2a4a]/50" : ""}`}
            >
            <div className="flex items-center px-3 py-1.5">
              {/* Actor Name */}
              <div className="w-28 flex-shrink-0">
                {action.isChampion ? (
                  <div className="flex items-center gap-1.5">
                    <img
                      src={action.actorImage}
                      alt=""
                      className="w-5 h-5 rounded object-cover"
                    />
                    <span className="text-xs text-gray-300 truncate">
                      {action.actor}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-gray-500 font-semibold">
                    Clanboss
                  </span>
                )}
              </div>

              {/* Buffs + TM fill 표시 */}
              <div className="flex-1 flex flex-wrap gap-0.5 px-2">
                {action.activeBuffs.map((buff, i) => {
                  const display = BUFF_DISPLAY[buff.name];
                  return (
                    <span
                      key={`b-${i}`}
                      className={`text-[9px] px-1 py-0.5 rounded ${
                        display?.color || "bg-green-500/20 text-green-400"
                      }`}
                      title={`${buff.name} (${buff.remainingTurns}턴)`}
                    >
                      {display?.short || buff.name}
                    </span>
                  );
                })}
                {action.activeDebuffs?.map((debuff, i) => {
                  const display = DEBUFF_DISPLAY[debuff.name];
                  return (
                    <span
                      key={`d-${i}`}
                      className={`text-[9px] px-1 py-0.5 rounded ${
                        display?.color || "bg-red-600/20 text-red-400"
                      }`}
                      title={`${debuff.name} (${debuff.remainingTurns}턴) ⚠️ 디버프`}
                    >
                      {display?.short || debuff.name}
                    </span>
                  );
                })}
                {action.tmFillInfo && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-sky-500/20 text-sky-300">
                    {action.tmFillInfo}
                  </span>
                )}
              </div>

              {/* Skill */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`text-xs font-mono font-semibold ${
                    action.isChampion
                      ? "text-gold"
                      : BOSS_SKILL_COLORS[action.skill] || "text-gray-400"
                  }`}
                >
                  {action.skill}
                </span>
                {!action.isChampion && action.skillName !== action.skill && (
                  <span className="text-[9px] text-red-400/70">
                    {action.skillName.replace(action.skill, "").trim()}
                  </span>
                )}
              </div>

              {/* Turn number (보스 행동에만) */}
              <div className="w-12 text-right flex-shrink-0">
                {!action.isChampion && (
                  <span className="text-[10px] text-gray-600 font-mono">
                    Turn {turn.turnNumber}
                  </span>
                )}
              </div>
            </div>
            {showTm && action.tmSnapshot && <TmSnapshotRow snapshot={action.tmSnapshot} bossTm={action.bossTm ?? 0} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

// ── 프리셋 시스템 ────────────────────────────────────
interface DeckPreset {
  id: string;
  name: string;
  createdAt: number;
  data: DeckData;
}

interface DeckData {
  slots: {
    slug: string | null;
    speed: number;
    speedAura: number;
    skillConfigs: SkillConfig[];
    steelEpic: boolean;
    setBonusPct: number;
  }[];
  bossDifficulty: string;
  bossAffinity: string;
  regionBonus: boolean;
  regionBonusValue: number;
}

const PRESET_STORAGE_KEY = "rsl_cb_presets";

function loadPresets(): DeckPreset[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function savePresetsLocal(presets: DeckPreset[]) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

// ── Supabase 프리셋 CRUD ──────────────────────────────
async function dbLoadPresets(userId: string): Promise<DeckPreset[]> {
  const { data, error } = await getSupabase()
    .from("clan_boss_presets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map((row: { id: string; name: string; deck_data: DeckData; created_at: string }) => ({
    id: row.id,
    name: row.name,
    createdAt: new Date(row.created_at).getTime(),
    data: row.deck_data as DeckData,
  }));
}

async function dbCreatePreset(userId: string, name: string, deckData: DeckData): Promise<DeckPreset | null> {
  const { data, error } = await getSupabase()
    .from("clan_boss_presets")
    .insert({ user_id: userId, name, deck_data: deckData })
    .select()
    .single();
  if (error || !data) return null;
  return { id: data.id, name: data.name, createdAt: new Date(data.created_at).getTime(), data: data.deck_data as DeckData };
}

async function dbUpdatePreset(presetId: string, deckData: DeckData): Promise<boolean> {
  const { error } = await getSupabase()
    .from("clan_boss_presets")
    .update({ deck_data: deckData })
    .eq("id", presetId);
  return !error;
}

async function dbDeletePreset(presetId: string): Promise<void> {
  await getSupabase().from("clan_boss_presets").delete().eq("id", presetId);
}

function slotsToData(slots: SlotData[]): DeckData["slots"] {
  return slots.map((s) => ({
    slug: s.champion?.slug || null,
    speed: s.speed,
    speedAura: s.speedAura,
    skillConfigs: s.skillConfigs,
    steelEpic: s.steelEpic,
    setBonusPct: s.setBonusPct,
  }));
}

// 공유 링크용 압축 인코딩: 필수 데이터만, 키 축약, 기본값 생략
function encodeDeck(data: DeckData): string {
  const compact: Record<string, unknown> = {};
  // 슬롯: 챔피언 있는 것만
  const slots = data.slots
    .filter((s) => s.slug)
    .map((s) => {
      const o: Record<string, unknown> = { s: s.slug, v: s.speed };
      if (s.speedAura) o.a = s.speedAura;
      if (s.steelEpic) o.e = 1;
      if (s.setBonusPct) o.b = s.setBonusPct;
      // skillConfigs: 전체 저장 (우선순위 포함), 키 축약
      const sc = s.skillConfigs.map((c) => {
        const r: Record<string, unknown> = { l: c.label, p: c.priority };
        if (c.cooldown) r.cd = c.cooldown;
        if (c.disabled) r.d = 1;
        if (c.delay > 0) r.w = c.delay;
        if (c.cdReduceTarget) r.t = c.cdReduceTarget;
        return r;
      });
      if (sc.length > 0) o.c = sc;
      return o;
    });
  compact.s = slots;
  if (data.bossDifficulty !== "Ultra Nightmare") compact.d = data.bossDifficulty;
  if (data.bossAffinity !== "Void") compact.f = data.bossAffinity;
  if (data.regionBonus) { compact.r = 1; compact.rv = data.regionBonusValue; }
  return btoa(JSON.stringify(compact));
}

// 압축 해시 디코딩 (새 형식 + 구 형식 모두 지원)
function decodeDeck(hash: string): DeckData | null {
  try {
    const raw = atob(hash);
    // 구 형식: encodeURIComponent된 JSON (slots 키가 있으면 구 형식)
    if (raw.startsWith("%7B")) {
      return JSON.parse(decodeURIComponent(raw));
    }
    const c = JSON.parse(raw);
    if (c.slots) return c as DeckData; // 구 형식 (비인코딩)
    // 새 압축 형식
    const emptySlot = { slug: null, speed: 0, speedAura: 0, skillConfigs: [], steelEpic: false, setBonusPct: 0 };
    const slots = Array.from({ length: 5 }, (_, i) => {
      const src = c.s?.[i];
      if (!src) return { ...emptySlot };
      return {
        slug: src.s,
        speed: src.v || 0,
        speedAura: src.a || 0,
        skillConfigs: (src.c || []).map((sc: Record<string, unknown>) => ({
          label: sc.l as string,
          cooldown: (sc.cd as number) || 0,
          priority: (sc.p as number) ?? 0,
          disabled: !!sc.d,
          delay: (sc.w as number) || 0,
          cdReduceTarget: sc.t as string | undefined,
        })),
        steelEpic: !!src.e,
        setBonusPct: src.b || 0,
      };
    });
    return {
      slots,
      bossDifficulty: c.d || "Ultra Nightmare",
      bossAffinity: c.f || "Void",
      regionBonus: !!c.r,
      regionBonusValue: c.rv || 0,
    };
  } catch { return null; }
}

function createSlotData(): SlotData {
  return {
    champion: null,
    speed: 0,
    speedAura: 0,
    skillConfigs: [],
    steelEpic: false,
    setBonusPct: 0,
  };
}

function buildSkillConfigs(champion: Champion): SkillConfig[] {
  const activeSkills = getActiveSkills(champion);
  // A2+ 스킬만 우선순위 부여 (A1은 항상 fallback)
  const nonA1Skills = activeSkills.filter((s) => s.label !== "A1");
  const lastNonA1 = nonA1Skills.length - 1;
  return activeSkills.map((s) => {
    if (s.label === "A1") {
      return { label: "A1", cooldown: 0, priority: 999, disabled: false, delay: 0 };
    }
    const idx = nonA1Skills.indexOf(s);
    return {
      label: s.label,
      cooldown: s.cooldown, // 원본 쿨타임 (북 미적용)
      priority: lastNonA1 - idx, // A3 → A2 (높은 스킬 우선)
      disabled: false,
      delay: 0,
    };
  });
}

export default function ClanBossPage() {
  const { user, signInWithGoogle } = useAuth();
  const isLoggedIn = !!user;
  const [champions, setChampions] = useState<Champion[]>([]);
  const [krNames, setKrNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState<SlotData[]>(
    Array.from({ length: 5 }, createSlotData)
  );
  const [searchSlot, setSearchSlot] = useState<number | null>(null);
  const [bossDifficulty, setBossDifficulty] =
    useState<string>("Ultra Nightmare");
  const [regionBonus, setRegionBonus] = useState(false);
  const [regionBonusValue, setRegionBonusValue] = useState<number>(0);
  const [bossAffinity, setBossAffinity] = useState<string>("Void");
  const [simResults, setSimResults] = useState<SimTurn[]>([]);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeeds, setSimSpeeds] = useState<{ name: string; speed: number }[]>(
    []
  );
  const [presets, setPresets] = useState<DeckPreset[]>([]);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const presetMenuRef = useRef<HTMLDivElement>(null);

  // 토스트
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 2000);
  }, []);

  // 로그인 시 Supabase에서 프리셋 로드
  useEffect(() => {
    if (user?.id) {
      dbLoadPresets(user.id).then((p) => setPresets(p));
    }
  }, [user?.id]);

  // 프리셋 메뉴 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (presetMenuRef.current && !presetMenuRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/data/champions_unified.json").then((r) => r.json()),
      fetch("/data/champion_names_kr.json").then((r) => r.json()).catch(() => ({})),
    ]).then(([data, kr]: [Champion[], Record<string, string>]) => {
        setChampions(data);
        setKrNames(kr);
        setLoading(false);

        // 프리셋 로드 — 로그인한 경우에만 (비로그인은 프리셋 잠금)
        // (로그인 시 Supabase 로드는 위 useEffect에서 처리)

        // URL에서 공유 덱 불러오기 (?d= 또는 #해시)
        const params = new URLSearchParams(window.location.search);
        const shareId = params.get("d");
        const hash = window.location.hash.slice(1);
        if (shareId) {
          // Supabase 짧은 코드
          getSupabase()
            .from("shared_decks")
            .select("deck_data")
            .eq("id", shareId)
            .single()
            .then(({ data: row }) => {
              if (row?.deck_data) {
                applyDeckData(row.deck_data as DeckData, data);
                window.history.replaceState(null, "", window.location.pathname);
                showToast("공유된 덱을 불러왔습니다!");
              }
            });
        } else if (hash) {
          // 구 해시 방식 (하위 호환)
          const deckData = decodeDeck(hash);
          if (deckData) {
            applyDeckData(deckData, data);
            window.history.replaceState(null, "", window.location.pathname);
            showToast("공유된 덱을 불러왔습니다!");
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load champions:", err);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 덱 데이터를 상태에 적용
  const applyDeckData = useCallback((data: DeckData, champList?: Champion[]) => {
    const list = champList || champions;
    const newSlots = data.slots.map((sd) => {
      if (!sd.slug) return createSlotData();
      const champ = list.find((c) => c.slug === sd.slug) || null;
      // skillConfigs가 비어있으면 챔피언 기본 설정 생성
      const configs = (champ && sd.skillConfigs.length === 0)
        ? buildSkillConfigs(champ)
        : sd.skillConfigs;
      return {
        champion: champ,
        speed: sd.speed,
        speedAura: sd.speedAura,
        skillConfigs: configs,
        steelEpic: sd.steelEpic,
        setBonusPct: sd.setBonusPct,
      } as SlotData;
    });
    // 5개 슬롯 보장
    while (newSlots.length < 5) newSlots.push(createSlotData());
    setSlots(newSlots);
    setBossDifficulty(data.bossDifficulty || "Ultra Nightmare");
    setBossAffinity(data.bossAffinity || "Void");
    setRegionBonus(data.regionBonus || false);
    setRegionBonusValue(data.regionBonusValue || 0);
    clearSimulation();
  }, [champions]);

  // 현재 상태 → DeckData
  const getCurrentDeckData = useCallback((): DeckData => ({
    slots: slotsToData(slots),
    bossDifficulty,
    bossAffinity,
    regionBonus,
    regionBonusValue,
  }), [slots, bossDifficulty, bossAffinity, regionBonus, regionBonusValue]);

  // 프리셋 저장 (최대 10개)
  const handleSavePreset = useCallback(async () => {
    const name = savePresetName.trim();
    if (!name) return;
    const deckData = getCurrentDeckData();

    // 같은 이름의 기존 프리셋이 있으면 덮어쓰기
    const existing = presets.find((p) => p.name === name);
    if (existing) {
      if (!confirm(`"${name}" 프리셋이 이미 존재합니다. 덮어쓰시겠습니까?`)) return;
      if (isLoggedIn) {
        await dbUpdatePreset(existing.id, deckData);
      }
      const updated = presets.map((p) =>
        p.id === existing.id ? { ...p, data: deckData, createdAt: Date.now() } : p
      );
      setPresets(updated);
      if (!isLoggedIn) savePresetsLocal(updated);
      setSaveDialogOpen(false);
      setSavePresetName("");
      showToast(`"${name}" 덮어쓰기 완료!`);
      return;
    }

    if (presets.length >= 10) {
      showToast("프리셋은 최대 10개까지 저장할 수 있습니다.");
      return;
    }

    if (isLoggedIn && user) {
      const created = await dbCreatePreset(user.id, name, deckData);
      if (created) {
        setPresets((prev) => [created, ...prev]);
      }
    } else {
      const newPreset: DeckPreset = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name,
        createdAt: Date.now(),
        data: deckData,
      };
      const updated = [newPreset, ...presets];
      setPresets(updated);
      savePresetsLocal(updated);
    }
    setSaveDialogOpen(false);
    setSavePresetName("");
    showToast(`"${name}" 저장 완료!`);
  }, [savePresetName, getCurrentDeckData, presets, showToast, isLoggedIn, user]);

  // 프리셋 삭제
  const handleDeletePreset = useCallback(async (id: string) => {
    if (isLoggedIn) {
      await dbDeletePreset(id);
    }
    const updated = presets.filter((p) => p.id !== id);
    setPresets(updated);
    if (!isLoggedIn) savePresetsLocal(updated);
  }, [presets, isLoggedIn]);

  // 프리셋 공유 링크 복사 (Supabase 짧은 코드)
  const handleSharePreset = useCallback(async (preset: DeckPreset) => {
    showToast("공유 링크 생성 중...");
    try {
      const { data, error } = await getSupabase()
        .from("shared_decks")
        .insert({ deck_data: preset.data, user_id: user?.id || null })
        .select("id")
        .single();
      if (error || !data) throw error;
      const url = `${window.location.origin}${window.location.pathname}?d=${data.id}`;
      await navigator.clipboard.writeText(url).catch(() => {
        const input = document.createElement("input");
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      });
      showToast(`"${preset.name}" 공유 링크가 복사되었습니다!`);
    } catch {
      // Supabase 실패 시 기존 해시 방식 fallback
      const hash = encodeDeck(preset.data);
      const url = `${window.location.origin}${window.location.pathname}#${hash}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      showToast(`"${preset.name}" 링크 복사됨 (긴 링크)`);
    }
  }, [showToast]);

  const clearSimulation = () => {
    setSimResults([]);
    setSimRunning(false);
  };

  const handleSelectChampion = (champ: Champion) => {
    if (searchSlot === null) return;
    setSlots((prev) => {
      const next = [...prev];
      next[searchSlot] = {
        ...next[searchSlot],
        champion: champ,
        skillConfigs: buildSkillConfigs(champ),
      };
      return next;
    });
    setSearchSlot(null);
    clearSimulation();
  };

  const handleUpdateSlot = useCallback((index: number, updated: Partial<SlotData>) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updated };
      return next;
    });
    clearSimulation();
  }, []);

  const handleRemove = useCallback((index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = createSlotData();
      return next;
    });
    clearSimulation();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gold animate-pulse">데이터 로딩 중...</div>
      </div>
    );
  }

  const activeSlots = slots.filter((s) => s.champion !== null);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gold">클랜보스 계산기</h1>
          <p className="text-sm text-gray-500 mt-1">
            5명의 챔피언을 선택하고 스피드를 입력하여 턴별 버프 유지 여부를
            시뮬레이션합니다.
          </p>
        </div>

        {/* 프리셋 드롭다운 */}
        <div ref={presetMenuRef} className="relative flex-shrink-0">
          <button
            onClick={() => {
              if (!isLoggedIn) {
                setPresetMenuOpen(!presetMenuOpen);
                return;
              }
              setPresetMenuOpen(!presetMenuOpen);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer border ${
              presetMenuOpen
                ? "bg-gold/10 border-gold/50 text-gold"
                : "bg-card border-card-border text-gray-400 hover:border-gold/30 hover:text-gray-300"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            내 프리셋
            {isLoggedIn && presets.length > 0 && (
              <span className="bg-gold/20 text-gold text-[10px] px-1.5 py-0.5 rounded-full font-bold">{presets.length}</span>
            )}
            {!isLoggedIn && (
              <svg className="w-3 h-3 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            )}
            <svg className={`w-3 h-3 transition-transform ${presetMenuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {presetMenuOpen && (
            <div className="absolute top-full mt-1 right-0 bg-[#12122a] border border-gray-700 rounded-xl shadow-2xl z-50 min-w-[280px] overflow-hidden">
              {!isLoggedIn ? (
                <div className="px-4 py-8 text-center">
                  <svg className="w-10 h-10 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-gray-300 text-sm font-medium mb-1">로그인이 필요합니다</p>
                  <p className="text-gray-600 text-xs mb-4">프리셋을 저장하고 불러오려면<br/>Google 계정으로 로그인해주세요.</p>
                  <button
                    onClick={() => { signInWithGoogle(); setPresetMenuOpen(false); }}
                    className="bg-gold text-background px-5 py-2 rounded-lg font-semibold text-sm hover:bg-gold-dark transition-colors cursor-pointer"
                  >
                    Google로 로그인
                  </button>
                </div>
              ) : presets.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <svg className="w-8 h-8 mx-auto text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <p className="text-gray-600 text-xs">저장된 프리셋이 없습니다</p>
                  <p className="text-gray-700 text-[10px] mt-1">챔피언을 세팅한 후 저장해보세요</p>
                </div>
              ) : (
                <div className="max-h-[350px] overflow-y-auto">
                  {presets.map((preset) => {
                    const champNames = preset.data.slots
                      .filter((s) => s.slug)
                      .map((s) => {
                        const found = champions.find(c => c.slug === s.slug);
                        return found?.display_name || s.slug;
                      });
                    return (
                      <div key={preset.id} className="group border-b border-gray-800 last:border-b-0 hover:bg-gray-800/40 transition-colors">
                        <button
                          onClick={() => {
                            applyDeckData(preset.data);
                            setPresetMenuOpen(false);
                            showToast(`"${preset.name}" 불러옴!`);
                          }}
                          className="w-full text-left px-4 py-3 cursor-pointer"
                        >
                          <div className="text-sm text-white font-medium">{preset.name}</div>
                          <div className="text-[10px] text-gray-500 mt-0.5 truncate">
                            {champNames.join(", ") || "빈 덱"}
                          </div>
                        </button>
                        <div className="flex px-2 pb-2 gap-1 -mt-1">
                          <button
                            onClick={() => handleSharePreset(preset)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-blue-400 rounded transition-colors cursor-pointer"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            공유
                          </button>
                          <button
                            onClick={() => handleDeletePreset(preset.id)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] text-gray-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            삭제
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Boss Difficulty + Affinity */}
      <div className="mb-6 bg-card border border-card-border rounded-xl p-4">
        <div className="flex items-start justify-between gap-4">
          {/* 난이도 */}
          <div className="flex-1">
            <label className="text-sm text-gray-400 block mb-2">
              클랜보스 난이도
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(BOSS_SPEEDS).map(([name, speed]) => (
                <button
                  key={name}
                  onClick={() => setBossDifficulty(name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    bossDifficulty === name
                      ? "bg-gold text-background"
                      : "bg-input-bg border border-input-border text-gray-400 hover:border-gold/50"
                  }`}
                >
                  {name}{" "}
                  <span className="text-[10px] opacity-70">SPD {speed}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 보스 속성 */}
          <div className="flex-shrink-0">
            <label className="text-sm text-gray-400 block mb-2">
              보스 속성
            </label>
            <select
              value={bossAffinity}
              onChange={(e) => setBossAffinity(e.target.value)}
              className={`bg-input-bg border border-input-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gold cursor-pointer ${AFFINITY_COLORS[bossAffinity] || "text-white"}`}
            >
              <option value="Void" className="text-purple-400">Void</option>
              <option value="Magic" className="text-blue-400">Magic</option>
              <option value="Force" className="text-red-400">Force</option>
              <option value="Spirit" className="text-green-400">Spirit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Champion Slots */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
        {slots.map((slot, i) => (
          <ChampionSlot
            key={i}
            slot={slot}
            index={i}
            allSlots={slots}
            onOpenSearch={() => setSearchSlot(i)}
            onUpdate={(updated) => handleUpdateSlot(i, updated)}
            onRemove={() => handleRemove(i)}
          />
        ))}
      </div>

      {/* Simulate Button + Region Bonus + Preset/Share */}
      {activeSlots.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {/* 지역보너스 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400 whitespace-nowrap">
                지역보너스
              </label>
              <button
                onClick={() => setRegionBonus(!regionBonus)}
                className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${
                  regionBonus ? "bg-emerald-500" : "bg-input-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    regionBonus ? "translate-x-5" : ""
                  }`}
                />
              </button>
              {regionBonus && (
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={regionBonusValue || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setRegionBonusValue(
                      Math.min(20, Math.max(0, v))
                    );
                  }}
                  placeholder="2~20"
                  className="w-16 bg-input-bg border border-emerald-500/30 rounded-lg px-2 py-1 text-sm text-emerald-400 placeholder-gray-600 outline-none focus:border-emerald-500 text-center font-mono"
                />
              )}
            </div>

            {/* 시뮬레이션 시작 */}
            <button
              onClick={() => {
                const bossSpd = BOSS_SPEEDS[bossDifficulty] || 190;
                const aura = slots[0].speedAura || 0;
                const rb = regionBonus ? regionBonusValue : 0;
                const results = runSimulation(slots, bossSpd, aura, rb, 50, bossAffinity);
                setSimResults(results);
                setSimRunning(true);
                const speeds: { name: string; speed: number }[] = [];
                for (const slot of slots) {
                  if (!slot.champion) continue;
                  const s = calcSimSpeed(
                    slot.speed,
                    slot.champion.base_speed,
                    slot.setBonusPct,
                    slot.steelEpic,
                    aura,
                    rb
                  );
                  speeds.push({
                    name: slot.champion.display_name,
                    speed: Math.round(s * 100) / 100,
                  });
                }
                setSimSpeeds(speeds);
              }}
              className="bg-gold text-background px-8 py-3 rounded-xl font-semibold hover:bg-gold-dark transition-colors cursor-pointer"
            >
              시뮬레이션 시작
            </button>

            {/* 저장 */}
            <button
              onClick={() => {
                if (!isLoggedIn) {
                  showToast("프리셋 저장은 로그인 후 이용 가능합니다.");
                  return;
                }
                if (presets.length >= 10) {
                  showToast("프리셋은 최대 10개까지 저장할 수 있습니다.");
                  return;
                }
                setSaveDialogOpen(true);
              }}
              className={`flex items-center gap-1.5 bg-input-bg border border-input-border px-3 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                isLoggedIn
                  ? "text-gray-400 hover:border-gold/50 hover:text-gold"
                  : "text-gray-600 hover:border-gray-600"
              }`}
              title={isLoggedIn ? "현재 덱을 프리셋으로 저장" : "로그인 후 이용 가능"}
            >
              {!isLoggedIn ? (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
              )}
              프리셋 저장 {isLoggedIn ? `(${presets.length}/10)` : "🔒"}
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-2 text-center">
            {activeSlots.length}/5 챔피언 선택됨
            {slots[0].speedAura > 0 &&
              ` · 스피드 오라: ${slots[0].speedAura}%`}
            {regionBonus &&
              regionBonusValue > 0 &&
              ` · 지역보너스: +${regionBonusValue}`}
          </p>
        </div>
      )}

      {/* 저장 다이얼로그 */}
      {saveDialogOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSaveDialogOpen(false)}>
          <div className="bg-[#1a1a2e] border border-gray-700 rounded-xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-bold mb-4">덱 프리셋 저장</h3>
            <div className="mb-2">
              <div className="text-[10px] text-gray-500 mb-2">
                {slots.filter((s) => s.champion).map((s) => s.champion!.display_name).join(", ") || "챔피언 없음"}
              </div>
              <input
                type="text"
                value={savePresetName}
                onChange={(e) => setSavePresetName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); }}
                placeholder="프리셋 이름 (예: 불사덱 기본)"
                className="w-full bg-input-bg border border-input-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-gold"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setSaveDialogOpen(false); setSavePresetName(""); }}
                className="px-4 py-2 text-gray-400 text-sm hover:text-white transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                onClick={handleSavePreset}
                disabled={!savePresetName.trim()}
                className="px-4 py-2 bg-gold text-background rounded-lg text-sm font-semibold hover:bg-gold-dark transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 메시지 */}
      {toastMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-2xl z-50 animate-[fadeIn_0.2s_ease-out]">
          {toastMsg}
        </div>
      )}

      {/* Simulation Results */}
      <div className="bg-card border border-card-border rounded-xl p-4">
        <h2 className="text-lg font-semibold text-white mb-4">
          시뮬레이션 결과
        </h2>
        {simRunning && simResults.length > 0 ? (
          <>
            {simSpeeds.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-3 px-1">
                {simSpeeds.map((s, i) => (
                  <span key={i} className="text-[10px] font-mono text-gray-500">
                    {s.name.substring(0, 8)}: <span className="text-gray-400">{s.speed}</span>
                  </span>
                ))}
                <span className="text-[10px] font-mono text-red-400/60">
                  Boss: {BOSS_SPEEDS[bossDifficulty] || 190}
                </span>
              </div>
            )}
            <SimulationResults results={simResults} />
          </>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <svg
              className="w-12 h-12 mx-auto mb-3 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">
              챔피언을 선택하고 스피드를 입력한 뒤
              <br />
              시뮬레이션을 시작하세요.
            </p>
            <p className="text-xs text-gray-600 mt-2">
              각 턴마다 보스가 공격하기 전 버프 유지 여부를 확인합니다.
            </p>
          </div>
        )}
      </div>

      {/* Champion Search Modal */}
      {searchSlot !== null && (
        <ChampionSearch
          champions={champions}
          onSelect={handleSelectChampion}
          onClose={() => setSearchSlot(null)}
          krNames={krNames}
        />
      )}
    </div>
  );
}
