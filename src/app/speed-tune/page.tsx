"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  type DmgSimConfig,
  type DmgChampionInput,
  type DmgSkillInput,
  type SkillFormula,
  type MonteCarloResult,
  type DebugLogEntry,
  type ChampStats,
  type RegionBonus,
  runMonteCarlo,
  calcSimSpeed,
  BOSS_STATS,
  EMPTY_REGION_BONUS,
} from "./damage-engine";

// ── 챔피언 JSON 인터페이스 ──────────────────────────

interface BuffDebuff {
  name: string;
  turns: number | null;
}

interface TmFill {
  target: "all_allies" | "self";
  value: number;
}

interface RawSkill {
  label: string;
  name: string;
  type: string;
  cooldown: number;
  booked_cooldown?: number;
  buffs: BuffDebuff[];
  debuffs: BuffDebuff[];
  extra_turn?: boolean;
  tm_fill?: TmFill[];
  is_passive?: boolean;
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
  skills: RawSkill[];
}

// ── 멀티플라이어 데이터 인터페이스 ──────────────────

interface BookEntry {
  type: string;   // "Damage" | "Cooldown" | "Buff/Debuff Chance"
  amount: string; // "10", "20" 등
}

interface RawMultEntry {
  formula: string;
  attacks: number;
  specialrules: string;
}

interface MultiplierSkill {
  name: string;
  rawMults: RawMultEntry[];  // 모든 multiplier (ATK 기반 + TRG_HP 기반 등)
  hits: number;
  books: Record<string, BookEntry>;
  maxBookLevel: number;
}

interface MultiplierChamp {
  name: string;
  slug: string;  // URL에서 추출한 slug (unified와 매칭용)
  skills: MultiplierSkill[];
}

// raw JSON → MultiplierChamp[] 변환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMultiplierData(raw: any[]): MultiplierChamp[] {
  const result: MultiplierChamp[] = [];
  for (const entry of raw) {
    const forms = entry.forms || [];
    // form "1" (기본 폼) 우선, 없으면 첫 번째
    const form = forms.find((f: { form: string }) => f.form === "1") || forms[0];
    if (!form) continue;
    const skills: MultiplierSkill[] = [];
    for (const s of form.skills || []) {
      const mults = s.multipliers || [];
      const books: Record<string, BookEntry> = s.books || {};
      // 모든 multiplier를 저장 (damage kindid=6000만 필터)
      const rawMults: RawMultEntry[] = mults
        .filter((m: { kindid: string | number }) => m.kindid === "6000" || m.kindid === 6000)
        .map((m: { formula: string; attacks: string | number; specialrules: string }) => ({
          formula: m.formula || "",
          attacks: parseInt(String(m.attacks || "1"), 10) || 1,
          specialrules: m.specialrules || "",
        }));
      // 히트 수: 첫 번째 damage multiplier 기준
      const hits = rawMults.length > 0 ? rawMults[0].attacks : 1;
      skills.push({
        name: s.name || "",
        rawMults,
        hits,
        books,
        maxBookLevel: Object.keys(books).length,
      });
    }
    // URL에서 slug 추출: .../champions/acelin-the-stalwart/ → acelin-the-stalwart
    const url: string = entry.url || "";
    const slugMatch = url.match(/\/champions\/([^/]+)\/?$/);
    const slug = slugMatch ? slugMatch[1] : entry.name.toLowerCase().replace(/\s+/g, "-");
    result.push({ name: entry.name, slug, skills });
  }
  return result;
}

// ── 슬롯 데이터 ────────────────────────────────────

interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  cRate: number;
  cDmg: number;
  res: number;
  acc: number;
}

interface SlotData {
  champion: Champion | null;
  stats: StatBlock;
  mastery: "warmaster" | "giantslayer" | "none";
  lifesteal: boolean;
  steelEpic: boolean;
  setBonusPct: number;
  defIgnorePct: number;  // 새비지25 + 크루얼5 등
  bookLevels: number[];  // 스킬별 북 레벨 (0 = 미투자, max = 풀북)
  allMaxBook: boolean;   // 풀북 체크
  bookPanelOpen: boolean; // 북 패널 열림 여부
}

const EMPTY_STATS: StatBlock = {
  hp: 0, atk: 0, def: 0, spd: 0, cRate: 0, cDmg: 0, res: 0, acc: 0,
};

const STAT_FIELDS: { key: keyof StatBlock; label: string; placeholder: string }[] = [
  { key: "hp", label: "HP", placeholder: "45000" },
  { key: "atk", label: "ATK", placeholder: "4200" },
  { key: "def", label: "DEF", placeholder: "2800" },
  { key: "spd", label: "SPD", placeholder: "189" },
  { key: "cRate", label: "C.RATE", placeholder: "85" },
  { key: "cDmg", label: "C.DMG", placeholder: "130" },
  { key: "res", label: "RES", placeholder: "200" },
  { key: "acc", label: "ACC", placeholder: "250" },
];

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

const DIFFICULTIES = Object.keys(BOSS_STATS);
const AFFINITIES: DmgSimConfig["bossAffinity"][] = ["Void", "Spirit", "Force", "Magic"];
const AFFINITY_LABELS: Record<string, string> = {
  Void: "보이드", Spirit: "스피릿", Force: "포스", Magic: "매직",
};

const REGION_FIELDS: { key: keyof RegionBonus; label: string; unit: string }[] = [
  { key: "hpPct", label: "HP", unit: "%" },
  { key: "atkPct", label: "ATK", unit: "%" },
  { key: "defPct", label: "DEF", unit: "%" },
  { key: "defIgnorePct", label: "DEF무시", unit: "%" },
  { key: "spd", label: "SPD", unit: "" },
  { key: "cDmgPct", label: "C.DMG", unit: "%" },
  { key: "res", label: "RES", unit: "" },
  { key: "acc", label: "ACC", unit: "" },
];

function createSlotData(): SlotData {
  return {
    champion: null,
    stats: { ...EMPTY_STATS },
    mastery: "warmaster",
    lifesteal: true,
    steelEpic: false,
    setBonusPct: 0,
    defIgnorePct: 0,
    bookLevels: [],
    allMaxBook: false,
    bookPanelOpen: false,
  };
}

// ── 스킬 변환 유틸 ──────────────────────────────────

function isPassive(skill: RawSkill): boolean {
  if (skill.is_passive || skill.type === "Passive") return true;
  if (skill.name.includes("[P]") || skill.name.includes("[HP]")) return true;
  if (skill.name.toLowerCase().includes("passive")) return true;
  if (skill.name.includes("(Secret Skill)")) return true;
  return false;
}

function isExcluded(skill: RawSkill, rarity: string): boolean {
  const n = skill.name.toLowerCase();
  if (n.includes("metamorph") || n.includes("(aura)")) return true;
  if (skill.label !== "A1" && n.trim() === "aura") return true;
  const labelNum = parseInt(skill.label.replace("A", ""), 10);
  if (labelNum >= 4 && skill.cooldown <= 0 && rarity !== "Mythical") return true;
  return false;
}

// 협공 스킬 목록 (slug → 스킬 label)
// 자동 감지 불가능 → 수동 태그
const ALLY_ATTACK_SKILLS: Record<string, string[]> = {
  "cardiel": ["A3"],
  "longbeard": ["A3"],
  "fahrakin-the-fat": ["A2", "A3"],
  "kreela-witch-arm": ["A3"],
  "arbiter": ["A3"],
  "lanakis-the-chosen": ["A3"],
  "cathar": ["A2"],
  "ursala-the-mourner": ["A3"],
  "kalvalax": ["A2"],
  "warcaster": ["A3"],
};

// turns가 null인 버프/디버프에 대한 기본 턴 수
const DEFAULT_DEBUFF_TURNS: Record<string, number> = {
  "Poison": 2, "Poison (Small)": 2, "HP Burn": 3,
  "Weaken": 2, "Decrease DEF": 2, "Decrease ATK": 2, "Decrease SPD": 2,
  "Decrease ACC": 2, "Decrease C.RATE": 2,
  "Block Buffs": 2, "Block Revive": 2,
  "Freeze": 1, "Stun": 1, "Sleep": 1, "Provoke": 1, "Fear": 1,
  "True Fear": 1, "Petrification": 1, "Bomb": 2,
  "Poison Sensitivity": 2, "Hex": 2,
};

const DEFAULT_BUFF_TURNS: Record<string, number> = {
  "Increase ATK": 2, "Increase ATK (Small)": 2,
  "Increase DEF": 2, "Increase DEF (Small)": 2,
  "Increase SPD": 2, "Increase C.RATE": 2,
  "Strengthen": 2, "Strengthen (Small)": 2,
  "Counter Attack": 2, "Block Damage": 1, "Unkillable": 1,
  "Block Debuffs": 2, "Shield": 2, "Continuous Heal": 2,
  "Perfect Veil": 2, "Veil": 2, "Ally Protection": 2,
  "Stone Skin": 2, "Intercept": 2,
};

/** 북 레벨에 따른 데미지 보너스 합산 (0~1 스케일) */
function calcBookDmgBonus(books: Record<string, BookEntry>, currentLevel: number): number {
  let total = 0;
  for (let lv = 1; lv <= currentLevel; lv++) {
    const entry = books[String(lv)];
    if (entry && entry.type === "Damage") {
      total += parseInt(entry.amount, 10) / 100;
    }
  }
  return total;
}

/** 북 레벨에 따른 쿨다운 감소 합산 */
function calcBookCdReduce(books: Record<string, BookEntry>, currentLevel: number): number {
  let total = 0;
  for (let lv = 1; lv <= currentLevel; lv++) {
    const entry = books[String(lv)];
    if (entry && entry.type === "Cooldown") {
      total += parseInt(entry.amount, 10);
    }
  }
  return total;
}

/** champions_unified.json 스킬 → 엔진 DmgSkillInput 변환 */
function buildDmgSkills(
  champ: Champion,
  multipliers: MultiplierChamp | undefined,
  bookLevels: number[],
  allMaxBook: boolean,
): DmgSkillInput[] {
  const activeSkills = champ.skills.filter((s) => !isPassive(s) && !isExcluded(s, champ.rarity));
  return activeSkills.map((s, idx) => {
    // 멀티플라이어 매칭 (이름 기반)
    let formula = "";
    let hits = 1;
    let books: Record<string, BookEntry> = {};
    let maxBookLv = 0;
    let formulas: SkillFormula[] = [];
    if (multipliers) {
      const ms = multipliers.skills.find(
        (ms) => ms.name.trim() === s.name.trim() || ms.name.trim() === s.label.trim(),
      );
      if (ms) {
        formulas = ms.rawMults.map((rm) => ({ formula: rm.formula, hits: rm.attacks }));
        hits = ms.hits || 1;
        books = ms.books || {};
        maxBookLv = ms.maxBookLevel;
      }
    }

    const bookLv = allMaxBook ? maxBookLv : (bookLevels[idx] ?? 0);
    const bookDmgBonus = calcBookDmgBonus(books, bookLv);
    const bookCdReduce = calcBookCdReduce(books, bookLv);

    // 쿨다운: 원본 - 북 CD감소 (최소 0)
    const baseCd = s.cooldown || 0;
    const finalCd = Math.max(0, baseCd - bookCdReduce);

    return {
      label: s.label,
      formulas,
      hits,
      cooldown: finalCd,
      bookDmgBonus,
      buffs: s.buffs
        .map((b) => ({
          name: b.name,
          turns: b.turns ?? DEFAULT_BUFF_TURNS[b.name] ?? 2,
          target: "all_allies" as const,
        }))
        .filter((b) => b.turns > 0),
      debuffs: s.debuffs
        .map((d) => ({
          name: d.name,
          turns: d.turns ?? DEFAULT_DEBUFF_TURNS[d.name] ?? 2,
          chance: 100,
        }))
        .filter((d) => d.turns > 0),
      extraTurn: s.extra_turn ?? false,
      tmFill: s.tm_fill ?? [],
      allyAttack: (ALLY_ATTACK_SKILLS[champ.slug] ?? []).includes(s.label),
    };
  });
}

// ── 숫자 포맷 ───────────────────────────────────────

// ── 프리셋 저장/불러오기 ────────────────────────────

interface PresetSlot {
  champSlug: string | null;
  stats: StatBlock;
  mastery: "warmaster" | "giantslayer" | "none";
  lifesteal: boolean;
  steelEpic: boolean;
  setBonusPct: number;
  defIgnorePct: number;
  bookLevels: number[];
  allMaxBook: boolean;
}

interface Preset {
  name: string;
  difficulty: string;
  bossAffinity: string;
  speedAuraPct: number;
  region: RegionBonus;
  slots: PresetSlot[];
  savedAt: string;
}

const PRESET_KEY = "dmgCalc_presets";

function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePresets(presets: Preset[]) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
}

function formatDmg(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

// ── 메인 컴포넌트 ─────────────────────────────────

export default function DamageCalcPage() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [krNames, setKrNames] = useState<Record<string, string>>({});
  const [multiplierData, setMultiplierData] = useState<MultiplierChamp[]>([]);
  const [loading, setLoading] = useState(true);

  const [difficulty, setDifficulty] = useState("Ultra Nightmare");
  const [bossAffinity, setBossAffinity] = useState<DmgSimConfig["bossAffinity"]>("Void");
  const [speedAuraPct, setSpeedAuraPct] = useState(0);
  const [region, setRegion] = useState<RegionBonus>({ ...EMPTY_REGION_BONUS });
  const [regionOpen, setRegionOpen] = useState(false);

  const [slots, setSlots] = useState<SlotData[]>(
    Array.from({ length: 5 }, createSlotData),
  );

  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debugLogOpen, setDebugLogOpen] = useState(false);

  // 프리셋
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [presetOpen, setPresetOpen] = useState(false);

  useEffect(() => { setPresets(loadPresets()); }, []);

  // 챔피언 검색 팝업
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchSlotIndex, setSearchSlotIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch("/data/champions_unified.json").then((r) => r.json()),
      fetch("/data/champion_names_kr.json").then((r) => r.json()).catch(() => ({})),
      fetch("/data/champions_multipliers.json").then((r) => r.json()).catch(() => []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ]).then(([data, kr, rawMult]: [Champion[], Record<string, string>, any[]]) => {
      setChampions(data);
      setKrNames(kr);
      setMultiplierData(parseMultiplierData(rawMult));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchRef.current?.focus(), 100);
  }, [searchOpen]);

  // 검색 필터
  const searchResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const used = new Set(slots.filter((s) => s.champion).map((s) => s.champion!.slug));
    return champions
      .filter((c) => {
        if (used.has(c.slug)) return false;
        const kr = krNames[c.slug] || "";
        const krList = Array.isArray(kr) ? kr : kr ? [kr] : [];
        return (
          c.display_name.toLowerCase().includes(q) ||
          c.slug.includes(q) ||
          krList.some((n: string) => n.includes(q))
        );
      })
      .slice(0, 20);
  }, [searchQuery, champions, krNames, slots]);

  // 챔피언 선택
  const handleSelectChampion = useCallback(
    (champ: Champion) => {
      // 스킬 수 파악 → bookLevels 초기화
      const activeSkills = champ.skills.filter((s) => !isPassive(s) && !isExcluded(s, champ.rarity));
      setSlots((prev) => {
        const next = [...prev];
        next[searchSlotIndex] = {
          ...next[searchSlotIndex],
          champion: champ,
          stats: { ...EMPTY_STATS },
          bookLevels: new Array(activeSkills.length).fill(0),
          allMaxBook: false,
          bookPanelOpen: false,
        };
        return next;
      });
      setSearchOpen(false);
      setSearchQuery("");
      setResult(null);
    },
    [searchSlotIndex],
  );

  const handleRemove = useCallback((index: number) => {
    setSlots((prev) => {
      const next = [...prev];
      next[index] = createSlotData();
      return next;
    });
    setResult(null);
  }, []);

  const handleStatChange = useCallback(
    (slotIndex: number, statKey: keyof StatBlock, value: number) => {
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = { ...next[slotIndex], stats: { ...next[slotIndex].stats, [statKey]: value } };
        return next;
      });
    },
    [],
  );

  const handleSlotOption = useCallback(
    (slotIndex: number, key: string, value: unknown) => {
      setSlots((prev) => {
        const next = [...prev];
        next[slotIndex] = { ...next[slotIndex], [key]: value };
        return next;
      });
    },
    [],
  );

  // ── 프리셋 저장/불러오기 ──
  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) return;
    const preset: Preset = {
      name,
      difficulty,
      bossAffinity,
      speedAuraPct,
      region,
      slots: slots.map((s) => ({
        champSlug: s.champion?.slug ?? null,
        stats: s.stats,
        mastery: s.mastery,
        lifesteal: s.lifesteal,
        steelEpic: s.steelEpic,
        setBonusPct: s.setBonusPct,
        defIgnorePct: s.defIgnorePct,
        bookLevels: s.bookLevels,
        allMaxBook: s.allMaxBook,
      })),
      savedAt: new Date().toLocaleString("ko-KR"),
    };
    const updated = [...presets.filter((p) => p.name !== name), preset];
    savePresets(updated);
    setPresets(updated);
    setPresetName("");
  }, [presetName, difficulty, bossAffinity, speedAuraPct, region, slots, presets]);

  const handleLoadPreset = useCallback((preset: Preset) => {
    setDifficulty(preset.difficulty);
    setBossAffinity(preset.bossAffinity as DmgSimConfig["bossAffinity"]);
    setSpeedAuraPct(preset.speedAuraPct);
    setRegion(preset.region);
    setSlots(preset.slots.map((ps) => {
      const champ = ps.champSlug ? champions.find((c) => c.slug === ps.champSlug) ?? null : null;
      return {
        champion: champ,
        stats: ps.stats,
        mastery: ps.mastery,
        lifesteal: ps.lifesteal,
        steelEpic: ps.steelEpic,
        setBonusPct: ps.setBonusPct,
        defIgnorePct: ps.defIgnorePct,
        bookLevels: ps.bookLevels || [],
        allMaxBook: ps.allMaxBook || false,
        bookPanelOpen: false,
      };
    }));
    setResult(null);
    setPresetOpen(false);
  }, [champions]);

  const handleDeletePreset = useCallback((name: string) => {
    const updated = presets.filter((p) => p.name !== name);
    savePresets(updated);
    setPresets(updated);
  }, [presets]);

  // ── 시뮬레이션 실행 ──
  const handleSimulate = useCallback(() => {
    setSimulating(true);
    setResult(null);

    // setTimeout으로 UI 블로킹 방지
    setTimeout(() => {
      const champInputs: DmgChampionInput[] = slots.map((s) => {
        const champ = s.champion!;
        const mult = multiplierData.find((m) => m.slug === champ.slug);
        const skills = buildDmgSkills(champ, mult, s.bookLevels, s.allMaxBook);

        return {
          name: champ.display_name,
          slug: champ.slug,
          baseSpeed: champ.base_speed,
          affinity: (champ.affinity || "Void") as import("./damage-engine").Affinity,
          stats: s.stats as ChampStats,
          skills,
          mastery: s.mastery,
          lifestealPct: s.lifesteal ? 0.15 : 0,
          steelEpic: s.steelEpic,
          setBonusPct: s.setBonusPct,
          defIgnorePct: s.defIgnorePct,
        };
      });

      const config: DmgSimConfig = {
        difficulty,
        bossAffinity,
        champions: champInputs,
        speedAuraPct,
        region,
        trials: 100,
        debug: debugMode,
      };

      const res = runMonteCarlo(config);
      setResult(res);
      setSimulating(false);
    }, 50);
  }, [slots, multiplierData, difficulty, bossAffinity, speedAuraPct, region, debugMode]);

  const champCount = slots.filter((s) => s.champion).length;
  const allStatsSet = slots.every((s) => !s.champion || s.stats.spd > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-gold animate-pulse">데이터 로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gold">정공덱 데미지 계산기</h1>
        <p className="text-sm text-gray-500 mt-1">
          챔피언 5명의 스탯을 입력하면 클랜보스에 넣는 총 데미지를 시뮬레이션합니다.
          <span className="text-gray-600"> (100회 몬테카를로)</span>
        </p>
      </div>

      {/* 프리셋 */}
      <div className="mb-4 bg-card border border-card-border rounded-xl p-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPresetOpen(!presetOpen)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
          >
            <svg className={`w-3 h-3 transition-transform ${presetOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            프리셋
            {presets.length > 0 && <span className="text-[10px] text-gold bg-gold/10 px-1.5 py-0.5 rounded-full">{presets.length}</span>}
          </button>
          <div className="flex-1" />
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
            placeholder="프리셋 이름"
            className="w-32 bg-input-bg border border-input-border rounded px-2 py-1 text-xs text-white placeholder-gray-700 outline-none focus:border-gold"
          />
          <button
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            className="px-3 py-1 bg-gold/20 text-gold text-xs rounded hover:bg-gold/30 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
          >
            저장
          </button>
        </div>
        {presetOpen && presets.length > 0 && (
          <div className="mt-2 space-y-1">
            {presets.map((p) => (
              <div key={p.name} className="flex items-center gap-2 bg-input-bg/50 rounded-lg px-3 py-1.5">
                <button
                  onClick={() => handleLoadPreset(p)}
                  className="flex-1 text-left cursor-pointer hover:text-gold transition-colors"
                >
                  <span className="text-xs text-white">{p.name}</span>
                  <span className="text-[9px] text-gray-600 ml-2">
                    {p.difficulty} · {p.slots.filter((s) => s.champSlug).length}챔프 · {p.savedAt}
                  </span>
                </button>
                <button
                  onClick={() => handleDeletePreset(p.name)}
                  className="text-gray-600 hover:text-red-400 p-0.5 cursor-pointer"
                  title="삭제"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 설정 패널 */}
      <div className="mb-6 bg-card border border-card-border rounded-xl p-4 space-y-4">
        {/* 난이도 */}
        <div>
          <label className="text-sm text-gray-400 block mb-2">난이도</label>
          <div className="flex flex-wrap gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                onClick={() => { setDifficulty(d); setResult(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  difficulty === d
                    ? "bg-gold text-background"
                    : "bg-input-bg border border-input-border text-gray-400 hover:border-gold/50"
                }`}
              >
                {d} <span className="text-[10px] opacity-70">SPD {BOSS_STATS[d].spd}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 보스 속성 */}
        <div>
          <label className="text-sm text-gray-400 block mb-2">보스 속성</label>
          <div className="flex gap-2">
            {AFFINITIES.map((a) => (
              <button
                key={a}
                onClick={() => { setBossAffinity(a); setResult(null); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  bossAffinity === a
                    ? "bg-gold text-background"
                    : "bg-input-bg border border-input-border text-gray-400 hover:border-gold/50"
                }`}
              >
                <span className={AFFINITY_COLORS[a] || ""}>{AFFINITY_LABELS[a]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 스피드 오라 */}
        <div className="max-w-[200px]">
          <label className="text-[10px] text-gray-500 block mb-1">스피드 오라 (%)</label>
          <input
            type="number"
            value={speedAuraPct || ""}
            onChange={(e) => setSpeedAuraPct(Number(e.target.value))}
            placeholder="예: 19"
            className="w-full bg-input-bg border border-input-border rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-700 outline-none focus:border-gold text-center"
          />
        </div>

        {/* 지역 보너스 (접이식) */}
        <div>
          <button
            onClick={() => setRegionOpen(!regionOpen)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
          >
            <svg
              className={`w-3 h-3 transition-transform ${regionOpen ? "rotate-90" : ""}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            지역 보너스
            {Object.values(region).some((v) => v > 0) && (
              <span className="text-[10px] text-gold bg-gold/10 px-1.5 py-0.5 rounded-full">적용중</span>
            )}
          </button>

          {regionOpen && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              {REGION_FIELDS.map((f) => (
                <div key={f.key} className="flex items-center gap-1.5">
                  <label className="text-[10px] text-gray-500 w-16 text-right flex-shrink-0">{f.label}</label>
                  <input
                    type="number"
                    value={region[f.key] || ""}
                    onChange={(e) => setRegion((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-16 bg-input-bg border border-input-border rounded px-1.5 py-1 text-[11px] text-white placeholder-gray-700 outline-none focus:border-gold text-center"
                  />
                  <span className="text-[9px] text-gray-600">{f.unit}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 챔피언 슬롯 5개 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {slots.map((slot, i) => (
          <ChampionSlot
            key={i}
            slot={slot}
            index={i}
            krNames={krNames}
            multiplierData={multiplierData}
            speedAuraPct={speedAuraPct}
            regionSpd={region.spd}
            onOpenSearch={() => {
              setSearchSlotIndex(i);
              setSearchOpen(true);
              setSearchQuery("");
            }}
            onStatChange={(k, v) => handleStatChange(i, k, v)}
            onOption={(k, v) => handleSlotOption(i, k, v)}
            onRemove={() => handleRemove(i)}
          />
        ))}
      </div>

      {/* 계산 버튼 */}
      {champCount === 5 && (
        <div className="mb-6 space-y-2">
          <button
            onClick={handleSimulate}
            disabled={simulating || !allStatsSet}
            className={`w-full px-6 py-3 rounded-xl font-semibold text-lg transition-colors cursor-pointer ${
              simulating || !allStatsSet
                ? "bg-gold/30 text-gold/50 cursor-not-allowed"
                : "bg-gold text-background hover:bg-gold-dark"
            }`}
          >
            {simulating ? "시뮬레이션 중..." : "데미지 계산 (100회 시뮬)"}
          </button>
          <label className="flex items-center gap-2 cursor-pointer justify-end">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-gold"
            />
            <span className="text-xs text-gray-500">디버그 로그</span>
          </label>
        </div>
      )}

      {/* 결과 */}
      {result && <SimResult result={result} />}

      {/* 디버그 로그 */}
      {result?.debugLog && result.debugLog.length > 0 && (
        <div className="mt-4 bg-card border border-card-border rounded-xl">
          <button
            onClick={() => setDebugLogOpen(!debugLogOpen)}
            className="w-full px-4 py-3 flex items-center justify-between text-sm text-gray-400 hover:text-gray-300 cursor-pointer"
          >
            <span>디버그 로그 ({result.debugLog.length}개 이벤트, 첫 번째 시뮬)</span>
            <svg className={`w-4 h-4 transition-transform ${debugLogOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {debugLogOpen && (
            <div className="px-4 pb-4 max-h-[600px] overflow-y-auto">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="text-gray-600 border-b border-gray-800 sticky top-0 bg-card">
                    <th className="text-left py-1 px-1 w-12">틱</th>
                    <th className="text-left py-1 px-1 w-28">행동자</th>
                    <th className="text-left py-1 px-1 w-40">행동</th>
                    <th className="text-left py-1 px-1">상세</th>
                    <th className="text-left py-1 px-1 w-40">보스 디버프</th>
                  </tr>
                </thead>
                <tbody>
                  {result.debugLog.map((entry: DebugLogEntry, i: number) => (
                    <tr key={i} className={`border-b border-gray-800/30 ${entry.actor === "BOSS" ? "bg-red-500/5" : ""}`}>
                      <td className="py-0.5 px-1 text-gray-600">{entry.tick}</td>
                      <td className={`py-0.5 px-1 ${entry.actor === "BOSS" ? "text-red-400" : "text-blue-400"}`}>{entry.actor}</td>
                      <td className="py-0.5 px-1 text-gray-300">{entry.action}</td>
                      <td className="py-0.5 px-1 text-gray-500">{entry.detail}</td>
                      <td className="py-0.5 px-1 text-emerald-600 truncate" title={entry.bossDebuffs.join(", ")}>{entry.bossDebuffs.join(", ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 검색 모달 */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="bg-card border border-card-border rounded-2xl w-full max-w-md mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4">
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="챔피언 이름 검색..."
                className="w-full bg-input-bg border border-input-border rounded-xl px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-gold"
              />
            </div>
            <div className="max-h-80 overflow-y-auto px-2 pb-3">
              {searchResults.length === 0 && searchQuery.length > 0 && (
                <p className="text-center text-gray-600 py-4 text-sm">결과 없음</p>
              )}
              {searchResults.map((c) => {
                const kr = krNames[c.slug];
                const krDisplay = Array.isArray(kr) ? kr[0] : kr;
                return (
                  <button
                    key={c.slug}
                    onClick={() => handleSelectChampion(c)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <div className={`w-9 h-9 rounded-lg border overflow-hidden flex-shrink-0 ${RARITY_COLORS[c.rarity]?.split(" ")[0] || "border-gray-600"}`}>
                      <img src={c.image} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm text-white truncate">
                        {c.display_name}
                        {krDisplay && <span className="text-gray-500 ml-1 text-xs">{krDisplay}</span>}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        <span className={AFFINITY_COLORS[c.affinity] || ""}>{c.affinity}</span>
                        {" · "}{c.rarity}{" · SPD "}{c.base_speed}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ChampionSlot ──────────────────────────────────

function ChampionSlot({
  slot, index, krNames, multiplierData, speedAuraPct, regionSpd, onOpenSearch, onStatChange, onOption, onRemove,
}: {
  slot: SlotData;
  index: number;
  krNames: Record<string, string>;
  multiplierData: MultiplierChamp[];
  speedAuraPct: number;
  regionSpd: number;
  onOpenSearch: () => void;
  onStatChange: (k: keyof StatBlock, v: number) => void;
  onOption: (k: string, v: unknown) => void;
  onRemove: () => void;
}) {
  const champ = slot.champion;

  if (!champ) {
    return (
      <div
        onClick={onOpenSearch}
        className="bg-card border border-dashed border-card-border rounded-xl p-4 flex flex-col items-center justify-center min-h-[240px] cursor-pointer hover:border-gold/50 transition-colors"
      >
        <div className="w-14 h-14 rounded-full bg-input-bg border border-input-border flex items-center justify-center mb-2">
          <svg className="w-7 h-7 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
          </svg>
        </div>
        <p className="text-sm text-gray-500">슬롯 {index + 1}</p>
        <p className="text-xs text-gray-600 mt-0.5">클릭하여 선택</p>
      </div>
    );
  }

  const kr = krNames[champ.slug];
  const krDisplay = Array.isArray(kr) ? kr[0] : kr;
  const multChamp = multiplierData.find((m) => m.slug === champ.slug);
  const hasMult = !!multChamp && multChamp.skills.some((s) => s.rawMults.length > 0);

  return (
    <div className={`bg-card border rounded-xl p-3 ${RARITY_COLORS[champ.rarity]?.split(" ")[0] || "border-card-border"}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-10 h-10 rounded-lg border-2 overflow-hidden flex-shrink-0 cursor-pointer ${RARITY_COLORS[champ.rarity] || "border-gray-600"}`}
          onClick={onOpenSearch}
          title="챔피언 변경"
        >
          <img src={champ.image} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{champ.display_name}</p>
          <p className="text-[10px] text-gray-500">
            {krDisplay && <span className="text-gray-400 mr-1">{krDisplay}</span>}
            <span className={AFFINITY_COLORS[champ.affinity] || ""}>{champ.affinity}</span>
          </p>
        </div>
        {/* 유물 관통 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-[9px] text-white">유물 관통</span>
          <input
            type="number"
            value={slot.defIgnorePct || ""}
            onChange={(e) => onOption("defIgnorePct", Number(e.target.value))}
            placeholder="0"
            className="w-10 bg-input-bg border border-input-border rounded px-1 py-0.5 text-[10px] text-white placeholder-gray-700 outline-none focus:border-gold text-center"
          />
          <span className="text-[9px] text-gray-500">%</span>
        </div>
        <button onClick={onRemove} className="text-gray-600 hover:text-red-400 p-0.5 flex-shrink-0" title="제거">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 계수 상태 + 풀북 체크 */}
      <div className="flex items-center gap-2 mb-2">
        <div className={`text-[9px] px-1.5 py-0.5 rounded ${hasMult ? "bg-emerald-500/10 text-emerald-400" : "bg-yellow-500/10 text-yellow-500"}`}>
          {hasMult ? "✓ 계수 있음" : "⚠ 계수 없음"}
        </div>
        <label className="flex items-center gap-1 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={slot.allMaxBook}
            onChange={(e) => onOption("allMaxBook", e.target.checked)}
            className="w-3 h-3 rounded accent-gold"
          />
          <span className="text-[9px] text-gray-400">풀북</span>
        </label>
        {/* 햄버거 메뉴 — 스킬 북 패널 토글 */}
        <button
          onClick={() => onOption("bookPanelOpen", !slot.bookPanelOpen)}
          className={`p-1 rounded transition-colors cursor-pointer ${slot.bookPanelOpen ? "bg-gold/20 text-gold" : "text-gray-500 hover:text-gray-300"}`}
          title="스킬 북 레벨"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* 스킬 북 레벨 패널 (슬라이드 다운) */}
      {slot.bookPanelOpen && (() => {
        const activeSkills = champ.skills.filter((s) => !isPassive(s) && !isExcluded(s, champ.rarity));
        return (
          <div className="mb-2 bg-input-bg/50 border border-input-border rounded-lg px-2 py-2 space-y-1.5 animate-[slideDown_0.15s_ease-out]">
            {activeSkills.map((skill, idx) => {
              const ms = multChamp?.skills.find((m) => m.name.trim() === skill.name.trim() || m.name.trim() === skill.label.trim());
              const maxLv = ms?.maxBookLevel ?? 0;
              if (maxLv === 0) return (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-[10px] text-gold font-mono w-6">{skill.label}</span>
                  <span className="text-[9px] text-gray-600 truncate flex-1">{skill.name}</span>
                  <span className="text-[9px] text-gray-700">북 없음</span>
                </div>
              );
              const curLv = slot.allMaxBook ? maxLv : (slot.bookLevels[idx] ?? 0);
              // 이 레벨까지의 보너스 요약
              const bonuses: string[] = [];
              let dmgSum = 0;
              let cdSum = 0;
              for (let lv = 1; lv <= curLv; lv++) {
                const b = ms?.books[String(lv)];
                if (b?.type === "Damage") dmgSum += parseInt(b.amount, 10);
                if (b?.type === "Cooldown") cdSum += parseInt(b.amount, 10);
              }
              if (dmgSum > 0) bonuses.push(`+${dmgSum}%`);
              if (cdSum > 0) bonuses.push(`CD-${cdSum}`);

              return (
                <div key={idx}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gold font-mono w-6">{skill.label}</span>
                    <span className="text-[9px] text-gray-400 truncate flex-1">{skill.name}</span>
                    <span className="text-[9px] text-gray-500 flex-shrink-0">
                      {curLv}/{maxLv}
                    </span>
                    {bonuses.length > 0 && (
                      <span className="text-[9px] text-emerald-400 flex-shrink-0">{bonuses.join(" ")}</span>
                    )}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={maxLv}
                    value={curLv}
                    disabled={slot.allMaxBook}
                    onChange={(e) => {
                      const newLevels = [...slot.bookLevels];
                      newLevels[idx] = parseInt(e.target.value, 10);
                      onOption("bookLevels", newLevels);
                    }}
                    className="w-full h-1 accent-gold cursor-pointer disabled:opacity-40"
                  />
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* 스탯 입력 (2열) */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {STAT_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-1">
            <label className="text-[10px] text-gray-500 w-10 text-right font-mono flex-shrink-0">{f.label}</label>
            <input
              type="number"
              value={slot.stats[f.key] || ""}
              onChange={(e) => onStatChange(f.key, Number(e.target.value))}
              placeholder={f.placeholder}
              className="w-full bg-input-bg border border-input-border rounded px-1.5 py-1 text-xs text-white placeholder-gray-700 outline-none focus:border-gold text-right"
            />
          </div>
        ))}
      </div>

      {/* True Speed */}
      {slot.stats.spd > 0 && champ && (
        <div className="mt-2 bg-gold/5 border border-gold/20 rounded-lg px-3 py-1.5 text-center">
          <span className="text-[10px] text-gray-500">True Speed </span>
          <span className="text-sm font-bold text-gold">
            {calcSimSpeed(
              slot.stats.spd, champ.base_speed, slot.setBonusPct, slot.steelEpic,
              speedAuraPct, regionSpd,
            ).toFixed(2)}
          </span>
        </div>
      )}

      {/* 옵션 */}
      <div className="mt-2 border-t border-gray-800 pt-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* 마스터리 */}
          <select
            value={slot.mastery}
            onChange={(e) => onOption("mastery", e.target.value)}
            className="bg-input-bg border border-input-border rounded px-1.5 py-1 text-[10px] text-white outline-none cursor-pointer"
          >
            <option value="warmaster">워마스터</option>
            <option value="giantslayer">자이언트 슬레이어</option>
            <option value="none">T6 없음</option>
          </select>

          {/* 라이프스틸 */}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={slot.lifesteal}
              onChange={(e) => onOption("lifesteal", e.target.checked)}
              className="w-3 h-3 rounded accent-gold"
            />
            <span className="text-[10px] text-gray-400">라이프스틸</span>
          </label>

          {/* 강철의 서사시 */}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={slot.steelEpic}
              onChange={(e) => onOption("steelEpic", e.target.checked)}
              className="w-3 h-3 rounded accent-gold"
            />
            <span className="text-[10px] text-gray-400">강철의 서사시</span>
          </label>

          {/* 세트% — 강철 체크 옆에 인라인 */}
          {slot.steelEpic && (
            <input
              type="number"
              value={slot.setBonusPct || ""}
              onChange={(e) => onOption("setBonusPct", Number(e.target.value))}
              placeholder="12%"
              className="w-12 bg-input-bg border border-input-border rounded px-1 py-0.5 text-[10px] text-white placeholder-gray-700 outline-none focus:border-gold text-center"
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 결과 표시 ───────────────────────────────────────

function SimResult({ result }: { result: MonteCarloResult }) {
  const sorted = [...result.perChampion].sort((a, b) => b.avgDamage - a.avgDamage);

  return (
    <div className="space-y-4">
      {/* 총 데미지 */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="text-center mb-4">
          <p className="text-gray-500 text-sm mb-1">평균 총 데미지 (100회)</p>
          <p className="text-4xl font-bold text-gold">{formatDmg(result.avgTotalDamage)}</p>
          <p className="text-xs text-gray-600 mt-1">
            최소 {formatDmg(result.minTotalDamage)} · 중앙 {formatDmg(result.medianTotalDamage)} · 최대 {formatDmg(result.maxTotalDamage)}
          </p>
          <p className="text-xs text-gray-600">평균 보스 {result.avgBossTurns}턴 생존</p>
        </div>

        {/* 챔피언별 비중 바 */}
        <div className="space-y-2">
          {sorted.map((c) => {
            const colors = ["bg-yellow-500", "bg-purple-500", "bg-blue-500", "bg-emerald-500", "bg-red-500"];
            const ci = result.perChampion.findIndex((p) => p.name === c.name);
            const color = colors[ci % colors.length];

            return (
              <div key={c.name}>
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-white">{c.name}</span>
                  <span className="text-gray-400">
                    {formatDmg(c.avgDamage)} <span className="text-gray-600">({c.pctOfTotal}%)</span>
                  </span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${color} rounded-full transition-all`}
                    style={{ width: `${Math.min(c.pctOfTotal, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 상세 테이블 */}
      <div className="bg-card border border-card-border rounded-xl p-4 overflow-x-auto">
        <h3 className="text-sm text-gray-400 mb-3">데미지 상세 (평균)</h3>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-600 border-b border-gray-800">
              <th className="text-left py-1.5 px-2">챔피언</th>
              <th className="text-right py-1.5 px-2">스킬</th>
              <th className="text-right py-1.5 px-2">WM/GS</th>
              <th className="text-right py-1.5 px-2">반격</th>
              <th className="text-right py-1.5 px-2">포이즌</th>
              <th className="text-right py-1.5 px-2">HP번</th>
              <th className="text-right py-1.5 px-2 text-gold">합계</th>
              <th className="text-right py-1.5 px-2">비중</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.name} className="border-b border-gray-800/50">
                <td className="py-1.5 px-2 text-white">{c.name}</td>
                <td className="py-1.5 px-2 text-right text-gray-400">{formatDmg(c.avgSkillDamage)}</td>
                <td className="py-1.5 px-2 text-right text-gray-400">{formatDmg(c.avgWmgsDamage)}</td>
                <td className="py-1.5 px-2 text-right text-gray-400">{formatDmg(c.avgCounterDamage)}</td>
                <td className="py-1.5 px-2 text-right text-emerald-400">{formatDmg(c.avgPoisonDamage)}</td>
                <td className="py-1.5 px-2 text-right text-orange-400">{formatDmg(c.avgHpBurnDamage)}</td>
                <td className="py-1.5 px-2 text-right text-gold font-semibold">{formatDmg(c.avgDamage)}</td>
                <td className="py-1.5 px-2 text-right text-gray-500">{c.pctOfTotal}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
