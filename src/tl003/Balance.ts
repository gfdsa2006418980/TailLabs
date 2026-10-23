/**
 * In-run balance knobs. Targets come from spec v0.4 §7 and §9 and are checked by
 * tests/tl003-balance.test.mjs with an active-play bot (spends money, casts skills).
 *
 * §9 per-minute targets: player effective DPS ×2.00, enemy HP ×1.80, total income ×1.85–1.95.
 * 2026-10-23 (stages): enemy HP grows ×1.35 a minute with cards at ×0.7 (CARD_POWER), measured so a bot with the
 * whole blueprint at Lv0 clears 1–2 stages, at Lv5 (half of T1) is on the edge of all 20, at Lv7 clears them.
 * Spawn frequency grows 1.1^(3 × minutes) since the 2026-10-21 amendment, so the per-kill
 * reward only grows by INCOME_GROWTH / spawn growth: total income stays on target.
 */
export const SPAWN_GROWTH_SPEED = 3;
export const SPAWN_GROWTH_PER_MINUTE = 1.1 ** SPAWN_GROWTH_SPEED;
export const INCOME_GROWTH_PER_MINUTE = 1.9;
export const KILL_REWARD_GROWTH_PER_MINUTE = INCOME_GROWTH_PER_MINUTE / SPAWN_GROWTH_PER_MINUTE;
export const WAVE_REWARD_GROWTH_PER_MINUTE = INCOME_GROWTH_PER_MINUTE;
export const ENEMY_HP_GROWTH_PER_MINUTE = 1.8;
/**
 * Every zombie's HP (boss included) × this. 2026-10-23: kept at ×1 by the user's decision; with fixed card
 * values the bot's zero-talent first run passes the first boss in about 1% of runs (measured: ×0.35 → 44%,
 * ×0.3 → 51%, ×0.4 → 28%, ×0.6 → 9%).
 */
export const ENEMY_HP_SCALE = 0.35;
export const ENEMY_ATTACK_GROWTH_PER_MINUTE = 1.45;

/**
 * §18: cost ×1.15 per level is fixed by the spec; the damage gained per level is tuned here.
 * The base cost is low so the first run buys an upgrade every few kills; the boss rush, not an
 * unaffordable shop, ends a zero-talent run.
 */
export const UPGRADE_BASE_COST = 10;
export const UPGRADE_COST_GROWTH = 1.15;
/** 2026-10-23: halved again (+12% → +6% a level; the flamer +6.5% → +3.25%), milestones too. */
export const MERC_DAMAGE_PER_LEVEL = 1.06;
export const FLAME_DAMAGE_PER_LEVEL = 1.0325;
/** Milestone bonuses: damage ×1.5 at Lv10 and ×2 at Lv50, attack speed ×1.25 at Lv25 (were ×2, ×3, ×1.5). */
export const MILESTONE_LV10 = 1.5;
export const MILESTONE_LV50 = 2;
export const MILESTONE_LV25_SPEED = 1.25;
/**
 * 2026-10-23: mercenaries and active skills are no longer bought with money; they come from the
 * level-up cards. Until the squad has three members, every choice offers 1–2 mercenaries.
 */
export const MAX_SQUAD = 3;
export const MAX_SKILLS = 3;

/**
 * Build-up statuses (2026-10-23 decision): each hit of an element fills a meter by
 * `final damage × rate`; the meter's threshold is a share of the enemy's max HP, so bosses are hard to
 * control and late waves are not frozen wholesale. A full meter triggers the control, empties, and
 * every trigger within STATUS_WINDOW seconds raises the next threshold by +200% of the base
 * (×1, ×3, ×5, …) until the window passes without one.
 */
export const STATUS = {
  /** 冷凍: slows while filling, then freezes (no movement) and deals frostbite as cold damage. */
  chill: { rate: 2, threshold: 0.6, duration: 2, burst: 0.1, slow: 0.5 },
  /** 電能: raises damage taken while filling, then paralyses (no barricade damage) with an electric burst of 10% max HP (2026-10-23). */
  shock: { rate: 2, threshold: 0.6, duration: 4, burst: 0.1, vulnerability: 0.5 },
  /** 爆裂: stuns (no movement). */
  stun: { rate: 1.5, threshold: 0.8, duration: 4, burst: 0 },
  /**
   * 火焰 (2026-10-23, like 冷凍): fire hits fill the ignite meter; a full one ignites for `duration` seconds, burning
   * `tick` of max HP once a second (as fire damage over time, so fire bonuses and resistance apply).
   */
  ignite: { rate: 2, threshold: 0.6, duration: 4, burst: 0, tick: 0.02 },
} as const;
export const STATUS_ESCALATION = 2;
export const STATUS_WINDOW = 10;
/** A meter that is not fed for this long drains by METER_DRAIN of its threshold per second. */
export const METER_IDLE = 1.5;
export const METER_DRAIN = 0.15;
/** 毒素: flat toxin points subtract from defense; reaching zero detonates once per zombie for 5% of its max HP around it. */
export const TOXIN_DURATION = 6;
export const TOXIN_BURST = 0.05;
export const TOXIN_BURST_RADIUS = 55;
/** Each zombie's defense varies ±25% around its kind's value. */
export const DEFENSE_SPREAD = 0.25;

/**
 * Core 以牆為彈 (reworked 黑市補給, 2026-10-23): every mercenary adds this share of the barricade's
 * current health to its damage per second (split over its shots, so fast guns get no extra), and the
 * barricade takes this much more damage.
 */
export const BULWARK_SHARE = 0.08;
export const BULWARK_WALL_DAMAGE = 1.3;

/**
 * Core 血債血償 (reworked 2026-10-23): all damage × (1 + (BLOOD_MAX − 1) × missing barricade share),
 * so ×1.5 at half health and ×2 at the brink. Every skill cast costs BLOOD_SKILL_COST of max health
 * (never below 1). It reaches every damage source, so the cap stays modest.
 */
export const BLOOD_MAX = 2;
export const BLOOD_SKILL_COST = 0.04;

/**
 * The searchlight sweeps the road on game time. Core 探照獵殺 (reworked 定點防禦): lit zombies take
 * ×SEARCHLIGHT_FACTOR damage, unlit ones ÷SEARCHLIGHT_FACTOR; the beam widens and the guns prefer lit targets.
 */
/**
 * Area damage falloff (2026-10-23, for performance and so crowds resist splash):
 * - Instant area damage shares a budget of `full` hits: up to `full` targets take full damage; past that,
 *   every target takes full ÷ count. Only the `cap` nearest to the centre are processed at all.
 * - Lingering areas (fire zones, gas clouds) act on at most ZONE_CAP nearest targets per pulse, at full strength.
 * Skills fire every few seconds; auto-attack splash and chain explosions fire many times a second, so
 * they get the smaller numbers.
 */
export const AREA = {
  skill: { full: 12, cap: 40 },
  auto: { full: 6, cap: 16 },
} as const;
export const ZONE_CAP = 20;

export const SEARCHLIGHT_RADIUS = 55;
export const SEARCHLIGHT_WIDE_RADIUS = 95;
export const SEARCHLIGHT_FACTOR = 2;

/**
 * Barricade. Max HP must grow slower than the money spent on it
 * (ln(1 + gain) / ln(cost growth) < 1), otherwise the wall outscales enemy attack forever.
 */
export const BARRICADE_BASE_HEALTH = 40;
export const FORTIFY_BASE_COST = 10;
export const FORTIFY_COST_GROWTH = 1.35;
export const FORTIFY_HEALTH_GAIN = 0.25;
export const REPAIR_BASE_COST = 6;
export const REPAIR_COST_GROWTH = 1.15;
export const REPAIR_FRACTION = 0.4;

/** Fraction of the opening rifle's skill cooldown still charging at deployment (0 = ready, 1 = full cooldown). */
export const SKILL_START_CHARGE = 0;

/**
 * Stages (2026-10-23, Brotato-like): stage 1 lasts STAGE_FIRST_SECONDS, each later one STAGE_STEP_SECONDS more,
 * at most STAGE_MAX_SECONDS. When the clock runs out the stage's boss charges in; once it is down the spawns stop,
 * and when the road is clear the squad rests: the level-ups banked during the stage are picked one after another,
 * money can be spent, and the player starts the next stage. Clearing STAGE_COUNT stages wins the run.
 */
export const STAGE_FIRST_SECONDS = 15;
export const STAGE_STEP_SECONDS = 2;
export const STAGE_MAX_SECONDS = 50;
export const STAGE_COUNT = 20;
/**
 * v2 (2026-10-23 retrospective): enemy strength, spawn rate and income follow the stage, never the clock. A stage is
 * "worth" STAGE_PACE_MINUTES of the old per-minute curves, so stage n plays like minute (n − 1) × pace of the old
 * curve whatever the time on the clock; replaying an early stage with more talents feels faster, not the same.
 * Danger level d (unlocked by clearing all stages at d − 1) plays later stages progressively later (dangerShift, up to
 * DANGER_STAGE_SHIFT × d at the last stage), with tougher zombies, and pays (1 + d) × the talent points.
 */
export const STAGE_PACE_MINUTES = 0.75;
export const DANGER_STAGE_SHIFT = 10;
export const DANGER_MAX = 10;
/**
 * Danger (2026-10-23 rework, the user's choice): stage 1 plays like danger 0 and the shift builds up stage by stage,
 * reaching DANGER_STAGE_SHIFT × danger stages at the last stage, so progress is gradual instead of all-or-nothing at
 * stage 1. On top, every zombie's HP × DANGER_HP^danger and defense × DANGER_DEFENSE^danger.
 */
export const DANGER_HP = 1.5;
export const DANGER_DEFENSE = 1.2;
export const dangerShift = (stage: number, danger: number) => danger * DANGER_STAGE_SHIFT * Math.max(0, stage - 1) / (STAGE_COUNT - 1);
/** Talent points for a run: every cleared stage n pays n, × (1 + danger). A full clear at danger 0 pays 210. */
export const stagePoints = (cleared: number, danger = 0) => Math.round(cleared * (cleared + 1) / 2 * (1 + danger));
/** Core slots open on the first clear of these stages (one slot from the start). */
export const CORE_SLOT_STAGES = [10, 20] as const;
export const stageSeconds = (stage: number) => Math.min(STAGE_MAX_SECONDS, STAGE_FIRST_SECONDS + STAGE_STEP_SECONDS * (stage - 1));
/**
 * Boss stages (2026-10-23): stage 4 and every third stage after it (4, 7, 10, 13, 16, 19), plus a super boss on the
 * last stage. When a boss stage's clock runs out the boss and a pack of runners charge in (announced
 * BOSS_WARNING_SECONDS ahead); the horde keeps coming until the boss is down. On other stages the spawns stop when
 * the clock runs out. Either way the rest starts once the road is clear.
 * Boss HP follows the normal enemy curve times BOSS_HP_FIRST × BOSS_HP_PER_STAGE^(stage − 1).
 */
export const BOSS_FIRST_STAGE = 4;
export const BOSS_STAGE_EVERY = 3;
export const isBossStage = (stage: number) => stage === STAGE_COUNT || (stage >= BOSS_FIRST_STAGE && (stage - BOSS_FIRST_STAGE) % BOSS_STAGE_EVERY === 0);
/** The last stage's super boss: this much more HP, attack and size than a boss, with a bigger pack. */
export const SUPER_BOSS_HP = 5;
export const SUPER_BOSS_ATTACK = 2;
export const SUPER_BOSS_SCALE = 1.5;
export const SUPER_BOSS_ESCORT = 16;
export const BOSS_WARNING_SECONDS = 5;
export const BOSS_HP_FIRST = 0.05;
export const BOSS_HP_PER_STAGE = 1.1;
/**
 * Overtime (2026-10-23, against stalemates): OVERTIME_GRACE seconds after a stage's clock runs out, the zombies
 * left on the road bite the barricade ×2 every OVERTIME_DOUBLING seconds, until the road is clear or the line falls.
 */
export const OVERTIME_GRACE = 10;
/** Leftover zombies move this much faster once a stage stops spawning (shorter mop-up). */
export const RUSH_SPEED = 2;
export const OVERTIME_DOUBLING = 15;
/** A boss still standing this long after it charged in starts the overtime too. */
export const BOSS_OVERTIME_GRACE = 60;
/** Every card can be rerolled once per pick (2026-10-23). */
export const REROLLS_PER_PICK = 1;
/** Each card can be picked at most this many times in a run (2026-10-23). */
export const CARD_PICK_LIMIT = 5;
/**
 * Alive-zombie cap (2026-10-23, performance): past this many, a new zombie is not added; its HP, reward and XP
 * merge into the nearest zombie of the same kind, so the pressure stays and the cost of a frame is bounded.
 */
export const ENEMY_CAP = 400;
export const BOSS_ESCORT = 6;

/**
 * Tactical XP (2026-10-22 decision): about 100 three-choice picks by 20 minutes. XP income grows
 * ~×1.28 per minute with the spawn curve, so the cost per level grows slowly and picks stay spread
 * over the whole run (a zero-talent first run still gets about ten).
 */
export const XP_BASE = 9;
export const XP_GROWTH = 1.064;
/** The first levels follow a quicker early curve (3, 5, 8 XP) so a new squad gets its first cards before the runners arrive. */
export const XP_EARLY_BASE = 3;
export const XP_EARLY_GROWTH = 1.6;
export const xpForLevel = (level: number) => Math.ceil(Math.min(XP_EARLY_BASE * XP_EARLY_GROWTH ** (level - 1), XP_BASE * XP_GROWTH ** (level - 1)));
/**
 * With ~100 picks per long run, normal cards shrink as the tactical level rises: early picks stay
 * punchy, late ones are small increments, and the in-run power curve keeps the §9 target (panel DPS
 * about ×2 per minute). Pierce counts, synergies and evolutions are never scaled.
 */
export const CARD_SCALE_START = 1.15;
export const CARD_SCALE_DECAY = 0.92;
/** Picks up to this tactical level stay at full strength (the first pick happens at Lv2, so two picks); the decay starts after them. */
export const CARD_SCALE_FULL_LEVELS = 3;
export const CARD_SCALE_FLOOR = 0.04;
export const cardScale = (level: number) => Math.max(CARD_SCALE_FLOOR, CARD_SCALE_START * CARD_SCALE_DECAY ** Math.max(0, level - CARD_SCALE_FULL_LEVELS));
/** Synergy cards join the pool from this tactical level, evolutions from the next: payoffs for runs that last, not first-run lottery tickets. */
export const SYNERGY_MIN_LEVEL = 10;
/** Every normal card's value × this. Back to 1 (2026-10-23): the user set each card's common value directly (Content.ts). */
export const CARD_POWER = 1;
export const EVOLUTION_MIN_LEVEL = 20;

/**
 * Per-build tuning (2026-10-23 auto-balance): a damage multiplier per mercenary kind (its auto attacks)
 * and per throwable (its damage). The balance loop raises any that trail the strongest by more than 15%,
 * 5% a round, at most +30% in all. Kept as plain objects so the balance tool can try values in-process.
 */
// Second pass (2026-10-23): the sniper's attack speed is cut (MERC_SPEED_TUNING) and five throwables changed
// mechanics, so every multiplier restarts at ×1 for a fresh loop: see docs/TL003-perf-balance-2026-10-23.md.
export const MERC_TUNING: Record<string, number> = {
  rifle: 1, gunner: 1, sniper: 1, flame: 1, cryo: 1, tesla: 1, grenadier: 1, chemist: 1, engineer: 1, signal: 1,
};
/** Attack speed per mercenary kind: the sniper fires at ×0.7 (2026-10-23 decision, instead of a damage cut). */
export const MERC_SPEED_TUNING: Record<string, number> = { sniper: 0.7 };
export const SKILL_TUNING: Record<string, number> = {
  grenade: 1, molotov: 1, laser: 1, cryobomb: 1, gas: 1, mortar: 1, emp: 1, strafe: 1, snipe: 1, minefield: 1,
};
