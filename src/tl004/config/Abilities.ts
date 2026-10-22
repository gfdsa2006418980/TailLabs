import { steps } from './Tuning.ts';

/** One tap per shot: while flying, or within a moment of the partner's first contact. */
export type AbilityId = 'firework' | 'dash' | 'split' | 'bounce' | 'slam' | 'roll' | 'wave';

/** Which partner has which ability. */
export const PARTNER_ABILITY: Readonly<Record<string, AbilityId>> = {
  caideng: 'firework',
  zhusun: 'dash',
  poker: 'split',
  jiangpian: 'bounce',
  youfan3d: 'slam',
  zhaxidele: 'roll',
  jian: 'wave',
};

/** The ability can still be used for this long after the partner first touches something. */
export const ABILITY_GRACE_STEPS = steps(1);

/** Player-facing names and descriptions (partner intro panel and in-flight hint). */
export const ABILITY_INFO: Readonly<Record<AbilityId, { name: string; description: string }>> = {
  firework: { name: '煙火爆炸', description: '點一下畫面,原地炸開一圈煙火,把附近的木板和四十塊一起震飛。' },
  dash: { name: '破竹衝刺', description: '點一下全速往前衝,一路撞穿木板和玻璃,碰到石頭或地面才停下。' },
  split: { name: '三張牌分身', description: '點一下分成三張,往上中下散開,一次打到更大的範圍。' },
  bounce: { name: '辣勁彈跳', description: '點一下變得超有彈性,撞到東西會大力彈開,再去撞下一個。' },
  slam: { name: '重壓下砸', description: '點一下立刻停住,變成三倍重直直砸下,壓垮正下方的東西。' },
  roll: { name: '捲雲翻滾', description: '點一下小卷就捲成一團往前滾,變得很重,一路把擋在前面的東西推倒。' },
  wave: { name: '山澗激流', description: '點一下往前沖出一道激流,把前方的木板和四十塊沖走;石頭會擋住水。' },
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
  roll: {
    duration: steps(2.5),
    massFactor: 3,
    /** Forward rolling speed it keeps driving towards (px/step). */
    speed: 11,
    /** Forward speed regained per step while something slows it down. */
    accel: 0.8,
    /** Downward speed at the tap, so a roll started high drops onto the tower. */
    dive: 7,
    /** Spin while rolling (rad/step). */
    spin: 0.32,
  },
  wave: {
    /** How far ahead the water reaches (px). */
    length: 560,
    /** Also reaches a little behind the partner. */
    behind: 50,
    /** Height of the water band above and below the partner (px). */
    above: 240,
    below: 420,
    /** Velocity added at the partner, fading to `farShare` of it at the far end (px/step). */
    push: 10,
    farShare: 0.45,
    /** Upward share of the push, so pieces tip over instead of sliding. */
    lift: 0.25,
    /** Stone barely moves in the water. */
    stoneShare: 0.3,
    /** The partner rides the water at least this fast (px/step). */
    ride: 13,
  },
} as const;
