/**
 * Speed Tune Engine — 불사 스피드 역산용 독립 시뮬레이션 엔진
 * clan-boss/page.tsx 엔진을 복사하여 독립 운용 (기존 코드 변경 없음)
 */

// ── 인터페이스 ──────────────────────────────────────

export interface BuffDebuff {
  name: string;
  turns: number | null;
}

export interface TmFill {
  target: "all_allies" | "self";
  value: number;
}

export interface CdReduce {
  target: "all_allies" | "other_allies" | "target_ally";
  value: number;
  type: "reduce" | "reset";
}

export interface BuffExtend {
  target: "all_allies" | "other_allies";
  value: number;
}

export interface Skill {
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
}

export interface Champion {
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

export interface SkillConfig {
  label: string;
  cooldown: number;
  priority: number;
  disabled: boolean;
  delay: number;
  cdReduceTarget?: string;
}

export interface SlotInput {
  champion: Champion;
  speed: number;
  speedAura: number;
  skillConfigs: SkillConfig[];
  steelEpic: boolean;
  setBonusPct: number;
}

// ── 시뮬레이션 내부 인터페이스 ──────────────────────

interface ActiveBuff {
  name: string;
  remainingTurns: number;
  sourceSkill: string;
  justApplied?: boolean;
}

interface SimSkill {
  label: string;
  name: string;
  cooldownMax: number;
  cooldownCurrent: number;
  disabled: boolean;
  priority: number;
  buffs: BuffDebuff[];
  extraTurn: boolean;
  tmFill: TmFill[];
  delayRemaining: number;
  cdReduce?: CdReduce;
  cdReduceTarget?: string;
  buffExtend?: BuffExtend;
}

interface SimParticipant {
  name: string;
  displayName: string;
  speed: number;
  slotIndex: number;
  turnMeter: number;
  skills: SimSkill[];
  activeBuffs: ActiveBuff[];
  isChampion: true;
  extraTurnPending: boolean;
  isExtraTurn: boolean;
}

interface BossParticipant {
  name: "Clanboss";
  speed: number;
  turnMeter: number;
  rotationIndex: number;
  isChampion: false;
}

// ── 상수 ──────────────────────────────────────────

export const BOSS_SPEEDS: Record<string, number> = {
  Easy: 130,
  Normal: 140,
  Hard: 150,
  Brutal: 160,
  Nightmare: 170,
  "Ultra Nightmare": 190,
};

const BOSS_ROTATION = ["AOE1", "AOE2", "STUN"] as const;
const TICK_RATE = 0.07;

// ── 유틸 ──────────────────────────────────────────

function isPassive(skill: Skill): boolean {
  if (skill.is_passive) return true;
  if (skill.type === "Passive") return true;
  if (skill.name.includes("[P]") || skill.name.includes("[HP]")) return true;
  if (skill.name.toLowerCase().includes("passive")) return true;
  if (skill.name.includes("(Secret Skill)")) return true;
  return false;
}

function isExcludedSkill(skill: Skill): boolean {
  const n = skill.name.toLowerCase();
  if (n.includes("metamorph")) return true;
  if (n.includes("(aura)") || (skill.label !== "A1" && n.trim() === "aura")) return true;
  if (n.includes("partner") && skill.cooldown > 0) return true;
  return false;
}

function isEffectivelyPassive(skill: Skill, champion: Champion): boolean {
  if (isPassive(skill)) return true;
  if (isExcludedSkill(skill)) return true;
  const labelNum = parseInt(skill.label.replace("A", ""), 10);
  if (labelNum >= 4 && skill.cooldown <= 0 && champion.rarity !== "Mythical") return true;
  return false;
}

export function getActiveSkills(champion: Champion): Skill[] {
  return champion.skills.filter((s) => !isEffectivelyPassive(s, champion));
}

function dedupeEffects(effects: BuffDebuff[]): BuffDebuff[] {
  const seen = new Map<string, BuffDebuff>();
  for (const e of effects) {
    if (!seen.has(e.name) || (e.turns && e.turns > (seen.get(e.name)!.turns || 0))) {
      seen.set(e.name, e);
    }
  }
  return Array.from(seen.values());
}

function calcTrueSpeed(
  enteredSpeed: number,
  baseSpeed: number,
  setBonusPct: number,
  steelEpic: boolean
): number {
  if (!steelEpic || setBonusPct <= 0 || baseSpeed <= 0) return enteredSpeed;
  const setSpeedWithLoS = baseSpeed * (setBonusPct / 100) * 1.15;
  const setSpeedFloored = Math.floor(setSpeedWithLoS);
  const fractional = setSpeedWithLoS - setSpeedFloored;
  return enteredSpeed + fractional;
}

function calcSimSpeed(
  enteredSpeed: number,
  baseSpeed: number,
  setBonusPct: number,
  steelEpic: boolean,
  speedAuraPct: number,
  regionBonusVal: number
): number {
  const trueSpeed = calcTrueSpeed(enteredSpeed, baseSpeed, setBonusPct, steelEpic);
  const auraBonus = baseSpeed * (speedAuraPct / 100);
  return trueSpeed + auraBonus + regionBonusVal;
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
    target.activeBuffs.push({ name: buffName, remainingTurns: turns, sourceSkill });
  }
}

// ── 행동 로그 (불사 체크용) ──────────────────────────

export interface ActionLog {
  bossTurn: number;        // 보스 몇 번째 행동인지
  bossSkill: string;       // AOE1, AOE2, STUN
  champBuffsAtBoss: Map<string, string[]>; // 챔피언이름 → 보스 행동시 갖고있던 버프들
}

// ── 메인 시뮬레이션 (불사 체크 특화) ──────────────────

export interface UkCheckResult {
  success: boolean;        // 50턴 동안 불사/뎀블 유지 성공?
  failTurn: number;        // 실패 시 몇 턴에서 실패?
  failChamp: string;       // 실패 시 누가 노출?
  turnOrder: string[];     // 매 보스턴의 행동 순서 (디버그용)
  logs: ActionLog[];
}

export function checkUnkillable(
  slots: SlotInput[],
  bossSpeed: number,
  speedAuraPct: number,
  regionBonusVal: number = 0,
  maxBossTurns: number = 50,
  requiredBuffs: string[] = ["Unkillable", "Block Damage"] // 둘 중 하나만 있으면 OK
): UkCheckResult {
  const MAX_ITERATIONS = 15000;

  // 참가자 초기화
  const champions: SimParticipant[] = [];
  for (const slot of slots) {
    const champ = slot.champion;
    const simSpeed = calcSimSpeed(
      slot.speed, champ.base_speed, slot.setBonusPct, slot.steelEpic,
      speedAuraPct, regionBonusVal
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
      };
    });
    skills.sort((a, b) => a.priority - b.priority);

    champions.push({
      name: champ.name,
      displayName: champ.display_name,
      speed: simSpeed,
      slotIndex: champions.length,
      turnMeter: 0,
      skills,
      activeBuffs: [],
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
  let safety = 0;
  const logs: ActionLog[] = [];
  const turnOrder: string[] = [];
  let currentTurnActions: string[] = [];

  // 턴 끝 처리
  function finalizeChampionTurn(c: SimParticipant) {
    c.activeBuffs = c.activeBuffs
      .map((b) => {
        if (b.justApplied) return { ...b, justApplied: false };
        return { ...b, remainingTurns: b.remainingTurns - 1 };
      })
      .filter((b) => b.remainingTurns > 0);

    for (const skill of c.skills) {
      if (skill.delayRemaining > 0) skill.delayRemaining--;
      if (skill.cooldownCurrent > 0) skill.cooldownCurrent--;
    }
  }

  // 챔피언 행동
  function championTakeTurn(c: SimParticipant) {
    const a1 = c.skills.find((s) => s.label === "A1")!;
    let chosenSkill = a1;
    for (const skill of c.skills) {
      if (skill.label === "A1") continue;
      if (skill.disabled) continue;
      if (skill.delayRemaining > 0) continue;
      if (skill.cooldownCurrent <= 0 && skill.cooldownMax > 0) {
        chosenSkill = skill;
        break;
      }
    }

    // 버프 적용
    for (const buff of chosenSkill.buffs) {
      if (buff.turns && buff.turns > 0) {
        for (const ally of champions) {
          applyOrRefreshBuff(ally, buff.name, buff.turns, chosenSkill.label);
        }
        const casterBuff = c.activeBuffs.find((b) => b.name === buff.name);
        if (casterBuff) casterBuff.justApplied = true;
      }
    }

    // 버프 연장
    if (chosenSkill.buffExtend) {
      const ext = chosenSkill.buffExtend;
      if (ext.target === "all_allies") {
        for (const ally of champions) {
          for (const b of ally.activeBuffs) b.remainingTurns += ext.value;
        }
      } else if (ext.target === "other_allies") {
        for (const ally of champions) {
          if (ally !== c) {
            for (const b of ally.activeBuffs) b.remainingTurns += ext.value;
          }
        }
      }
    }

    // 쿨다운 설정
    if (chosenSkill.cooldownMax > 0) {
      chosenSkill.cooldownCurrent = chosenSkill.cooldownMax;
    }

    // 행동 기록
    currentTurnActions.push(`${c.displayName}(${chosenSkill.label})`);

    // TM 리셋
    c.turnMeter = 0;

    // TM Fill
    for (const tmFill of chosenSkill.tmFill) {
      if (tmFill.target === "all_allies") {
        for (const ally of champions) ally.turnMeter += tmFill.value;
      } else if (tmFill.target === "self") {
        c.turnMeter += tmFill.value;
      }
    }

    // CD Reduce
    if (chosenSkill.cdReduce) {
      const cdR = chosenSkill.cdReduce;
      const reduceSkills = (target: SimParticipant) => {
        for (const sk of target.skills) {
          if (cdR.type === "reset") sk.cooldownCurrent = 0;
          else sk.cooldownCurrent = Math.max(0, sk.cooldownCurrent - cdR.value);
        }
      };
      if (cdR.target === "all_allies") {
        for (const ally of champions) reduceSkills(ally);
      } else if (cdR.target === "other_allies") {
        for (const ally of champions) { if (ally !== c) reduceSkills(ally); }
      } else if (cdR.target === "target_ally") {
        if (chosenSkill.cdReduceTarget) {
          const target = champions.find(
            (a) => a.name === chosenSkill.cdReduceTarget || a.displayName === chosenSkill.cdReduceTarget
          );
          if (target && target !== c) reduceSkills(target);
        } else {
          const other = champions.find((a) => a !== c);
          if (other) reduceSkills(other);
        }
      }
    }

    // Extra Turn
    if (chosenSkill.extraTurn && !c.isExtraTurn) {
      c.extraTurnPending = true;
    }

    finalizeChampionTurn(c);
  }

  // 시뮬레이션 루프
  type Actor =
    | { type: "champion"; ref: SimParticipant }
    | { type: "boss"; ref: BossParticipant };

  while (bossActionCount < maxBossTurns && safety < MAX_ITERATIONS) {
    safety++;

    // Extra Turn
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

    // 틱
    for (const c of champions) {
      let eff = c.speed;
      if (c.activeBuffs.some((b) => b.name === "Increase SPD")) eff *= 1.3;
      if (c.activeBuffs.some((b) => b.name === "Decrease SPD")) eff *= 0.7;
      c.turnMeter += eff * TICK_RATE;
    }
    boss.turnMeter += boss.speed * TICK_RATE;

    // 행동자 선택
    let actor: Actor | null = null;
    let bestTm = -1;
    let bestSlot = Infinity;

    for (const c of champions) {
      if (c.turnMeter >= 100 - 0.001) {
        if (c.turnMeter > bestTm + 0.001 ||
          (Math.abs(c.turnMeter - bestTm) <= 0.001 && c.slotIndex < bestSlot)) {
          actor = { type: "champion", ref: c };
          bestTm = c.turnMeter;
          bestSlot = c.slotIndex;
        }
      }
    }
    if (boss.turnMeter >= 100 - 0.001 && boss.turnMeter > bestTm + 0.001) {
      actor = { type: "boss", ref: boss };
    }

    if (!actor) continue;

    if (actor.type === "champion") {
      championTakeTurn(actor.ref as SimParticipant);
    } else {
      // 보스 행동
      const bossSkill = BOSS_ROTATION[boss.rotationIndex % 3];
      boss.rotationIndex++;

      // 보스 행동 시점에 각 챔피언의 버프 상태 체크
      const champBuffsAtBoss = new Map<string, string[]>();
      for (const c of champions) {
        champBuffsAtBoss.set(c.displayName, c.activeBuffs.map((b) => b.name));
      }

      logs.push({ bossTurn: bossActionCount, bossSkill, champBuffsAtBoss });

      // 불사 체크: 보스 AoE 시 모든 챔피언이 requiredBuffs 중 하나 이상 보유?
      // Turn 0(첫 보스 행동)은 스킵 — 아직 버프 안 깔린 상태
      if (bossActionCount >= 2) {
        for (const c of champions) {
          const hasProtection = c.activeBuffs.some((b) =>
            requiredBuffs.includes(b.name)
          );
          if (!hasProtection) {
            // 턴 순서 기록 마무리
            currentTurnActions.push(`Boss(${bossSkill})`);
            turnOrder.push(currentTurnActions.join(" → "));
            return {
              success: false,
              failTurn: bossActionCount,
              failChamp: c.displayName,
              turnOrder,
              logs,
            };
          }
        }
      }

      // 턴 순서 기록
      currentTurnActions.push(`Boss(${bossSkill})`);
      turnOrder.push(currentTurnActions.join(" → "));
      currentTurnActions = [];

      boss.turnMeter = 0;
      bossActionCount++;
    }
  }

  return {
    success: true,
    failTurn: -1,
    failChamp: "",
    turnOrder,
    logs,
  };
}

// ── 스피드 범위 탐색 ──────────────────────────────

export interface SpeedRange {
  min: number;
  max: number;
}

export interface TuneResult {
  champName: string;
  validRange: SpeedRange | null;
  testedSpeeds: { speed: number; ok: boolean }[];
}

/**
 * 특정 슬롯의 스피드를 범위 내에서 변화시켜가며 불사 유지 가능한 스피드 범위를 찾음
 */
export function findValidSpeedRange(
  slots: SlotInput[],
  targetSlotIndex: number,
  bossSpeed: number,
  speedAuraPct: number,
  regionBonusVal: number,
  searchMin: number,
  searchMax: number,
  step: number = 1,
  requiredBuffs: string[] = ["Unkillable", "Block Damage"]
): TuneResult {
  const testedSpeeds: { speed: number; ok: boolean }[] = [];
  let validMin = -1;
  let validMax = -1;

  for (let spd = searchMin; spd <= searchMax; spd += step) {
    const testSlots = slots.map((s, i) =>
      i === targetSlotIndex ? { ...s, speed: spd } : s
    );
    const result = checkUnkillable(testSlots, bossSpeed, speedAuraPct, regionBonusVal, 50, requiredBuffs);
    testedSpeeds.push({ speed: spd, ok: result.success });

    if (result.success) {
      if (validMin === -1) validMin = spd;
      validMax = spd;
    }
  }

  return {
    champName: slots[targetSlotIndex].champion.display_name,
    validRange: validMin >= 0 ? { min: validMin, max: validMax } : null,
    testedSpeeds,
  };
}
