/**
 * In-run balance knobs. Targets come from spec v0.4 §7 and §9 and are checked by
 * tests/tl003-balance.test.mjs with an active-play bot (spends money, casts skills).
 *
 * §9 per-minute targets: player effective DPS ×2.00, enemy HP ×1.80, total income ×1.85–1.95.
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
export const ENEMY_HP_SCALE = 1;
export const ENEMY_ATTACK_GROWTH_PER_MINUTE = 1.45;

/**
 * §18: cost ×1.15 per level is fixed by the spec; the damage gained per level is tuned here.
 * The base cost is low so the first run buys an upgrade every few kills; the boss rush, not an
 * unaffordable shop, ends a zero-talent run.
 */
export const UPGRADE_BASE_COST = 10;
export const UPGRADE_COST_GROWTH = 1.15;
export const MERC_DAMAGE_PER_LEVEL = 1.12;
/** 2026-10-22 decision: the fire squad's growth per level is halved (+6.5% instead of +13%). */
export const FLAME_DAMAGE_PER_LEVEL = 1.065;
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
  /** 電能: raises damage taken while filling, then paralyses (no barricade damage) with an electric burst. */
  shock: { rate: 2, threshold: 0.6, duration: 4, burst: 0.05, vulnerability: 0.5 },
  /** 爆裂: stuns (no movement). */
  stun: { rate: 1.5, threshold: 0.8, duration: 4, burst: 0 },
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
 * Boss rush: a boss with a pack of runners charges every BOSS_INTERVAL_SECONDS, announced
 * BOSS_WARNING_SECONDS ahead. Its HP follows the normal enemy curve, so it is a fixed, visible
 * check: a zero-talent squad falls to the first one, a few talent levels push past it.
 */
export const BOSS_FIRST_SECONDS = 120;
export const BOSS_INTERVAL_SECONDS = 120;
export const BOSS_WARNING_SECONDS = 10;
export const BOSS_ESCORT = 6;
/** Each later rush's boss HP is multiplied by this on top of the normal enemy HP curve. */
export const BOSS_RUSH_HP_GROWTH = 1.3;

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
export const EVOLUTION_MIN_LEVEL = 20;
