import { steps } from './Tuning.ts';

/** One tap during flight, before the partner first touches anything. */
export type AbilityId = 'firework' | 'dash' | 'split' | 'bounce' | 'slam';

/** Which partner has which ability (user-approved set, 2026-10-22). */
export const PARTNER_ABILITY: Readonly<Record<string, AbilityId>> = {
  caideng: 'firework',
  zhusun: 'dash',
  poker: 'split',
  jiangpian: 'bounce',
  youfan3d: 'slam',
};

/** Player-facing names and descriptions (partner intro panel and in-flight hint). */
export const ABILITY_INFO: Readonly<Record<AbilityId, { name: string; description: string }>> = {
  firework: { name: '煙火爆炸', description: '飛行中點一下畫面,原地炸開一圈煙火,把附近的木板和四十塊一起震飛。' },
  dash: { name: '破竹衝刺', description: '點一下全速往前衝,一路撞穿木板和玻璃,碰到石頭或地面才停下。' },
  split: { name: '三張牌分身', description: '點一下分成三張,往上中下散開,一次打到更大的範圍。' },
  bounce: { name: '辣勁彈跳', description: '點一下變得超有彈性,撞到東西會大力彈開,再去撞下一個。' },
  slam: { name: '重壓下砸', description: '點一下立刻停住,變成三倍重直直砸下,壓垮正下方的東西。' },
};

export const ABILITY = {
  firework: {
    /** World px. */
    radius: 210,
    /** Velocity added at the centre, fading to 0 at the edge (px/step). */
    push: 15,
    /** Impact strength dealt at the centre, fading to 0 at the edge. */
    strength: 56,
  },
  dash: {
    speed: 26,
    duration: steps(0.9),
    /** Share of speed kept after punching through a plank. */
    keepAfterPierce: 0.85,
  },
  split: {
    /** Radians between the three cards. */
    spread: 0.2,
    /** Size of the two extra cards. */
    scale: 0.75,
    /** Sideways offset of the extra cards (px). */
    offset: 26,
  },
  bounce: {
    restitution: 0.95,
    friction: 0.05,
    boost: 1.1,
    /** Its hits count this much harder while it bounces around. */
    damageFactor: 1.6,
  },
  slam: {
    speed: 24,
    massFactor: 3,
  },
} as const;
