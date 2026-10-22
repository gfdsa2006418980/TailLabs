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
export const ENEMY_ATTACK_GROWTH_PER_MINUTE = 1.45;

/**
 * §18: cost ×1.15 per level is fixed by the spec; the damage gained per level is tuned here.
 * The base cost is low so the first run buys an upgrade every few kills; the boss rush, not an
 * unaffordable shop, ends a zero-talent run.
 */
export const UPGRADE_BASE_COST = 10;
export const UPGRADE_COST_GROWTH = 1.15;
export const MERC_DAMAGE_PER_LEVEL = 1.13;
/** 2026-10-22 decision: the fire squad's growth per level is halved (+6.5% instead of +13%). */
export const FLAME_DAMAGE_PER_LEVEL = 1.065;
/** Base recruit costs (not fixed by the spec). */
export const RECRUIT_RIFLE_COST = 12;
export const RECRUIT_FLAME_COST = 18;
export const RECRUIT_TESLA_COST = 40;
export const RECRUIT_BASE_COST = { rifle: RECRUIT_RIFLE_COST, flame: RECRUIT_FLAME_COST, tesla: RECRUIT_TESLA_COST } as const;
/** §16: duplicate recruits cost ×1.35 per owned copy. */
export const RECRUIT_COST_GROWTH = 1.35;

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
