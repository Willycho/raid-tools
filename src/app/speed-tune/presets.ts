/**
 * 불사 조합 프리셋 — 유명 불사 조합의 스피드 가이드라인
 *
 * 각 프리셋은:
 * - 필수 챔피언 slug (핵심 불사 챔프)
 * - DPS 슬롯 수
 * - 각 슬롯별 권장 스피드 범위
 * - 스킬 설정 (priority, delay 등)
 */

export interface CompSlot {
  role: string;        // "Maneater", "Heiress", "DPS" 등
  slug?: string;       // 고정 챔피언 slug (DPS는 null)
  isDps: boolean;      // DPS 슬롯인지
  speedGuide: {        // 권장 스피드 범위 (UNM 기준)
    unm: { min: number; max: number };
    nm?: { min: number; max: number };
  };
  skillSetup: {        // 스킬 설정
    label: string;
    priority: number;
    delay?: number;
    disabled?: boolean;
  }[];
  notes?: string;      // 참고사항
}

export interface CompPreset {
  id: string;
  name: string;
  nameKr: string;
  description: string;
  slots: CompSlot[];
  speedAura?: number;  // 필요한 스피드 오라 (0이면 불필요)
  difficulty: string;  // 권장 난이도
}

export const COMP_PRESETS: CompPreset[] = [
  {
    id: "budget-uk",
    name: "Budget Unkillable",
    nameKr: "가성비 불사 (맨이터+페인킵퍼)",
    description: "맨이터의 A3(Unkillable 2턴) + 페인킵퍼 TM부스트 + 쿨감으로 매 턴 불사 유지",
    difficulty: "Ultra Nightmare",
    speedAura: 0,
    slots: [
      {
        role: "Maneater",
        slug: "maneater",
        isDps: false,
        speedGuide: { unm: { min: 218, max: 220 } },
        skillSetup: [
          { label: "A2", priority: 1 },
          { label: "A3", priority: 0 },  // 불사가 최우선
        ],
        notes: "A3(Unkillable) 최우선, A2는 그 다음",
      },
      {
        role: "Pain Keeper",
        slug: "pain-keeper",
        isDps: false,
        speedGuide: { unm: { min: 218, max: 225 } },
        skillSetup: [
          { label: "A2", priority: 0 },  // TM Boost + CD감소
          { label: "A3", priority: 1 },
        ],
        notes: "A2(아군 쿨감/TM부스트) 최우선",
      },
      {
        role: "DPS 1",
        isDps: true,
        speedGuide: { unm: { min: 175, max: 185 } },
        skillSetup: [],
        notes: "1:1 비율, 보스보다 느려야 함",
      },
      {
        role: "DPS 2",
        isDps: true,
        speedGuide: { unm: { min: 175, max: 185 } },
        skillSetup: [],
      },
      {
        role: "DPS 3",
        isDps: true,
        speedGuide: { unm: { min: 175, max: 185 } },
        skillSetup: [],
      },
    ],
  },
  {
    id: "double-me",
    name: "Double Maneater",
    nameKr: "더블 맨이터",
    description: "맨이터 2마리로 불사를 교대 유지, DPS 3명 운용",
    difficulty: "Ultra Nightmare",
    speedAura: 0,
    slots: [
      {
        role: "Fast Maneater",
        slug: "maneater",
        isDps: false,
        speedGuide: { unm: { min: 265, max: 270 } },
        skillSetup: [
          { label: "A3", priority: 0 },
        ],
        notes: "빠른 맨이터 — 2:1 비율",
      },
      {
        role: "Slow Maneater",
        slug: "maneater",
        isDps: false,
        speedGuide: { unm: { min: 218, max: 220 } },
        skillSetup: [
          { label: "A3", priority: 0 },
        ],
        notes: "느린 맨이터 — 1:1 비율",
      },
      {
        role: "DPS 1",
        isDps: true,
        speedGuide: { unm: { min: 174, max: 186 } },
        skillSetup: [],
      },
      {
        role: "DPS 2",
        isDps: true,
        speedGuide: { unm: { min: 174, max: 186 } },
        skillSetup: [],
      },
      {
        role: "DPS 3",
        isDps: true,
        speedGuide: { unm: { min: 174, max: 186 } },
        skillSetup: [],
      },
    ],
  },
  {
    id: "myth-heir",
    name: "Myth-Heir",
    nameKr: "미스히어 (데미사+히어리스)",
    description: "데미사 A3(Block Damage) + 히어리스 Extra Turn으로 매 턴 뎀블 유지",
    difficulty: "Ultra Nightmare",
    speedAura: 0,
    slots: [
      {
        role: "Demytha",
        slug: "demytha",
        isDps: false,
        speedGuide: { unm: { min: 276, max: 284 } },
        skillSetup: [
          { label: "A3", priority: 0 },  // Block Damage 최우선
          { label: "A2", priority: 1 },
        ],
        notes: "A3(Block Damage 2턴) 최우선",
      },
      {
        role: "Heiress",
        slug: "heiress",
        isDps: false,
        speedGuide: { unm: { min: 270, max: 278 } },
        skillSetup: [
          { label: "A2", priority: 0 },  // 히어리스 A2 사용시 Extra Turn
        ],
        notes: "A2 사용 → Extra Turn으로 버프 연장/리프레시",
      },
      {
        role: "Seeker",
        slug: "seeker",
        isDps: false,
        speedGuide: { unm: { min: 205, max: 212 } },
        skillSetup: [
          { label: "A2", priority: 0 },  // TM 부스트
        ],
        notes: "선택적 — 시커 A2 TM부스트로 턴 순서 안정화",
      },
      {
        role: "DPS 1",
        isDps: true,
        speedGuide: { unm: { min: 171, max: 179 } },
        skillSetup: [],
      },
      {
        role: "DPS 2",
        isDps: true,
        speedGuide: { unm: { min: 171, max: 179 } },
        skillSetup: [],
      },
    ],
  },
  {
    id: "myth-fu",
    name: "Myth-Fu",
    nameKr: "미스푸 (데미사+푸샨)",
    description: "데미사 A3(Block Damage) + 푸샨의 A2(Turn Meter) 조합",
    difficulty: "Ultra Nightmare",
    speedAura: 0,
    slots: [
      {
        role: "Demytha",
        slug: "demytha",
        isDps: false,
        speedGuide: { unm: { min: 278, max: 286 } },
        skillSetup: [
          { label: "A3", priority: 0 },
          { label: "A2", priority: 1 },
        ],
      },
      {
        role: "Fu-Shan",
        slug: "fu-shan",
        isDps: false,
        speedGuide: { unm: { min: 189, max: 198 } },
        skillSetup: [
          { label: "A2", priority: 0 },
          { label: "A3", priority: 1 },
        ],
        notes: "A2(TM 부스트) 우선",
      },
      {
        role: "Heiress",
        slug: "heiress",
        isDps: false,
        speedGuide: { unm: { min: 270, max: 278 } },
        skillSetup: [
          { label: "A2", priority: 0 },
        ],
      },
      {
        role: "DPS 1",
        isDps: true,
        speedGuide: { unm: { min: 171, max: 179 } },
        skillSetup: [],
      },
      {
        role: "DPS 2",
        isDps: true,
        speedGuide: { unm: { min: 171, max: 179 } },
        skillSetup: [],
      },
    ],
  },
];
