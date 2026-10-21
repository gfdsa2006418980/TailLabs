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

/** §18: cost ×1.15 per level is fixed by the spec; the damage gained per level is tuned here. */
export const UPGRADE_BASE_COST = 80;
export const UPGRADE_COST_GROWTH = 1.15;
export const MERC_DAMAGE_PER_LEVEL = 1.13;
/** Base recruit costs (not fixed by the spec). */
export const RECRUIT_RIFLE_COST = 12;
export const RECRUIT_FLAME_COST = 32;
export const RECRUIT_TESLA_COST = 60;
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
export const SKILL_START_CHARGE = 1;
