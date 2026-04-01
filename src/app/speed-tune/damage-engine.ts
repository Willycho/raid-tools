// ══════════════════════════════════════════════════════
//  정공덱 데미지 계산 엔진 — 몬테카를로 시뮬레이션
//  - 턴미터 기반 틱 시뮬레이션
//  - 확률 기반 랜덤 (크리, WM/GS, 디버프 적용)
//  - N회 반복 → 평균/최소/최대 산출
// ══════════════════════════════════════════════════════

// ── 보스 스탯 ───────────────────────────────────────

export interface BossStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  res: number;
  acc: number;
}

export const BOSS_STATS: Record<string, BossStats> = {
  Easy:              { hp: 19_021_215,    atk: 1350, def: 294,  spd: 90,  res: 30,  acc: 0   },
  Normal:            { hp: 60_616_860,    atk: 1699, def: 369,  spd: 120, res: 50,  acc: 30  },
  Hard:              { hp: 194_130_195,   atk: 2033, def: 442,  spd: 140, res: 75,  acc: 40  },
  Brutal:            { hp: 361_551_060,   atk: 2750, def: 598,  spd: 160, res: 100, acc: 75  },
  Nightmare:         { hp: 652_752_210,   atk: 3898, def: 847,  spd: 170, res: 150, acc: 150 },
  "Ultra Nightmare": { hp: 1_171_204_605, atk: 6993, def: 1520, spd: 190, res: 225, acc: 225 },
};

// ── 보스 턴별 Raw 데미지 (UNM 기준) ────────────────

interface RawDmgEntry {
  turn: number;
  aoe1: number;
  aoe2: number;
  stunPct: number;
}

const UNM_RAW_DMG: RawDmgEntry[] = [
  { turn: 1,  aoe1: 27_972,    aoe2: 26_224,    stunPct: 0.20 },
  { turn: 4,  aoe1: 27_972,    aoe2: 26_224,    stunPct: 0.20 },
  { turn: 7,  aoe1: 27_972,    aoe2: 26_224,    stunPct: 0.20 },
  { turn: 10, aoe1: 48_951,    aoe2: 65_559,    stunPct: 0.65 },
  { turn: 13, aoe1: 111_888,   aoe2: 124_563,   stunPct: 1.10 },
  { turn: 16, aoe1: 174_825,   aoe2: 183_566,   stunPct: 1.55 },
  { turn: 19, aoe1: 237_762,   aoe2: 249_126,   stunPct: 2.10 },
  { turn: 22, aoe1: 321_678,   aoe2: 327_797,   stunPct: 2.70 },
  { turn: 25, aoe1: 405_594,   aoe2: 406_468,   stunPct: 3.30 },
  { turn: 28, aoe1: 489_510,   aoe2: 485_139,   stunPct: 3.90 },
  { turn: 31, aoe1: 573_426,   aoe2: 563_811,   stunPct: 4.50 },
  { turn: 34, aoe1: 657_342,   aoe2: 642_482,   stunPct: 5.10 },
  { turn: 37, aoe1: 741_258,   aoe2: 721_153,   stunPct: 5.70 },
  { turn: 40, aoe1: 825_174,   aoe2: 799_824,   stunPct: 6.30 },
  { turn: 43, aoe1: 909_090,   aoe2: 878_496,   stunPct: 6.90 },
  { turn: 46, aoe1: 993_006,   aoe2: 957_167,   stunPct: 7.50 },
  { turn: 49, aoe1: 1_076_922, aoe2: 1_035_838, stunPct: 8.10 },
  { turn: 52, aoe1: 1_160_838, aoe2: 1_114_509, stunPct: 8.70 },
  { turn: 55, aoe1: 1_244_754, aoe2: 1_193_181, stunPct: 9.30 },
  { turn: 58, aoe1: 1_328_670, aoe2: 1_271_852, stunPct: 9.90 },
  { turn: 61, aoe1: 1_412_586, aoe2: 1_350_523, stunPct: 10.50 },
  { turn: 64, aoe1: 1_496_502, aoe2: 1_429_194, stunPct: 11.10 },
];

// ── 상수 ────────────────────────────────────────────

const TICK_RATE = 0.07;
const DEF_CONSTANT = 600;
const MAX_BOSS_DEBUFFS = 10;
const COUNTER_DMG_MULT = 0.75; // 반격 데미지 25% 감소
const MAX_ITERATIONS = 20000;

// 클랜보스 디버프 면역 목록
const BOSS_IMMUNE_DEBUFFS = new Set([
  "stun", "freeze", "sleep", "provoke", "fear", "truefear", "true fear",
  "petrification", "blockactiveskills", "blockpassiveskills",
  "decreasespd", "decreasespeed",   // SPD 감소 면역
  "bombdamage", "bomb",
  "decreasemaxhp",                  // 최대 HP 파괴 면역
  "decreaseTurnMeter",              // TM 감소 면역 (normBuff: "decreaseturnmeter")
  "turnmeterdecrease",
  "hpswap", "swaphp",               // HP 교환 면역
]);

function isBossImmune(debuffName: string): boolean {
  return BOSS_IMMUNE_DEBUFFS.has(normBuff(debuffName));
}

// ── 포이즌/WM/GS 캡 ────────────────────────────────

const POISON_CAP: Record<string, number> = {
  Easy: 20_000, Normal: 30_000, Hard: 40_000,
  Brutal: 50_000, Nightmare: 50_000, "Ultra Nightmare": 50_000,
};
const HP_BURN_CAP = 75_000;
const WMGS_CAP = 75_000;
const TRG_HP_RAW_CAP = 75_000; // 적 최대HP 기반 스킬 raw 데미지 캡 (크릿 전)

// ── 챔피언 패시브 정의 ─────────────────────────────
// slug 기반으로 적용. 엔진 내부에서 자동 처리.

interface PassiveDef {
  /** 아군 전체 받는 데미지 감소 (0~1) */
  allyDmgReduce?: number;
  /** 본인 AOE 받는 데미지 감소 (0~1) */
  selfAoeDmgReduce?: number;
  /** 본인 싱글타겟 받는 데미지 감소 (0~1) — STUN도 포함 */
  selfSingleDmgReduce?: number;
  /** 라운드 시작(보스턴 직후 첫 챔프 턴) 시 독 부여 개수 */
  roundStartPoisons?: number;
  /** 매 자기 턴 시작 시 확률적 독 부여 (50%) */
  turnStartPoisonChance?: number;
  /** 보스 공격 시 HP Burn 반사 (Geomancer 스타일) */
  hpBurnReflectOnBossAtk?: boolean;
  /** 부활 스킬 인덱스 (0-based) — 해당 스킬 사용 시 죽은 아군 부활 */
  reviveSkillIdx?: number;
  /** 부활 타입: "all" = 전체, "single" = 1명 */
  reviveType?: "all" | "single";
  /** 부활 시 HP% (0~1) */
  reviveHpPct?: number;
  /** 본인 사망 시 자가 부활 (1회) */
  selfReviveOnDeath?: boolean;
  /** 자가 부활 HP% */
  selfReviveHpPct?: number;
}

const CHAMPION_PASSIVES: Record<string, PassiveDef> = {
  // Duchess Lilitu: 아군 전체 받는 데미지 20% 감소 (Veil of Night 패시브)
  "duchess-lilitu": {
    allyDmgReduce: 0.20,
    reviveSkillIdx: 2,      // A3 (Spectral Rebirth)
    reviveType: "all",
    reviveHpPct: 0.70,
    selfReviveOnDeath: true, // A4 패시브: 본인 사망 시 자가부활
    selfReviveHpPct: 0.30,
  },
  // Acrizia: AOE 공격 받는 데미지 50% 감소 (Hardened Carapace 패시브)
  "acrizia": { selfAoeDmgReduce: 0.50 },
  // Kalvalax: 라운드 시작 4x 5% 독, 매 턴 50% 확률 1x 독
  "kalvalax": { roundStartPoisons: 4, turnStartPoisonChance: 50 },
  // Geomancer: 보스 공격 시 HP Burn 반사 (Giant Slayer 효과 + HP Burn 데미지)
  "geomancer": { hpBurnReflectOnBossAtk: true },
  // Dracomorph: 없음 (모든 건 스킬로 처리)
  // Cardiel: 패시브 15% 아군 조인어택은 allyAttack으로 처리
};

// ── 입력 인터페이스 ─────────────────────────────────

export interface ChampStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  cRate: number;   // 0~100
  cDmg: number;    // 50~300+
  res: number;
  acc: number;
}

export interface SkillBuff {
  name: string;
  turns: number;
  target: "all_allies" | "self";
}

export interface SkillDebuff {
  name: string;
  turns: number;
  chance: number;  // 스킬 발동 확률 0~100 (기본 100)
}

export interface SkillFormula {
  formula: string;         // "3.5*ATK", "0.02*TRG_HP" 등
  hits: number;
}

export interface DmgSkillInput {
  label: string;           // A1, A2, A3
  formulas: SkillFormula[];// 모든 데미지 계수 (ATK + TRG_HP 등 합산)
  hits: number;            // 히트 수 (GS용, 기본 1)
  cooldown: number;        // 북 적용 쿨다운
  bookDmgBonus: number;    // 스킬북 데미지 보너스 (0~0.35)
  buffs: SkillBuff[];
  debuffs: SkillDebuff[];
  extraTurn: boolean;
  tmFill: { target: "all_allies" | "self"; value: number }[];
  allyAttack?: boolean;    // 협공 (아군 1명이 A1으로 추가 공격)
}

export type Affinity = "Void" | "Spirit" | "Force" | "Magic";

export interface DmgChampionInput {
  name: string;
  slug: string;
  baseSpeed: number;
  affinity: Affinity;     // 챔피언 속성
  stats: ChampStats;
  skills: DmgSkillInput[];
  mastery: "warmaster" | "giantslayer" | "none";
  lifestealPct: number;   // 라이프스틸 세트 0.15
  steelEpic: boolean;     // 강철의 서사시 (Lore of Steel) on/off
  setBonusPct: number;    // 스피드 세트 보너스 총 % (12, 24, 36...)
  defIgnorePct: number;   // 유물 DEF 무시 % (새비지 25, 크루얼 5, 중첩 가능)
}

// ── 속성 상성 ──────────────────────────────────────
// Magic > Spirit > Force > Magic, Void = 중립

/** 공격자 → 방어자 상성: "strong" | "weak" | "neutral" */
function getAffinityRelation(attacker: Affinity, defender: Affinity): "strong" | "weak" | "neutral" {
  if (attacker === "Void" || defender === "Void") return "neutral";
  if (attacker === defender) return "neutral";
  // Magic > Spirit > Force > Magic
  if (
    (attacker === "Magic" && defender === "Spirit") ||
    (attacker === "Spirit" && defender === "Force") ||
    (attacker === "Force" && defender === "Magic")
  ) return "strong";
  return "weak";
}

export interface RegionBonus {
  hpPct: number;           // HP +2~20%
  atkPct: number;          // ATK +2~20%
  defPct: number;          // DEF +2~20%
  defIgnorePct: number;    // DEF 무시 +2~20%
  spd: number;             // SPD +2~20 (flat)
  cDmgPct: number;         // C.DMG +3~30%
  res: number;             // RES +8~80 (flat)
  acc: number;             // ACC +8~80 (flat)
}

export const EMPTY_REGION_BONUS: RegionBonus = {
  hpPct: 0, atkPct: 0, defPct: 0, defIgnorePct: 0,
  spd: 0, cDmgPct: 0, res: 0, acc: 0,
};

export interface DmgSimConfig {
  difficulty: string;
  bossAffinity: Affinity;
  champions: DmgChampionInput[];
  speedAuraPct: number;    // 리더 스피드 오라 %
  region: RegionBonus;     // 지역 보너스
  trials: number;          // 몬테카를로 횟수 (기본 100)
  debug?: boolean;         // 디버그 로그 수집 (첫 trial만)
}

// ── 결과 인터페이스 ─────────────────────────────────

export interface ChampDmgBreakdown {
  name: string;
  skillDamage: number;
  wmgsDamage: number;
  counterDamage: number;
  poisonDamage: number;
  hpBurnDamage: number;
  totalDamage: number;
  turnsAlive: number;
}

export interface DebugLogEntry {
  tick: number;
  actor: string;          // 챔피언 이름 or "BOSS"
  action: string;         // 스킬 이름 or 보스 행동
  detail: string;         // 데미지, 디버프 등 상세
  bossDebuffs: string[];  // 현재 보스 디버프 목록
  champHp: string[];      // 챔피언 HP 상태
}

export interface SingleSimResult {
  totalDamage: number;
  bossTurns: number;
  perChampion: ChampDmgBreakdown[];
  debugLog?: DebugLogEntry[];
}

export interface MonteCarloResult {
  avgTotalDamage: number;
  minTotalDamage: number;
  maxTotalDamage: number;
  medianTotalDamage: number;
  avgBossTurns: number;
  perChampion: {
    name: string;
    avgDamage: number;
    avgSkillDamage: number;
    avgWmgsDamage: number;
    avgPoisonDamage: number;
    avgHpBurnDamage: number;
    avgCounterDamage: number;
    pctOfTotal: number;
  }[];
  trials: number;
  debugLog?: DebugLogEntry[];
}

// ── 내부 시뮬 상태 ──────────────────────────────────

interface ActiveBuff {
  name: string;
  remainingTurns: number;
}

interface BossDebuff {
  name: string;
  remainingTurns: number;
  sourceIdx: number; // 어떤 챔피언이 건 건지
}

interface SimChamp {
  idx: number;
  name: string;
  slug: string;
  affinity: Affinity;
  stats: ChampStats;
  skills: DmgSkillInput[];
  mastery: "warmaster" | "giantslayer" | "none";
  lifestealPct: number;
  simSpeed: number;
  champDefIgnore: number; // 유물 DEF 무시 비율 (0~0.3)
  // 런타임 상태
  currentHp: number;
  alive: boolean;
  turnMeter: number;
  skillCooldowns: number[];
  activeBuffs: ActiveBuff[];
  extraTurnPending: boolean;
  isExtraTurn: boolean;
  passive: PassiveDef | null;
  selfReviveUsed: boolean; // 자가부활 패시브 사용 여부
  // 결과 집계
  result: ChampDmgBreakdown;
}

// ── 스피드 계산 (True Speed → Sim Speed) ────────────

/**
 * True Speed 계산
 * 강철의 서사시(Lore of Steel): 세트 스피드 보너스 × 1.15의 소수점 부분을 추가
 */
export function calcTrueSpeed(
  enteredSpeed: number,
  baseSpeed: number,
  setBonusPct: number,
  steelEpic: boolean,
): number {
  if (!steelEpic || setBonusPct <= 0 || baseSpeed <= 0) return enteredSpeed;
  const setSpeedWithLoS = baseSpeed * (setBonusPct / 100) * 1.15;
  const setSpeedFloored = Math.floor(setSpeedWithLoS);
  const fractional = setSpeedWithLoS - setSpeedFloored;
  return enteredSpeed + fractional;
}

/**
 * Sim Speed = TrueSpeed + 스피드오라 + 지역보너스(SPD flat)
 */
export function calcSimSpeed(
  enteredSpeed: number,
  baseSpeed: number,
  setBonusPct: number,
  steelEpic: boolean,
  speedAuraPct: number,
  regionSpdFlat: number,
): number {
  const trueSpeed = calcTrueSpeed(enteredSpeed, baseSpeed, setBonusPct, steelEpic);
  const auraBonus = baseSpeed * (speedAuraPct / 100);
  return trueSpeed + auraBonus + regionSpdFlat;
}

/**
 * 지역 보너스가 적용된 전투용 스탯 계산
 * HP/ATK/DEF는 %보너스, SPD는 simSpeed에서 처리, C.DMG는 %가산, RES/ACC는 flat
 */
function applyRegionToStats(stats: ChampStats, region: RegionBonus): ChampStats {
  return {
    hp: Math.floor(stats.hp * (1 + region.hpPct / 100)),
    atk: Math.floor(stats.atk * (1 + region.atkPct / 100)),
    def: Math.floor(stats.def * (1 + region.defPct / 100)),
    spd: stats.spd,  // SPD는 simSpeed에서 별도 처리
    cRate: stats.cRate,
    cDmg: stats.cDmg + region.cDmgPct,
    res: stats.res + region.res,
    acc: stats.acc + region.acc,
  };
}

// ── 유틸 함수 ───────────────────────────────────────

function roll(pct: number): boolean {
  return Math.random() * 100 < pct;
}

/** ACC vs RES 적중 확률: MAX(3, MIN(100, 100 - (RES-ACC)/5)) */
function accVsRes(acc: number, res: number): boolean {
  const hitChance = Math.max(3, Math.min(100, 100 - (res - acc) / 5));
  return roll(hitChance);
}

/** 디버프 적용 시도: 스킬확률 → ACC vs RES */
function tryDebuff(skillChance: number, acc: number, bossRes: number): boolean {
  if (!roll(skillChance)) return false;
  return accVsRes(acc, bossRes);
}

function defFactor(targetDef: number): number {
  if (targetDef <= 0) return 1;
  return DEF_CONSTANT / (targetDef + DEF_CONSTANT);
}

/** 멀티플라이어 문자열 → 데미지 계산 */
export function evaluateMultiplier(formula: string, stats: ChampStats, bossHp: number = 0): number {
  if (!formula) return 0;
  // TRG_HP를 먼저 치환 (HP보다 먼저 해야 충돌 방지)
  let replaced = formula.toUpperCase();
  replaced = replaced.replace(/TRG_HP/g, String(bossHp));
  replaced = replaced.replace(/ENEMY_MAX_HP/g, String(bossHp));
  replaced = replaced
    .replace(/ATK/g, String(stats.atk))
    .replace(/(?<!TRG_)HP/g, String(stats.hp))
    .replace(/DEF/g, String(stats.def))
    .replace(/SPD/g, String(stats.spd));
  const sanitized = replaced.replace(/[^0-9+\-*/.() ]/g, "");
  if (!sanitized) return 0;
  try {
    const result = Function(`"use strict"; return (${sanitized});`)();
    return typeof result === "number" && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

function getRawDmg(bossTurn: number): RawDmgEntry {
  let entry = UNM_RAW_DMG[0];
  for (const e of UNM_RAW_DMG) {
    if (e.turn <= bossTurn) entry = e;
    else break;
  }
  return entry;
}

/** 버프 이름 정규화 (대소문자, 공백, 마침표 차이 흡수) */
function normBuff(name: string): string {
  return name.toLowerCase().replace(/[\s.]+/g, "");
}

function hasBuff(buffs: ActiveBuff[], name: string): boolean {
  const n = normBuff(name);
  return buffs.some((b) => normBuff(b.name) === n);
}

function hasDebuff(debuffs: BossDebuff[], name: string): boolean {
  const n = normBuff(name);
  return debuffs.some((d) => normBuff(d.name) === n);
}

/** 쉴드 계열 버프 체크 (Shield, Magma Shield 등 "shield" 포함 버프) */
function hasShieldBuff(buffs: ActiveBuff[]): boolean {
  return buffs.some((b) => normBuff(b.name).includes("shield"));
}

type BossSkill = "AOE1" | "AOE2" | "STUN";
// 모든 속성 동일 로테이션: AOE1 → AOE2 → STUN
const BOSS_ROTATION: BossSkill[] = ["AOE1", "AOE2", "STUN"];

// ── 단일 시뮬레이션 ────────────────────────────────

export function runSingleSim(config: DmgSimConfig): SingleSimResult {
  const boss = BOSS_STATS[config.difficulty];
  if (!boss) throw new Error(`Unknown difficulty: ${config.difficulty}`);

  const rotation = BOSS_ROTATION;
  const poisonCap = POISON_CAP[config.difficulty] ?? 50_000;

  const region = config.region;
  const defIgnorePct = region.defIgnorePct / 100; // 0~0.2

  // 챔피언 초기화 — 지역 보너스 적용된 스탯 사용
  const champs: SimChamp[] = config.champions.map((c, i) => {
    const regionStats = applyRegionToStats(c.stats, region);
    return {
      idx: i,
      name: c.name,
      slug: c.slug,
      affinity: c.affinity,
      stats: regionStats,
      skills: c.skills,
      mastery: c.mastery,
      lifestealPct: c.lifestealPct,
      champDefIgnore: c.defIgnorePct / 100,
      simSpeed: calcSimSpeed(
        c.stats.spd, c.baseSpeed, c.setBonusPct, c.steelEpic,
        config.speedAuraPct, region.spd,
      ),
      currentHp: regionStats.hp,
      alive: true,
      turnMeter: 0,
      skillCooldowns: c.skills.map(() => 0),
      activeBuffs: [],
      extraTurnPending: false,
      isExtraTurn: false,
      passive: CHAMPION_PASSIVES[c.slug] ?? null,
      selfReviveUsed: false,
      result: {
        name: c.name,
        skillDamage: 0, wmgsDamage: 0, counterDamage: 0,
        poisonDamage: 0, hpBurnDamage: 0, totalDamage: 0, turnsAlive: 0,
      },
    };
  });

  // 보스 상태
  let bossTm = 0;
  let bossRotIdx = 0;
  let bossTurnCount = 0;
  const bossDebuffs: BossDebuff[] = [];
  let totalDamage = 0;
  let safety = 0;

  // 디버그 로그
  const debug = config.debug ?? false;
  const debugLog: DebugLogEntry[] = [];
  let tickCount = 0;

  function snapshot(): { bossDebs: string[]; champHps: string[] } {
    return {
      bossDebs: bossDebuffs.map((d) => `${d.name}(${d.remainingTurns}t)`),
      champHps: champs.map((c) => c.alive ? `${c.name}:${c.currentHp}/${c.stats.hp}` : `${c.name}:DEAD`),
    };
  }

  function log(actor: string, action: string, detail: string) {
    if (!debug) return;
    const s = snapshot();
    debugLog.push({ tick: tickCount, actor, action, detail, bossDebuffs: s.bossDebs, champHp: s.champHps });
  }

  // ── 챔피언 스킬 데미지 계산 ──
  function calcHitDamage(c: SimChamp, skill: DmgSkillInput): number {
    // 스탯 복사 + ATK 버프
    const s = { ...c.stats };
    if (hasBuff(c.activeBuffs, "Increase ATK")) s.atk = Math.floor(s.atk * 1.5);
    else if (hasBuff(c.activeBuffs, "Increase ATK (Small)")) s.atk = Math.floor(s.atk * 1.25);

    // ATK/DEF/HP 기반과 TRG_HP 기반 분리
    let baseDmg = 0;    // ATK/DEF/HP 스케일링 (DEF 경감 적용)
    let trgHpDmg = 0;   // 적 최대HP 스케일링 (75k 캡, DEF 무시)
    for (const f of skill.formulas) {
      const upper = f.formula.toUpperCase();
      if (upper.includes("TRG_HP") || upper.includes("ENEMY_MAX_HP")) {
        trgHpDmg += evaluateMultiplier(f.formula, s, boss.hp);
      } else {
        baseDmg += evaluateMultiplier(f.formula, s, boss.hp);
      }
    }

    // TRG_HP 캡 적용 (raw 75k, 크릿 전)
    if (trgHpDmg > TRG_HP_RAW_CAP) trgHpDmg = TRG_HP_RAW_CAP;

    // 보스 DEF 경감 — ATK 기반에만 적용 (TRG_HP는 DEF 무시)
    let effDef = boss.def * (1 - defIgnorePct) * (1 - c.champDefIgnore);
    if (hasDebuff(bossDebuffs, "Decrease DEF")) effDef *= 0.4;
    else if (hasDebuff(bossDebuffs, "Decrease DEF (Small)")) effDef *= 0.7;
    baseDmg *= defFactor(effDef);

    let dmg = baseDmg + trgHpDmg;
    if (dmg <= 0) return 0;

    // 스킬북
    dmg *= (1 + skill.bookDmgBonus);

    // 속성 상성: 약타/강타
    const relation = getAffinityRelation(c.affinity, config.bossAffinity);
    const isWeakHit = relation === "weak" && roll(35); // 약타: 35% 확률

    if (isWeakHit) {
      // 약타: 크리 불가 + 데미지 -20%
      dmg *= 0.8;
    } else {
      // 크리티컬 (랜덤) — 크확/크뎀 버프 반영
      let effCRate = c.stats.cRate;
      let effCDmg = c.stats.cDmg;
      if (hasBuff(c.activeBuffs, "Increase C.RATE")) effCRate += 30;
      if (hasBuff(c.activeBuffs, "Increase C.DMG")) effCDmg += 30;
      if (roll(Math.min(effCRate, 100))) {
        dmg *= (1 + effCDmg / 100);
      }
      // 강타: +30%
      if (relation === "strong") dmg *= 1.3;
    }

    // Strengthen
    if (hasBuff(c.activeBuffs, "Strengthen")) dmg *= 1.25;
    else if (hasBuff(c.activeBuffs, "Strengthen (Small)")) dmg *= 1.15;

    // Weaken on boss
    if (hasDebuff(bossDebuffs, "Weaken")) dmg *= 1.25;
    else if (hasDebuff(bossDebuffs, "Weaken (Small)")) dmg *= 1.15;

    return Math.floor(dmg);
  }

  // ── WM/GS 프록 계산 ──
  function calcWmgsProc(c: SimChamp, hits: number): number {
    const weakened = hasDebuff(bossDebuffs, "Weaken");
    let dmg = 0;

    if (c.mastery === "warmaster") {
      // 60% 확률, 스킬당 1회
      if (roll(60)) {
        let proc = boss.hp * 0.04;
        if (weakened) proc *= 1.25;
        dmg += Math.min(proc, WMGS_CAP);
      }
    } else if (c.mastery === "giantslayer") {
      // 히트당 30%
      for (let h = 0; h < hits; h++) {
        if (roll(30)) {
          let proc = boss.hp * 0.02;
          if (weakened) proc *= 1.25;
          dmg += Math.min(proc, WMGS_CAP);
        }
      }
    }
    return Math.floor(dmg);
  }

  // ── 보스 디버프 추가 헬퍼 (면역 체크 + 슬롯 체크 + 로그) ──
  function tryApplyBossDebuff(deb: SkillDebuff, acc: number, sourceIdx: number, actorName: string) {
    if (bossDebuffs.length >= MAX_BOSS_DEBUFFS) return;
    if (isBossImmune(deb.name)) {
      log(actorName, "면역", `${deb.name} — 보스 면역 (적용 불가)`);
      return;
    }
    if (tryDebuff(deb.chance, acc, boss.res)) {
      if (deb.name.includes("Poison") || deb.name === "HP Burn") {
        bossDebuffs.push({ name: deb.name, remainingTurns: deb.turns, sourceIdx });
      } else {
        const existing = bossDebuffs.findIndex((d) => d.name === deb.name);
        if (existing >= 0) {
          bossDebuffs[existing].remainingTurns = deb.turns;
          bossDebuffs[existing].sourceIdx = sourceIdx;
        } else {
          bossDebuffs.push({ name: deb.name, remainingTurns: deb.turns, sourceIdx });
        }
      }
      log(actorName, "디버프", `${deb.name} ${deb.turns}턴 적용 (슬롯 ${bossDebuffs.length}/${MAX_BOSS_DEBUFFS})`);
    }
  }

  // ── 패시브: Kalvalax 게임 시작 시 4개 독 부여 (CB는 라운드 없으므로 첫 시작만) ──
  let gameStartPoisonsDone = false;

  function doGameStartPoisons() {
    if (gameStartPoisonsDone) return;
    gameStartPoisonsDone = true;
    for (const c of champs) {
      if (!c.alive || !c.passive?.roundStartPoisons) continue;
      const count = c.passive.roundStartPoisons;
      for (let p = 0; p < count; p++) {
        if (bossDebuffs.length >= MAX_BOSS_DEBUFFS) break;
        bossDebuffs.push({ name: "Poison", remainingTurns: 2, sourceIdx: c.idx });
      }
      log(c.name, "패시브", `게임 시작 독 ${count}개 부여`);
    }
  }

  // ── 챔피언 행동 ──
  function champTakeTurn(c: SimChamp) {
    // 게임 시작 독 (최초 1회만)
    doGameStartPoisons();

    // 턴 시작: Continuous Heal 틱 — 스택별 각각 7.5% 회복
    const healStacks = c.activeBuffs.filter((b) => normBuff(b.name) === normBuff("Continuous Heal")).length;
    if (healStacks > 0) {
      const healAmt = Math.floor(c.stats.hp * 0.075) * healStacks;
      c.currentHp = Math.min(c.stats.hp, c.currentHp + healAmt);
      if (healStacks > 1) log(c.name, "회복", `Continuous Heal x${healStacks} → +${healAmt.toLocaleString()}`);
    }

    // 턴 시작: 패시브 독 (Kalvalax: 50% 확률 1x 독)
    if (c.passive?.turnStartPoisonChance && bossDebuffs.length < MAX_BOSS_DEBUFFS) {
      if (roll(c.passive.turnStartPoisonChance)) {
        bossDebuffs.push({ name: "Poison", remainingTurns: 2, sourceIdx: c.idx });
        log(c.name, "패시브", `턴 시작 독 1개 부여 (슬롯 ${bossDebuffs.length}/${MAX_BOSS_DEBUFFS})`);
      }
    }

    // 스킬 선택 (A3 > A2 > A1, CD=0인 것 중 가장 높은 스킬)
    let chosenIdx = 0;
    for (let si = c.skills.length - 1; si >= 1; si--) {
      if (c.skillCooldowns[si] <= 0 && c.skills[si].cooldown > 0) {
        chosenIdx = si;
        break;
      }
    }
    const skill = c.skills[chosenIdx];

    // 스킬 데미지
    const hitDmg = calcHitDamage(c, skill);
    const wmgsDmg = calcWmgsProc(c, skill.hits);
    const totalHitDmg = hitDmg + wmgsDmg;

    if (totalHitDmg > 0) {
      totalDamage += totalHitDmg;
      c.result.skillDamage += hitDmg;
      c.result.wmgsDamage += wmgsDmg;
      c.result.totalDamage += totalHitDmg;

      // 라이프스틸 회복
      if (c.lifestealPct > 0) {
        const healed = Math.floor(totalHitDmg * c.lifestealPct);
        c.currentHp = Math.min(c.stats.hp, c.currentHp + healed);
      }
    }

    log(c.name, `${skill.label}(${skill.formulas.map(f=>f.formula).join("+")})`,
      `hit=${hitDmg.toLocaleString()} wm/gs=${wmgsDmg.toLocaleString()} total=${totalHitDmg.toLocaleString()}`);

    // 디버프 적용 시도 (면역 체크 포함)
    for (const deb of skill.debuffs) {
      tryApplyBossDebuff(deb, c.stats.acc, c.idx, c.name);
    }

    // 버프 적용
    for (const buff of skill.buffs) {
      const targets = buff.target === "all_allies" ? champs.filter((ch) => ch.alive) : [c];
      for (const t of targets) {
        const existing = t.activeBuffs.findIndex((b) => b.name === buff.name);
        if (existing >= 0) {
          t.activeBuffs[existing].remainingTurns = buff.turns;
        } else {
          t.activeBuffs.push({ name: buff.name, remainingTurns: buff.turns });
        }
      }
    }

    // 부활 스킬 효과: 스킬 사용 시 죽은 아군 부활
    if (c.passive?.reviveSkillIdx === chosenIdx) {
      const revType = c.passive.reviveType ?? "single";
      const revHp = c.passive.reviveHpPct ?? 0.5;
      for (const target of champs) {
        if (target.alive || target.idx === c.idx) continue;
        target.alive = true;
        target.currentHp = Math.floor(target.stats.hp * revHp);
        // 부활 시 버프도 적용 (skill.buffs와 동일)
        for (const buff of skill.buffs) {
          if (buff.target === "all_allies") {
            const existing = target.activeBuffs.findIndex((b) => b.name === buff.name);
            if (existing >= 0) target.activeBuffs[existing].remainingTurns = buff.turns;
            else target.activeBuffs.push({ name: buff.name, remainingTurns: buff.turns });
          }
        }
        log(c.name, "부활", `${target.name} → HP ${target.currentHp} (${Math.round(revHp*100)}%)`);
        if (revType === "single") break; // single이면 1명만
      }
    }

    // 쿨다운
    if (chosenIdx > 0 && skill.cooldown > 0) {
      c.skillCooldowns[chosenIdx] = skill.cooldown;
    }

    // TM 리셋
    c.turnMeter = 0;

    // TM Fill
    for (const tmf of skill.tmFill) {
      if (tmf.target === "all_allies") {
        for (const ally of champs) if (ally.alive) ally.turnMeter += tmf.value;
      } else {
        c.turnMeter += tmf.value;
      }
    }

    // 협공 (Ally Attack): 랜덤 아군 1명이 A1으로 공격
    if (skill.allyAttack) {
      const allies = champs.filter((a) => a.alive && a.idx !== c.idx);
      if (allies.length > 0) {
        const ally = allies[Math.floor(Math.random() * allies.length)];
        const a1 = ally.skills[0];
        if (a1) {
          const allyHitDmg = calcHitDamage(ally, a1);
          const allyWmgs = calcWmgsProc(ally, a1.hits);
          const allyTotal = allyHitDmg + allyWmgs;
          if (allyTotal > 0) {
            totalDamage += allyTotal;
            ally.result.skillDamage += allyHitDmg;
            ally.result.wmgsDamage += allyWmgs;
            ally.result.totalDamage += allyTotal;
            if (ally.lifestealPct > 0) {
              ally.currentHp = Math.min(ally.stats.hp, ally.currentHp + Math.floor(allyTotal * ally.lifestealPct));
            }
          }
          log(c.name, "협공", `${ally.name} A1 hit=${allyHitDmg.toLocaleString()} wm/gs=${allyWmgs.toLocaleString()}`);
          // 협공 시 A1 디버프도 적용
          for (const deb of a1.debuffs) {
            tryApplyBossDebuff(deb, ally.stats.acc, ally.idx, `${ally.name}(협공)`);
          }
        }
      }
    }

    // Extra Turn
    if (skill.extraTurn && !c.isExtraTurn) {
      c.extraTurnPending = true;
    }

    // 턴 종료: 자기 버프 -1, 스킬 CD -1
    c.activeBuffs = c.activeBuffs
      .map((b) => ({ ...b, remainingTurns: b.remainingTurns - 1 }))
      .filter((b) => b.remainingTurns > 0);
    for (let si = 0; si < c.skillCooldowns.length; si++) {
      if (c.skillCooldowns[si] > 0) c.skillCooldowns[si]--;
    }

    c.result.turnsAlive++;
  }

  // ── 반격 (A1 데미지) ──
  function doCounterAttack(c: SimChamp) {
    if (!c.alive || c.skills.length === 0) return;
    const a1 = c.skills[0];
    const hitDmg = Math.floor(calcHitDamage(c, a1) * COUNTER_DMG_MULT);
    const wmgsDmg = calcWmgsProc(c, a1.hits); // WM/GS는 풀 데미지

    const total = hitDmg + wmgsDmg;
    if (total > 0) {
      totalDamage += total;
      c.result.counterDamage += total;
      c.result.totalDamage += total;

      if (c.lifestealPct > 0) {
        c.currentHp = Math.min(c.stats.hp, c.currentHp + Math.floor(total * c.lifestealPct));
      }
    }
    // 반격 시 A1 디버프도 적용
    for (const deb of a1.debuffs) {
      tryApplyBossDebuff(deb, c.stats.acc, c.idx, `${c.name}(반격)`);
    }
    log(c.name, "반격", `hit=${hitDmg.toLocaleString()} wm/gs=${wmgsDmg.toLocaleString()}`);
  }

  // ── 보스 행동 ──
  function bossTakeTurn() {
    bossTurnCount++;
    const bossSkill = rotation[(bossRotIdx++) % 3];

    log("BOSS", `턴 ${bossTurnCount} (${bossSkill})`, `디버프 ${bossDebuffs.length}개`);

    // 1) 포이즌/HP번 틱 (보스 턴 시작)
    const hasPoisonSens = hasDebuff(bossDebuffs, "Poison Sensitivity");
    let poisonTotal = 0;
    for (const deb of bossDebuffs) {
      let tickDmg = 0;
      if (deb.name === "Poison") {
        tickDmg = Math.min(boss.hp * 0.05, poisonCap);
        if (hasPoisonSens) tickDmg = Math.floor(tickDmg * 1.25); // Poison Sensitivity +25%
      } else if (deb.name === "Poison (Small)") {
        tickDmg = Math.min(boss.hp * 0.025, Math.floor(poisonCap / 2));
        if (hasPoisonSens) tickDmg = Math.floor(tickDmg * 1.25);
      } else if (deb.name === "HP Burn") {
        tickDmg = Math.min(boss.hp * 0.03, HP_BURN_CAP);
      }
      if (tickDmg > 0) {
        tickDmg = Math.floor(tickDmg);
        totalDamage += tickDmg;
        poisonTotal += tickDmg;
        const src = champs[deb.sourceIdx];
        if (src) {
          if (deb.name.includes("Poison")) src.result.poisonDamage += tickDmg;
          else src.result.hpBurnDamage += tickDmg;
          src.result.totalDamage += tickDmg;
        }
      }
    }
    if (poisonTotal > 0) log("BOSS", "독/번 틱", `총 ${poisonTotal.toLocaleString()} 데미지${hasPoisonSens ? " (독감 +25%)" : ""}`);

    // 2) 보스 → 챔피언 데미지
    const rawEntry = getRawDmg(bossTurnCount);
    const atkScale = boss.atk / BOSS_STATS["Ultra Nightmare"].atk;

    const hasDecAtk = hasDebuff(bossDebuffs, "Decrease ATK");
    const hasDecAtkSmall = !hasDecAtk && hasDebuff(bossDebuffs, "Decrease ATK (Small)");

    let rawAoe1 = rawEntry.aoe1 * atkScale;
    let rawAoe2 = rawEntry.aoe2 * atkScale;

    if (config.bossAffinity === "Void") rawAoe1 *= 0.9;
    if (hasDecAtk) { rawAoe1 *= 0.5; rawAoe2 *= 0.5; }
    else if (hasDecAtkSmall) { rawAoe1 *= 0.75; rawAoe2 *= 0.75; }

    // 패시브: Duchess 등 아군 전체 받는 데미지 감소 계산
    let allyDmgReduceTotal = 0;
    for (const c of champs) {
      if (c.alive && c.passive?.allyDmgReduce) {
        allyDmgReduceTotal += c.passive.allyDmgReduce;
      }
    }
    allyDmgReduceTotal = Math.min(allyDmgReduceTotal, 0.5); // 최대 50% 캡

    const isAoe = bossSkill === "AOE1" || bossSkill === "AOE2";

    for (const c of champs) {
      if (!c.alive) continue;

      // Block Damage → 데미지 0
      if (hasBuff(c.activeBuffs, "Block Damage")) {
        log("BOSS", "블록", `${c.name} Block Damage로 피해 무효화`);
        continue;
      }

      let dmg: number;
      if (bossSkill === "STUN") {
        // 스턴 데미지 = HP% 기반이지만 Decrease ATK 적용
        let stunRaw = c.stats.hp * rawEntry.stunPct;
        if (hasDecAtk) stunRaw *= 0.5;
        else if (hasDecAtkSmall) stunRaw *= 0.75;
        dmg = Math.floor(stunRaw);
      } else {
        const raw = bossSkill === "AOE1" ? rawAoe1 : rawAoe2;
        let effDef = c.stats.def;
        if (hasBuff(c.activeBuffs, "Increase DEF")) effDef = Math.floor(effDef * 1.6);
        else if (hasBuff(c.activeBuffs, "Increase DEF (Small)")) effDef = Math.floor(effDef * 1.3);
        const reduction = effDef / (effDef + DEF_CONSTANT);
        dmg = Math.floor(raw * (1 - reduction));
      }

      // Shield 계열 버프 흡수 (Shield, Magma Shield 등 — 간소화: 데미지 30% 감소)
      if (hasShieldBuff(c.activeBuffs)) dmg = Math.floor(dmg * 0.7);

      // Ally Protection (아군 보호: 피해 분산 — 간소화: 15% 감소)
      if (hasBuff(c.activeBuffs, "Ally Protection")) dmg = Math.floor(dmg * 0.85);

      // 패시브: 아군 전체 받는 데미지 감소 (Duchess 등)
      if (allyDmgReduceTotal > 0) {
        dmg = Math.floor(dmg * (1 - allyDmgReduceTotal));
      }

      // 패시브: 본인 AOE 데미지 감소 (Acrizia 등)
      if (isAoe && c.passive?.selfAoeDmgReduce) {
        dmg = Math.floor(dmg * (1 - c.passive.selfAoeDmgReduce));
      }

      // 패시브: 본인 싱글타겟 데미지 감소 (STUN 포함)
      if (!isAoe && c.passive?.selfSingleDmgReduce) {
        dmg = Math.floor(dmg * (1 - c.passive.selfSingleDmgReduce));
      }

      c.currentHp -= dmg;
      if (c.currentHp <= 0) {
        // 1) Revive on Death 버프 체크
        if (hasBuff(c.activeBuffs, "Revive on Death") || hasBuff(c.activeBuffs, "Revive on Death Buff")) {
          c.currentHp = Math.floor(c.stats.hp * 0.3);
          c.activeBuffs = c.activeBuffs.filter((b) =>
            normBuff(b.name) !== normBuff("Revive on Death") &&
            normBuff(b.name) !== normBuff("Revive on Death Buff")
          );
          log("BOSS", "부활(버프)", `${c.name} Revive on Death → HP ${c.currentHp}`);
        }
        // 2) 자가 부활 패시브 (Duchess A4 등) — 1회만
        else if (c.passive?.selfReviveOnDeath && !c.selfReviveUsed) {
          c.selfReviveUsed = true;
          c.currentHp = Math.floor(c.stats.hp * (c.passive.selfReviveHpPct ?? 0.3));
          log("BOSS", "자가부활", `${c.name} 패시브 자가부활 → HP ${c.currentHp}`);
        }
        // 3) 사망
        else {
          c.alive = false;
          log("BOSS", "사망", `${c.name} HP=${c.currentHp} (${bossSkill} ${dmg.toLocaleString()} 데미지)`);
        }
      }
    }

    // 3) Geomancer 패시브: 보스 공격 시 HP Burn 반사
    for (const c of champs) {
      if (!c.alive || !c.passive?.hpBurnReflectOnBossAtk) continue;
      // 보스 공격당 1회, HP Burn 있을 때 4% boss HP (캡 75k)
      if (hasDebuff(bossDebuffs, "HP Burn")) {
        let reflectDmg = Math.min(boss.hp * 0.04, 75_000);
        if (hasDebuff(bossDebuffs, "Weaken")) reflectDmg *= 1.25;
        reflectDmg = Math.floor(reflectDmg);
        totalDamage += reflectDmg;
        c.result.hpBurnDamage += reflectDmg;
        c.result.totalDamage += reflectDmg;
        log(c.name, "패시브반사", `HP Burn 반사 ${reflectDmg.toLocaleString()}`);
      }
    }

    // 4) 반격: Counter Attack 버프가 있는 챔피언 전원 A1
    for (const c of champs) {
      if (c.alive && hasBuff(c.activeBuffs, "Counter Attack")) {
        doCounterAttack(c);
      }
    }

    // 5) 보스 디버프 턴 감소
    for (let i = bossDebuffs.length - 1; i >= 0; i--) {
      bossDebuffs[i].remainingTurns--;
      if (bossDebuffs[i].remainingTurns <= 0) bossDebuffs.splice(i, 1);
    }

    // 6) 보스 TM 리셋
    bossTm = 0;
  }

  // ── 메인 루프 (턴미터 틱 시뮬레이션) ──
  while (bossTurnCount < 100 && safety < MAX_ITERATIONS) {
    safety++;

    // Extra Turn 처리
    let extraHandled = false;
    for (const c of champs) {
      if (c.extraTurnPending && c.alive) {
        c.extraTurnPending = false;
        c.isExtraTurn = true;
        champTakeTurn(c);
        c.isExtraTurn = false;
        extraHandled = true;
        break;
      }
    }
    if (extraHandled) continue;

    // 틱: TM 증가
    tickCount++;
    for (const c of champs) {
      if (!c.alive) continue;
      let eff = c.simSpeed;
      if (hasBuff(c.activeBuffs, "Increase SPD")) eff *= 1.3;
      if (hasBuff(c.activeBuffs, "Decrease SPD")) eff *= 0.7;
      c.turnMeter += eff * TICK_RATE;
    }
    let bossEff = boss.spd;
    if (hasDebuff(bossDebuffs, "Decrease SPD")) bossEff *= 0.7;
    bossTm += bossEff * TICK_RATE;

    // 행동자 선택: TM >= 100인 최고 TM (동률시 슬롯순)
    let actor: "boss" | SimChamp | null = null;
    let bestTm = -1;
    let bestSlot = Infinity;

    for (const c of champs) {
      if (!c.alive) continue;
      if (c.turnMeter >= 100 - 0.001) {
        if (c.turnMeter > bestTm + 0.001 || (Math.abs(c.turnMeter - bestTm) <= 0.001 && c.idx < bestSlot)) {
          actor = c;
          bestTm = c.turnMeter;
          bestSlot = c.idx;
        }
      }
    }
    if (bossTm >= 100 - 0.001 && bossTm > bestTm + 0.001) {
      actor = "boss";
    }

    if (!actor) continue;

    if (actor === "boss") {
      bossTakeTurn();

      // 전멸 체크
      if (!champs.some((c) => c.alive)) break;
    } else {
      champTakeTurn(actor);
    }
  }

  return {
    totalDamage,
    bossTurns: bossTurnCount,
    perChampion: champs.map((c) => c.result),
    debugLog: debug ? debugLog : undefined,
  };
}

// ── 몬테카를로 시뮬레이션 ───────────────────────────

export function runMonteCarlo(config: DmgSimConfig): MonteCarloResult {
  const trials = config.trials || 100;
  const results: SingleSimResult[] = [];

  // 첫 trial만 debug 모드로 실행
  for (let t = 0; t < trials; t++) {
    const trialConfig = t === 0 && config.debug ? config : { ...config, debug: false };
    results.push(runSingleSim(trialConfig));
  }

  // 총 데미지 통계
  const damages = results.map((r) => r.totalDamage).sort((a, b) => a - b);
  const avgTotal = Math.floor(damages.reduce((a, b) => a + b, 0) / trials);
  const minTotal = damages[0];
  const maxTotal = damages[damages.length - 1];
  const medianTotal = damages[Math.floor(trials / 2)];
  const avgBossTurns = Math.round(results.reduce((a, r) => a + r.bossTurns, 0) / trials * 10) / 10;

  // 챔피언별 평균
  const champCount = config.champions.length;
  const perChampion = Array.from({ length: champCount }, (_, i) => {
    const name = config.champions[i].name;
    let totalSkill = 0, totalWmgs = 0, totalPoison = 0, totalHpBurn = 0, totalCounter = 0, totalAll = 0;

    for (const r of results) {
      const pc = r.perChampion[i];
      totalSkill += pc.skillDamage;
      totalWmgs += pc.wmgsDamage;
      totalPoison += pc.poisonDamage;
      totalHpBurn += pc.hpBurnDamage;
      totalCounter += pc.counterDamage;
      totalAll += pc.totalDamage;
    }

    const avgDmg = Math.floor(totalAll / trials);
    return {
      name,
      avgDamage: avgDmg,
      avgSkillDamage: Math.floor(totalSkill / trials),
      avgWmgsDamage: Math.floor(totalWmgs / trials),
      avgPoisonDamage: Math.floor(totalPoison / trials),
      avgHpBurnDamage: Math.floor(totalHpBurn / trials),
      avgCounterDamage: Math.floor(totalCounter / trials),
      pctOfTotal: avgTotal > 0 ? Math.round(avgDmg / avgTotal * 1000) / 10 : 0,
    };
  });

  return {
    avgTotalDamage: avgTotal,
    minTotalDamage: minTotal,
    maxTotalDamage: maxTotal,
    medianTotalDamage: medianTotal,
    avgBossTurns,
    perChampion,
    trials,
    debugLog: results[0].debugLog,
  };
}
