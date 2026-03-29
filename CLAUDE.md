@AGENTS.md

# 레이드: 그림자의 전설 - 클랜보스 계산기

## 프로젝트 개요
DeadwoodJedi 스타일의 클랜보스 스피드튠 계산기 웹앱.
배포: Vercel (`raid-tools-virid.vercel.app`)

## 기술 스택
- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** (PostCSS 플러그인)
- 한국어 UI

## 핵심 파일
- `src/app/clan-boss/page.tsx` — 클랜보스 시뮬레이터 (UI + 시뮬레이션 엔진, 메인 파일)
- `src/app/page.tsx` — 랜딩 페이지
- `src/components/Navbar.tsx` — 네비게이션
- `public/data/champions_unified.json` — 챔피언 통합 데이터 (945명)

## 데이터 파이프라인
프로젝트 루트(`C:/Users/willy/Desktop/레이드/`)에 원본 데이터 존재:
- `hellhades.xlsx` — HellHades 챔피언 목록 (이미지, 진영, 속성)
- `base_speed.xlsx` — 챔피언별 기본 속도
- `champions_skills.json` — HellHades API에서 크롤링한 스킬 데이터
- `mythical_alt_forms.json` — 미시컬 변신폼 스킬
- `build_unified.py` — 위 데이터를 병합하여 `champions_unified.json` 생성

### 스킬 데이터 필드 (champions_unified.json)
각 스킬 객체에 포함되는 필드:
- `label`, `name`, `type`, `cooldown` — 기본 정보
- `booked_cooldown` — 북 적용 후 최소 쿨다운 (Level X: Cooldown -Y 파싱)
- `buffs[]`, `debuffs[]` — `[Bracket]` 형식 + 정규식으로 추출
- `extra_turn` — "Grants an Extra Turn" 여부
- `tm_fill[]` — 턴미터 충전 (target: all_allies/self, value: %)
- `cd_reduce` — 쿨다운 감소 (target/value/type: reduce|reset)
- `buff_extend` — 버프 연장 (target/value)
- `is_passive` — 패시브 스킬 여부

### 수동 보정 필요 데이터
- 없음 (champions_unified.json은 원본 그대로 사용)

## 시뮬레이션 엔진 핵심 로직

### 턴미터 (DeadwoodJedi 방식 — 이산 틱)
- **이산(discrete) 틱**: 매 틱마다 모든 참가자의 TM += effectiveSpeed × 0.07. 오버슈트 허용 (여러 참가자가 동시에 100 초과 가능)
- TM >= 100이면 행동 (가장 높은 TM 우선, 동률 시 **슬롯 순서** 타이브레이커 — 리더=0부터)
- **행동 후: `TM = 0`** (오버플로우 완전 제거)
- 루프 순서: **반드시 틱 1회 → TM >= 100 확인 → 있으면 행동 → 다시 틱** (tick-first 모델)
- **핵심**: 매 행동 후 반드시 1틱이 지나야 다음 행동자 결정. 추가 턴만 예외 (틱 없이 즉시 행동)

### 속도 버프/디버프
- `Increase SPD`: effectiveSpeed × 1.3
- `Decrease SPD`: effectiveSpeed × 0.7
- 매 틱마다 activeBuffs 확인하여 적용

### 스피드 계산
- **True Speed** = `입력속도 + fractional_part(기본속도 × 세트보너스% × 1.15)` (강철의 서사시 ON 시)
- **Sim Speed** = `trueSpeed + (기본속도 × 스피드오라%) + 지역보너스`
  - 입력값은 챔피언 페이지 속도 (오라 미포함)
  - 오라는 전체 값(base × aura%)을 더함
  - 예: Ruella 294 + 112×0.19 = 294 + 21.28 = 315.28 (DWJ 일치)

### 스킬 쿨다운
- 스킬 사용 시 `cooldownCurrent = cooldownMax`
- `cooldownMax`는 `booked_cooldown` 우선, 없으면 원본 `cooldown` 사용
- 턴 끝에 **사용한 스킬 포함** 모든 스킬 CD -1
- CD=4 → 실질 3턴 대기 후 재사용 가능

### 보스 로테이션
AOE1 → AOE2 → STUN (3턴 주기)

### 버프 시스템
- 버프는 **모든 아군에게** 적용 (팀 전체 대상)
- 각 아군이 독립적으로 버프 지속턴 추적
- 자기 턴 끝에 본인의 버프 지속턴 -1
- 동일 버프 재적용 시 지속턴 갱신 (중복 안 쌓임)

### 특수 메커니즘
- **Extra Turn**: 즉시 추가 행동 (TM=100, 틱 없음, 연쇄 불가, `isExtraTurn` 플래그로 제어)
- **TM Fill**: `tm_fill` 배열의 target/value로 아군 턴미터에 flat 값 추가 (0~100 스케일). **TM Reset 후에 적용** — 시전자도 자기 Fill 혜택 유지 (예: 시커 A2 후 TM=30)
- **CD Reduce**: `cd_reduce`의 target/value/type으로 아군 스킬 쿨 감소 (reduce: 값만큼, reset: 0으로)
- **Buff Extend**: `buff_extend`의 target/value로 아군 버프 지속턴 연장
- **Skill Delay**: 첫 N턴간 해당 스킬 사용 유보 (Open 순서 구현용)
- **Passive 필터**: `is_passive: true`인 스킬은 시뮬레이션에서 제외

## 검증 현황
- **기본 팀** (Maneater/Godseeker/WhiteDryad/Chani/Dracomorph): ✅ DWJ 일치
- **Myth-Rue-Elva** (Ruella 315/Demytha 314/Elva 254/Seeker 207/DPS 172): ✅ Turn 0~50+ 안정 루프 확인
  - Turn 2부터 Demytha A3(Block Damage)가 매 보스턴 직전에 사용되는 패턴 반복

## 주의사항
- 챔피언 데이터 변경 시 `build_unified.py` 실행 후 `public/data/`에 복사
- 보스 스턴 타겟팅 AI (5단계 로직) 미구현
- 엔진 모듈 분리 미완료 (현재 page.tsx에 UI+엔진 통합)
