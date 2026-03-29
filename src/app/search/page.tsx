"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";

// ── 타입 ────────────────────────────────────────────
interface Skill {
  label: string;
  name: string;
  type: string;
  cooldown: number | null;
  booked_cooldown: number | null;
  buffs: { name: string; turns: number | null }[];
  debuffs: { name: string; turns: number | null }[];
  extra_turn: boolean;
  tm_fill: { target: string; value: number }[] | null;
  is_passive: boolean;
}

interface Champion {
  slug: string;
  name: string;
  display_name: string;
  faction: string;
  affinity: string;
  rarity: string;
  image: string;
  base_speed: number;
  skills: Skill[];
  revive_single?: boolean;
  revive_all?: boolean;
}

// ── 정규화 맵 ────────────────────────────────────────
const BUFF_NORMALIZE: Record<string, string> = {
  "Continuous heal": "Continuous Heal",
  "Increase C.Rate": "Increase C.RATE",
  "Increase C. RATE": "Increase C.RATE",
  "Increase C. DMG": "Increase C.DMG",
  "Increase Crit Rate": "Increase C.RATE",
  "Increased C. RATE": "Increase C.RATE",
  "Increases C.DMG": "Increase C.DMG",
  "Shield buff": "Shield",
  "Stone skin": "Stone Skin",
  "Stoneskin": "Stone Skin",
  "Revive on Death": "Revive On Death",
  "Revive on death": "Revive On Death",
  "Revive On Death ": "Revive On Death",
  "Revive on Death Buff": "Revive On Death",
  " Increase ACC ": "Increase ACC",
  "Counter Attack": "Counterattack",
};

const DEBUFF_NORMALIZE: Record<string, string> = {
  "HP burn": "HP Burn",
  "Decrease C.Rate": "Decrease C.RATE",
  "Decrease C. RATE": "Decrease C.RATE",
  "Decrease C. DMG": "Decrease C.DMG",
  "Decrease Def": "Decrease DEF",
  "Decrease Accuracy": "Decrease ACC",
  "Decrease Resistance": "Decrease RES",
  " Decrease ACC": "Decrease ACC",
  " Fear ": "Fear",
  " True Fear ": "True Fear",
  " Provoke ": "Provoke",
  "Block Active skills": "Block Active Skills",
  "Fear, [True Fear": "Fear",
  "Heal reduction": "Heal Reduction",
  "Ensnared": "Ensnare",
};

function normBuff(name: string): string {
  const trimmed = name.trim();
  return BUFF_NORMALIZE[name] || BUFF_NORMALIZE[trimmed] || trimmed;
}
function normDebuff(name: string): string {
  const trimmed = name.trim();
  return DEBUFF_NORMALIZE[name] || DEBUFF_NORMALIZE[trimmed] || trimmed;
}

// 유효한 이름만 (30자 이하, 괄호/특수 패턴 제외)
function isValidName(n: string): boolean {
  return n.length > 0 && n.length < 30 && !n.includes("[") && !n.includes("While");
}

// ── 상수 ────────────────────────────────────────────
const RARITIES = ["Legendary", "Mythical", "Epic", "Rare"] as const;
const RARITY_KR: Record<string, string> = {
  Legendary: "전설",
  Mythical: "신화",
  Epic: "에픽",
  Rare: "레어",
};
const RARITY_COLOR: Record<string, string> = {
  Legendary: "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  Mythical: "text-red-400 border-red-500/40 bg-red-500/10",
  Epic: "text-purple-400 border-purple-500/40 bg-purple-500/10",
  Rare: "text-blue-400 border-blue-500/40 bg-blue-500/10",
};

const AFFINITY_COLOR: Record<string, string> = {
  Force: "text-red-400",
  Magic: "text-blue-400",
  Spirit: "text-green-400",
  Void: "text-purple-400",
};

const FACTION_KR: Record<string, string> = {
  "bannerloards": "배너로드",
  "The Sacred order": "신성 기사단",
  "High elves": "하이 엘프",
  "Dark Elves": "다크 엘프",
  "Barbarians": "바바리안",
  "Ogryn Tribes": "오그린",
  "Lizardmen": "리자드맨",
  "Skinwalkers": "스킨워커",
  "Orcs": "오크",
  "Demonspawn": "데몬스폰",
  "Undead Hordes": "언데드",
  "Knight Revenant": "나이트 레버넌트",
  "Dwarves": "드워프",
  "Shadowkin": "섀도우킨",
  "Sylvan Watchers": "실반 와처",
  "Argonites": "아르고나이트",
};

// ── 버프/디버프/유틸 한글 + 카테고리 ──────────────────
type EffectCategory = "buff" | "debuff" | "utility";

interface EffectDef {
  name: string;
  kr: string;
  category: EffectCategory;
  color: string;
}

const EFFECTS: EffectDef[] = [
  // 버프
  { name: "Increase ATK", kr: "공격력 증가", category: "buff", color: "bg-red-500/20 text-red-300" },
  { name: "Increase DEF", kr: "방어력 증가", category: "buff", color: "bg-green-500/20 text-green-300" },
  { name: "Increase SPD", kr: "속도 증가", category: "buff", color: "bg-sky-500/20 text-sky-300" },
  { name: "Increase C.RATE", kr: "치확 증가", category: "buff", color: "bg-orange-500/20 text-orange-300" },
  { name: "Increase C.DMG", kr: "치뎀 증가", category: "buff", color: "bg-orange-500/20 text-orange-300" },
  { name: "Increase ACC", kr: "정확도 증가", category: "buff", color: "bg-teal-500/20 text-teal-300" },
  { name: "Increase RES", kr: "저항 증가", category: "buff", color: "bg-indigo-500/20 text-indigo-300" },
  { name: "Strengthen", kr: "강화", category: "buff", color: "bg-lime-500/20 text-lime-300" },
  { name: "Shield", kr: "쉴드", category: "buff", color: "bg-blue-500/20 text-blue-300" },
  { name: "Continuous Heal", kr: "지속 회복", category: "buff", color: "bg-green-500/20 text-green-300" },
  { name: "Counterattack", kr: "반격", category: "buff", color: "bg-amber-500/20 text-amber-300" },
  { name: "Ally Protection", kr: "아군 보호", category: "buff", color: "bg-blue-500/20 text-blue-300" },
  { name: "Block Damage", kr: "피해 차단", category: "buff", color: "bg-emerald-500/20 text-emerald-300" },
  { name: "Block Debuffs", kr: "디버프 차단", category: "buff", color: "bg-cyan-500/20 text-cyan-300" },
  { name: "Unkillable", kr: "불사", category: "buff", color: "bg-yellow-500/20 text-yellow-300" },
  { name: "Revive On Death", kr: "죽음시 부활", category: "buff", color: "bg-purple-500/20 text-purple-300" },
  { name: "Reflect Damage", kr: "피해 반사", category: "buff", color: "bg-pink-500/20 text-pink-300" },
  { name: "Perfect Veil", kr: "완전 은신", category: "buff", color: "bg-violet-500/20 text-violet-300" },
  { name: "Veil", kr: "은신", category: "buff", color: "bg-violet-500/20 text-violet-300" },
  { name: "Stone Skin", kr: "석화 피부", category: "buff", color: "bg-gray-500/20 text-gray-300" },
  { name: "Taunt", kr: "도발", category: "buff", color: "bg-rose-500/20 text-rose-300" },
  { name: "Life Barrier", kr: "생명 장벽", category: "buff", color: "bg-emerald-500/20 text-emerald-300" },
  { name: "Intercept", kr: "요격", category: "buff", color: "bg-sky-500/20 text-sky-300" },
  { name: "Fervor", kr: "열광", category: "buff", color: "bg-amber-500/20 text-amber-300" },
  { name: "Stormcall", kr: "폭풍 소환", category: "buff", color: "bg-blue-500/20 text-blue-300" },
  { name: "Fortify", kr: "요새화", category: "buff", color: "bg-green-500/20 text-green-300" },
  { name: "Evade", kr: "회피", category: "buff", color: "bg-violet-500/20 text-violet-300" },
  { name: "Bone Armor", kr: "뼈 갑옷", category: "buff", color: "bg-gray-500/20 text-gray-300" },
  { name: "Magma Shield", kr: "마그마 방패", category: "buff", color: "bg-orange-500/20 text-orange-300" },
  // 디버프
  { name: "Decrease DEF", kr: "방어력 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Decrease ATK", kr: "공격력 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Decrease SPD", kr: "속도 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Decrease ACC", kr: "정확도 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Decrease C.RATE", kr: "치확 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Decrease C.DMG", kr: "치뎀 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Weaken", kr: "약화", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Poison", kr: "독", category: "debuff", color: "bg-green-600/20 text-green-400" },
  { name: "Poison Sensitivity", kr: "독 감수성", category: "debuff", color: "bg-green-600/20 text-green-400" },
  { name: "HP Burn", kr: "화상", category: "debuff", color: "bg-orange-600/20 text-orange-400" },
  { name: "Bomb", kr: "폭탄", category: "debuff", color: "bg-orange-600/20 text-orange-400" },
  { name: "Stun", kr: "기절", category: "debuff", color: "bg-yellow-600/20 text-yellow-400" },
  { name: "Freeze", kr: "빙결", category: "debuff", color: "bg-cyan-600/20 text-cyan-400" },
  { name: "Sleep", kr: "수면", category: "debuff", color: "bg-indigo-600/20 text-indigo-400" },
  { name: "Provoke", kr: "도발", category: "debuff", color: "bg-rose-600/20 text-rose-400" },
  { name: "Fear", kr: "공포", category: "debuff", color: "bg-purple-600/20 text-purple-400" },
  { name: "True Fear", kr: "진공포", category: "debuff", color: "bg-purple-600/20 text-purple-400" },
  { name: "Petrification", kr: "석화", category: "debuff", color: "bg-gray-600/20 text-gray-400" },
  { name: "Block Buffs", kr: "버프 차단", category: "debuff", color: "bg-pink-600/20 text-pink-400" },
  { name: "Block Active Skills", kr: "스킬 봉인", category: "debuff", color: "bg-pink-600/20 text-pink-400" },
  { name: "Block Passive Skills", kr: "패시브 봉인", category: "debuff", color: "bg-pink-600/20 text-pink-400" },
  { name: "Block Cooldown Skills", kr: "쿨다운 봉인", category: "debuff", color: "bg-pink-600/20 text-pink-400" },
  { name: "Block Revive", kr: "부활 차단", category: "debuff", color: "bg-pink-600/20 text-pink-400" },
  { name: "Hex", kr: "저주", category: "debuff", color: "bg-fuchsia-600/20 text-fuchsia-400" },
  { name: "Leech", kr: "흡혈", category: "debuff", color: "bg-lime-600/20 text-lime-400" },
  { name: "Heal Reduction", kr: "치유 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Decrease RES", kr: "저항 감소", category: "debuff", color: "bg-red-600/20 text-red-400" },
  { name: "Enfeeble", kr: "쇠약", category: "debuff", color: "bg-gray-600/20 text-gray-400" },
  { name: "Necrosis", kr: "괴사", category: "debuff", color: "bg-emerald-600/20 text-emerald-400" },
  { name: "Pain Link", kr: "고통 연결", category: "debuff", color: "bg-rose-600/20 text-rose-400" },
  { name: "Seal", kr: "봉인", category: "debuff", color: "bg-amber-600/20 text-amber-400" },
  { name: "Polymorph", kr: "변이", category: "debuff", color: "bg-violet-600/20 text-violet-400" },
  { name: "Fatigue", kr: "피로", category: "debuff", color: "bg-blue-600/20 text-blue-400" },
  { name: "Shatter", kr: "분쇄", category: "debuff", color: "bg-cyan-600/20 text-cyan-400" },
  { name: "Smite", kr: "강타", category: "debuff", color: "bg-yellow-600/20 text-yellow-400" },
  { name: "Deathbrand", kr: "죽음의 낙인", category: "debuff", color: "bg-gray-600/20 text-gray-400" },
  { name: "Infest", kr: "감염", category: "debuff", color: "bg-green-600/20 text-green-400" },
  { name: "Ensnare", kr: "속박", category: "debuff", color: "bg-teal-600/20 text-teal-400" },
  { name: "Nullify", kr: "무효화", category: "debuff", color: "bg-indigo-600/20 text-indigo-400" },
  // 유틸리티
  { name: "Revive", kr: "부활", category: "utility", color: "bg-emerald-500/20 text-emerald-300" },
  { name: "Revive All", kr: "전체 부활", category: "utility", color: "bg-emerald-500/20 text-emerald-300" },
];

// ── 컴포넌트 ────────────────────────────────────────
export default function BuffDebuffSearch() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [krNames, setKrNames] = useState<Record<string, string>>({});
  const [selectedEffects, setSelectedEffects] = useState<string[]>([]);
  const [selectedRarities, setSelectedRarities] = useState<string[]>([]);
  const [selectedFactions, setSelectedFactions] = useState<string[]>([]);
  const [searchMode, setSearchMode] = useState<"any" | "all">("any");
  const [nameFilter, setNameFilter] = useState("");

  // 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch("/data/champions_unified.json").then((r) => r.json()),
      fetch("/data/champion_names_kr.json").then((r) => r.json()).catch(() => ({})),
    ]).then(([data, kr]: [Champion[], Record<string, string>]) => {
      setChampions(data);
      setKrNames(kr);
    });
  }, []);

  // 세력 목록 (데이터 기반)
  const factions = useMemo(() => {
    return [...new Set(champions.map((c) => c.faction))].sort();
  }, [champions]);

  // 챔피언 필터링
  const filtered = useMemo(() => {
    if (selectedEffects.length === 0 && nameFilter.length === 0) return [];

    return champions.filter((c) => {
      // 레어리티 필터
      if (selectedRarities.length > 0 && !selectedRarities.includes(c.rarity)) return false;

      // 세력 필터
      if (selectedFactions.length > 0 && !selectedFactions.includes(c.faction)) return false;

      // 이름 필터 (영어 + 한글)
      if (nameFilter.length > 0) {
        const q = nameFilter.toLowerCase();
        const engMatch = c.name.toLowerCase().includes(q) || c.display_name.toLowerCase().includes(q);
        const kr = krNames[c.slug];
        const krList = Array.isArray(kr) ? kr : kr ? [kr] : [];
        const krMatch = krList.some((n) => n.includes(q));
        if (!engMatch && !krMatch) return false;
      }

      // 효과 필터
      if (selectedEffects.length > 0) {
        const champEffects = new Set<string>();
        for (const skill of c.skills || []) {
          for (const b of skill.buffs || []) {
            const n = normBuff(b.name);
            if (isValidName(n)) champEffects.add(n);
          }
          for (const d of skill.debuffs || []) {
            const n = normDebuff(d.name);
            if (isValidName(n)) champEffects.add(n);
          }
        }
        // 부활 유틸리티: "부활"은 단일만, "전체 부활"은 전체만 (중복 제외)
        if (c.revive_single && !c.revive_all) champEffects.add("Revive");
        if (c.revive_all) champEffects.add("Revive All");

        if (searchMode === "all") {
          return selectedEffects.every((e) => champEffects.has(e));
        } else {
          return selectedEffects.some((e) => champEffects.has(e));
        }
      }

      return true;
    });
  }, [champions, krNames, selectedEffects, selectedRarities, selectedFactions, searchMode, nameFilter]);

  const toggleEffect = (name: string) => {
    setSelectedEffects((prev) =>
      prev.includes(name) ? prev.filter((e) => e !== name) : [...prev, name]
    );
  };

  const toggleRarity = (r: string) => {
    setSelectedRarities((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]
    );
  };

  const toggleFaction = (f: string) => {
    setSelectedFactions((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  };

  // 챔피언이 가진 효과 목록 (선택된 효과 하이라이트용)
  const getChampEffects = (c: Champion): { name: string; skillLabel: string; turns: number | null; category: EffectCategory }[] => {
    const results: { name: string; skillLabel: string; turns: number | null; category: EffectCategory }[] = [];
    const seen = new Set<string>();
    for (const skill of c.skills || []) {
      for (const b of skill.buffs || []) {
        const n = normBuff(b.name);
        if (!isValidName(n)) continue;
        const key = `${n}_${skill.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ name: n, skillLabel: skill.label, turns: b.turns, category: "buff" });
      }
      for (const d of skill.debuffs || []) {
        const n = normDebuff(d.name);
        if (!isValidName(n)) continue;
        const key = `${n}_${skill.label}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ name: n, skillLabel: skill.label, turns: d.turns, category: "debuff" });
      }
    }
    // 부활 유틸리티: 전체부활 챔프는 단일부활 태그 제외
    if (c.revive_single && !c.revive_all) results.push({ name: "Revive", skillLabel: "", turns: null, category: "utility" });
    if (c.revive_all) results.push({ name: "Revive All", skillLabel: "", turns: null, category: "utility" });
    return results;
  };

  const buffs = EFFECTS.filter((e) => e.category === "buff");
  const debuffs = EFFECTS.filter((e) => e.category === "debuff");
  const utilities = EFFECTS.filter((e) => e.category === "utility");

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <h1 className="text-2xl font-bold text-white mb-1">버프 / 디버프 검색</h1>
      <p className="text-sm text-gray-500 mb-6">필요한 버프나 디버프를 가진 챔피언을 찾아보세요</p>

      {/* 이름 검색 */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="챔피언 이름 검색..."
          value={nameFilter}
          onChange={(e) => setNameFilter(e.target.value)}
          className="w-full md:w-80 bg-[#1a1a2e] border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-600 outline-none focus:border-gold transition-colors text-sm"
        />
      </div>

      {/* 버프 선택 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-3">
        <h2 className="text-xs font-semibold text-emerald-400 mb-2">버프</h2>
        <div className="flex flex-wrap gap-1.5">
          {buffs.map((e) => {
            const active = selectedEffects.includes(e.name);
            return (
              <button
                key={e.name}
                onClick={() => toggleEffect(e.name)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer border
                  ${active
                    ? `${e.color} border-current font-bold shadow-sm`
                    : "bg-[#0d0d1a] border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"}`}
              >
                {e.kr}
              </button>
            );
          })}
        </div>
      </div>

      {/* 디버프 선택 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-red-400 mb-2">디버프</h2>
        <div className="flex flex-wrap gap-1.5">
          {debuffs.map((e) => {
            const active = selectedEffects.includes(e.name);
            return (
              <button
                key={e.name}
                onClick={() => toggleEffect(e.name)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer border
                  ${active
                    ? `${e.color} border-current font-bold shadow-sm`
                    : "bg-[#0d0d1a] border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"}`}
              >
                {e.kr}
              </button>
            );
          })}
        </div>
      </div>

      {/* 유틸리티 선택 */}
      <div className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-4 mb-4">
        <h2 className="text-xs font-semibold text-emerald-400 mb-2">유틸리티</h2>
        <div className="flex flex-wrap gap-1.5">
          {utilities.map((e) => {
            const active = selectedEffects.includes(e.name);
            return (
              <button
                key={e.name}
                onClick={() => toggleEffect(e.name)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all cursor-pointer border
                  ${active
                    ? `${e.color} border-current font-bold shadow-sm`
                    : "bg-[#0d0d1a] border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"}`}
              >
                {e.kr}
              </button>
            );
          })}
        </div>
      </div>

      {/* 필터 행: 레어리티 + 세력 + 검색모드 */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* 레어리티 */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 mr-1">등급:</span>
          {RARITIES.map((r) => {
            const active = selectedRarities.includes(r);
            return (
              <button
                key={r}
                onClick={() => toggleRarity(r)}
                className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer border
                  ${active
                    ? RARITY_COLOR[r] + " border-current font-bold"
                    : "bg-[#0d0d1a] border-gray-800 text-gray-600 hover:text-gray-400"}`}
              >
                {RARITY_KR[r]}
              </button>
            );
          })}
        </div>

        {/* 세력 (드롭다운) */}
        <FactionDropdown
          factions={factions}
          selected={selectedFactions}
          onToggle={toggleFaction}
        />

        {/* 검색 모드 */}
        {selectedEffects.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500 mr-1">조건:</span>
            <button
              onClick={() => setSearchMode("any")}
              className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer border
                ${searchMode === "any"
                  ? "border-amber-500/50 text-amber-400 bg-amber-500/10 font-bold"
                  : "bg-[#0d0d1a] border-gray-800 text-gray-600 hover:text-gray-400"}`}
            >
              하나라도
            </button>
            <button
              onClick={() => setSearchMode("all")}
              className={`px-2 py-0.5 rounded text-[11px] transition-all cursor-pointer border
                ${searchMode === "all"
                  ? "border-amber-500/50 text-amber-400 bg-amber-500/10 font-bold"
                  : "bg-[#0d0d1a] border-gray-800 text-gray-600 hover:text-gray-400"}`}
            >
              모두 보유
            </button>
          </div>
        )}
      </div>

      {/* 선택된 효과 표시 */}
      {selectedEffects.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <span className="text-[10px] text-gray-500">선택:</span>
          {selectedEffects.map((eName) => {
            const eDef = EFFECTS.find((e) => e.name === eName);
            return (
              <span
                key={eName}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold ${eDef?.color || "bg-gray-600/20 text-gray-400"} cursor-pointer`}
                onClick={() => toggleEffect(eName)}
              >
                {eDef?.kr || eName} ✕
              </span>
            );
          })}
          <button
            onClick={() => setSelectedEffects([])}
            className="text-[10px] text-gray-600 hover:text-red-400 cursor-pointer ml-1"
          >
            전체 해제
          </button>
        </div>
      )}

      {/* 결과 */}
      {(selectedEffects.length > 0 || nameFilter.length > 0) && (
        <div className="text-xs text-gray-500 mb-3">
          검색 결과: <span className="text-white font-bold">{filtered.length}</span>명
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.slice(0, 60).map((c) => {
          const effects = getChampEffects(c);
          return (
            <div
              key={c.slug}
              className="bg-[#1a1a2e] border border-gray-800 rounded-xl p-3 hover:border-gray-700 transition-colors"
            >
              {/* 챔피언 헤더 */}
              <div className="flex items-center gap-3 mb-2">
                <img
                  src={c.image}
                  alt={c.display_name}
                  className="w-12 h-12 rounded-lg object-cover bg-[#0d0d1a]"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-bold text-white truncate">{c.display_name}</span>
                    <span className={`text-[10px] ${AFFINITY_COLOR[c.affinity]}`}>{c.affinity}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${RARITY_COLOR[c.rarity]}`}>
                      {RARITY_KR[c.rarity]}
                    </span>
                    <span className="text-[10px] text-gray-500 truncate">
                      {FACTION_KR[c.faction] || c.faction}
                    </span>
                  </div>
                </div>
              </div>

              {/* 효과 목록 */}
              <div className="flex flex-wrap gap-1">
                {effects.map((e, i) => {
                  const eDef = EFFECTS.find((ed) => ed.name === e.name);
                  const isSelected = selectedEffects.includes(e.name);
                  return (
                    <span
                      key={`${e.name}_${e.skillLabel}_${i}`}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        isSelected
                          ? (eDef?.color || "bg-gray-600/20 text-gray-400") + " font-bold ring-1 ring-current"
                          : "bg-gray-800/50 text-gray-500"
                      }`}
                    >
                      {eDef?.kr || e.name}
                      <span className="text-gray-600 ml-0.5">{e.skillLabel}</span>
                      {e.turns && <span className="text-gray-600 ml-0.5">{e.turns}t</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length > 60 && (
        <div className="text-center text-sm text-gray-500 mt-4">
          ... 외 {filtered.length - 60}명 (필터를 좁혀주세요)
        </div>
      )}

      {selectedEffects.length === 0 && nameFilter.length === 0 && (
        <div className="text-center text-gray-600 py-16">
          위에서 버프나 디버프를 선택하면 해당 효과를 가진 챔피언이 표시됩니다
        </div>
      )}
    </div>
  );
}

// ── 세력 드롭다운 ────────────────────────────────────
function FactionDropdown({
  factions,
  selected,
  onToggle,
}: {
  factions: string[];
  selected: string[];
  onToggle: (f: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-3 py-1 rounded-lg text-[11px] transition-all cursor-pointer border
          ${selected.length > 0
            ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
            : "bg-[#0d0d1a] border-gray-800 text-gray-500 hover:text-gray-400"}`}
      >
        세력 {selected.length > 0 ? `(${selected.length})` : "전체"} ▾
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-[#12122a] border border-gray-700 rounded-xl p-2 z-50 w-48 max-h-72 overflow-y-auto shadow-2xl">
          {selected.length > 0 && (
            <button
              onClick={() => { for (const f of selected) onToggle(f); }}
              className="w-full text-left text-[10px] text-gray-500 hover:text-red-400 px-2 py-1 cursor-pointer mb-1"
            >
              전체 해제
            </button>
          )}
          {factions.map((f) => {
            const active = selected.includes(f);
            return (
              <button
                key={f}
                onClick={() => onToggle(f)}
                className={`w-full text-left px-2 py-1.5 rounded text-xs cursor-pointer transition-colors
                  ${active ? "text-amber-400 bg-amber-500/10" : "text-gray-400 hover:text-white hover:bg-white/5"}`}
              >
                {active ? "✓ " : ""}{FACTION_KR[f] || f}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
