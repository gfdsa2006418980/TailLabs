import type { DamageType, Modifier, Tag } from './Combat.ts';
import { cardScale } from './Balance.ts';

/**
 * Ten mercenaries (2026-10-23): three slots on the field, recruited from level-up cards.
 * `range` is how far up the road (model units from the barricade, road length 770) a mercenary can shoot.
 * Patterns: single = nearest to the wall; heaviest = most HP in range; cone = up to `targets` near the
 * front target; aoe = splash of `area` around the target; chain = target plus `targets` relays within `area`.
 */
export type MercKind = 'rifle' | 'gunner' | 'sniper' | 'flame' | 'cryo' | 'tesla' | 'grenadier' | 'chemist' | 'engineer' | 'signal';
export type Pattern = 'single' | 'heaviest' | 'cone' | 'aoe' | 'chain';
export type Element = '動能' | '火焰' | '冷凍' | '電能' | '毒素' | '爆裂';
export const ELEMENTS: readonly Element[] = ['動能', '毒素', '爆裂', '火焰', '冷凍', '電能'];
export interface MercDef {
  name: string; callSign: string; role: string; color: string; elements: readonly Element[];
  damage: number; interval: number; range: number; pattern: Pattern;
  /** cone/aoe/chain reach in model units; cone and chain: extra targets. */
  area?: number; targets?: number;
  /** Flat toxin per hit; share of the hit dealt again as burn per second. */
  toxin?: number; ignite?: number;
  tags: Tag[]; flavor: string;
}
const tagsOf = (kind: MercKind, types: DamageType[], extra: Tag[] = []): Tag[] =>
  [...types.map(t => `Damage.${t}` as Tag), ...extra, 'Skill.AutoAttack', `Weapon.${kind}`, `Mercenary.${kind}`];
export const MERCENARIES: Record<MercKind, MercDef> = {
  rifle: { name: '步槍手', callSign: 'ROOK', role: '中程・穩定單發', color: '#e8c58b', elements: ['動能'], damage: 6.5, interval: 1.25, range: 560, pattern: 'single',
    tags: tagsOf('rifle', ['Kinetic'], ['Mechanic.Projectile']), flavor: '老兵，從不浪費子彈。' },
  gunner: { name: '機槍兵', callSign: 'HAMMER', role: '中近程・高射速', color: '#d9b26f', elements: ['動能'], damage: 2.7, interval: 0.32, range: 420, pattern: 'single',
    tags: tagsOf('gunner', ['Kinetic'], ['Mechanic.Projectile', 'Mechanic.RapidFire']), flavor: '彈鏈拉到底。' },
  sniper: { name: '狙擊手', callSign: 'WINTER', role: '遠程・重擊・附凍', color: '#cfe3ee', elements: ['動能', '冷凍'], damage: 30, interval: 3.6, range: 720, pattern: 'heaviest',
    tags: tagsOf('sniper', ['Kinetic', 'Cold'], ['Mechanic.Projectile']), flavor: '先打最大的那隻。' },
  flame: { name: '焚燒兵', callSign: 'EMBER', role: '近程・扇形燃燒', color: '#ec865a', elements: ['火焰'], damage: 8.1, interval: 1.4, range: 260, pattern: 'cone', area: 70, targets: 4,
    tags: tagsOf('flame', ['Fire'], ['Mechanic.DOT']), flavor: '等它們靠近一點。' },
  cryo: { name: '冷凍兵', callSign: 'FROST', role: '中遠程・緩速冰凍', color: '#9fd8f0', elements: ['冷凍'], damage: 4.7, interval: 1, range: 560, pattern: 'single',
    tags: tagsOf('cryo', ['Cold']), flavor: '冷靜，然後凍住。' },
  tesla: { name: '電磁兵', callSign: 'VOLT', role: '全場・感電輔助', color: '#83c9d4', elements: ['電能'], damage: 5.4, interval: 1.3, range: 800, pattern: 'single',
    tags: tagsOf('tesla', ['Electric'], ['Mechanic.Projectile']), flavor: '它們一冒頭就被電到。' },
  grenadier: { name: '擲彈兵', callSign: 'BOOM', role: '中遠程・範圍暈眩', color: '#f0a35e', elements: ['爆裂'], damage: 12.5, interval: 2.4, range: 560, pattern: 'aoe', area: 45,
    tags: tagsOf('grenadier', ['Blast'], ['Mechanic.AOE', 'Mechanic.Explosion']), flavor: '一發解決一群。' },
  chemist: { name: '毒劑兵', callSign: 'VENOM', role: '中程・削防毒爆', color: '#a6c46a', elements: ['毒素'], damage: 4, interval: 1, range: 500, pattern: 'single', toxin: 6,
    tags: tagsOf('chemist', ['Toxin'], ['Mechanic.Projectile']), flavor: '盔甲再厚也會爛。' },
  engineer: { name: '工兵', callSign: 'SAPPER', role: '近程・燃燒爆破', color: '#d98a4a', elements: ['火焰', '爆裂'], damage: 9, interval: 2.2, range: 320, pattern: 'aoe', area: 50, ignite: 0.5,
    tags: tagsOf('engineer', ['Blast', 'Fire'], ['Mechanic.AOE', 'Mechanic.Explosion']), flavor: '炸開，順便點火。' },
  signal: { name: '通訊兵', callSign: 'RELAY', role: '遠程・連鎖毒電', color: '#7fc7a8', elements: ['電能', '毒素'], damage: 4.3, interval: 1.2, range: 640, pattern: 'chain', area: 90, targets: 2, toxin: 2,
    tags: tagsOf('signal', ['Electric', 'Toxin'], ['Mechanic.Chain']), flavor: '訊號傳到哪，電就到哪。' },
};
export const MERC_KINDS = Object.keys(MERCENARIES) as MercKind[];
/** Short range label for cards and the HUD. */
export const rangeLabel = (range: number) => range >= 760 ? '全場' : range >= 620 ? '遠' : range >= 400 ? '中' : '近';

/** Ten active skills (2026-10-23), decoupled from mercenaries: up to three, picked from level-up cards. */
export type SkillId = 'grenade' | 'molotov' | 'laser' | 'cryobomb' | 'gas' | 'mortar' | 'emp' | 'strafe' | 'snipe' | 'minefield';
export interface SkillDef {
  name: string; elements: readonly Element[]; color: string; cooldown: number;
  /** Area radius (beam half-width for the laser, band half-depth for the strafe) in model units. */
  radius: number; shape: 'circle' | 'beam' | 'band';
  description: string; flavor: string;
}
export const SKILLS: Record<SkillId, SkillDef> = {
  grenade: { name: '手榴彈', elements: ['爆裂'], color: '#f8b968', cooldown: 10, radius: 105, shape: 'circle', description: '範圍爆裂傷害並擊退，累積暈眩。', flavor: '拉環，數到三。' },
  molotov: { name: '燃燒瓶', elements: ['火焰'], color: '#e6764b', cooldown: 35, radius: 110, shape: 'circle', description: '留下 6 秒火區，進入者持續燃燒。', flavor: '整條路都會亮。' },
  laser: { name: '貫穿雷射', elements: ['電能'], color: '#91e7ec', cooldown: 45, radius: 34, shape: 'beam', description: '直線貫穿所有敵人，大量累積感電。', flavor: '一條線，全部倒。' },
  cryobomb: { name: '冰霜彈', elements: ['冷凍'], color: '#bfe8ff', cooldown: 30, radius: 95, shape: 'circle', description: '範圍冷凍傷害，凍結值累積 ×2。', flavor: '連呼吸都結冰。' },
  gas: { name: '毒氣彈', elements: ['毒素'], color: '#a6c46a', cooldown: 30, radius: 100, shape: 'circle', description: '6 秒毒雲，每秒疊毒素並造成毒素傷害。', flavor: '別吸太深。' },
  mortar: { name: '迫擊砲', elements: ['爆裂'], color: '#f0a35e', cooldown: 40, radius: 120, shape: 'circle', description: '5 發砲彈散落在範圍內，各自爆裂。', flavor: '座標已送出。' },
  emp: { name: '電磁脈衝', elements: ['電能'], color: '#c7f5ff', cooldown: 45, radius: 160, shape: 'circle', description: '大範圍電能傷害，感電值累積 ×3。', flavor: '全頻段干擾。' },
  strafe: { name: '機槍掃射', elements: ['動能'], color: '#ffd884', cooldown: 25, radius: 35, shape: 'band', description: '橫掃整條道路的一段，每名敵人中 6 發。', flavor: '從左掃到右。' },
  snipe: { name: '致命狙擊', elements: ['動能', '冷凍'], color: '#e8f4ff', cooldown: 20, radius: 90, shape: 'circle', description: '狙擊範圍內生命最多的敵人，必定暴擊。', flavor: '一發，就一發。' },
  minefield: { name: '地雷陣', elements: ['火焰', '爆裂'], color: '#d98a4a', cooldown: 40, radius: 70, shape: 'circle', description: '埋下 4 枚地雷，踩到就爆炸並點燃。', flavor: '小心腳下。' },
};
export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

export type EnemyKind = 'walker' | 'runner' | 'brute' | 'armored' | 'hazmat' | 'elite' | 'boss';
/**
 * `defense` is physical armor; `resist` is elemental resistance (share of fire, cold and electric removed).
 * Specialists (2026-10-23): the armored zombie shrugs off bullets, the hazmat zombie off the elements.
 */
export const ENEMIES = {
  walker: { hp: 25, speed: 44, defense: 5, resist: 0, attack: 7, reward: 3, xp: 1, color: '#9baa78', size: 1 },
  runner: { hp: 19, speed: 66, defense: 3, resist: 0, attack: 5, reward: 4.5, xp: 1, color: '#c3b688', size: 0.85 },
  brute: { hp: 85, speed: 30, defense: 15, resist: 0, attack: 14, reward: 9, xp: 3, color: '#8b9b80', size: 1.5 },
  armored: { hp: 65, speed: 37, defense: 130, resist: 0, attack: 10, reward: 15, xp: 4, color: '#8d9b9c', size: 1.2 },
  hazmat: { hp: 65, speed: 37, defense: 10, resist: 0.75, attack: 10, reward: 15, xp: 4, color: '#c9b04a', size: 1.2 },
  elite: { hp: 260, speed: 34, defense: 70, resist: 0, attack: 24, reward: 60, xp: 10, color: '#cb9c77', size: 1.8 },
  /** Only spawned by the boss rush (Balance.BOSS_*), never by the random roster. 75% elemental resistance (2026-10-23 decision). */
  boss: { hp: 4800, speed: 20, defense: 40, resist: 0.75, attack: 60, reward: 150, xp: 12, color: '#d4735f', size: 2.4 },
} as const;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
/** Purple, gold, red: from the second tier up every colour should feel strong (2026-10-22 decision). */
export const RARITIES: Record<Rarity, { name: string; mult: number; weight: number; color: string }> = {
  common: { name: '普通', mult: 1, weight: 62, color: '#cfc8b0' },
  uncommon: { name: '精良', mult: 1.6, weight: 27, color: '#b583e6' },
  rare: { name: '稀有', mult: 2.5, weight: 9, color: '#ffd062' },
  legendary: { name: '傳說', mult: 1, weight: 2, color: '#ff4a3a' },
};
export const RARITY_ORDER: readonly Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];
export type CardEffect = 'speed' | 'haste' | 'radius' | 'wall' | 'repair' | 'crit' | 'critDamage' | 'pierce' | 'reduction'
  | 'thorns' | 'airdrop' | 'burnTime' | 'toxinGain' | 'shockGain' | 'chillGain' | 'stunGain' | 'synergy' | 'evolution' | 'curse' | 'merc' | 'skill';
export type CardKind = 'normal' | 'synergy' | 'evolution' | 'curse' | 'merc' | 'skill';

/** A card as authored: magnitudes are for the common tier; rarity scales them. */
export interface CardDef {
  id: string; name: string; category: string; color: string; kind: CardKind;
  /** Common-tier magnitude (percent cards as fractions). */
  value: number;
  short: (v: number) => string; description: (v: number) => string;
  /** One radio line, shown in grey under the rules. */
  flavor: string;
  modifier?: { kind: 'Add' | 'More' | 'Special'; tags: Tag[]; rule?: 'ignite' | 'toxin' | 'shock' | 'chill' | 'blast' };
  effect?: CardEffect; minRarity?: Rarity; fixedRarity?: Rarity;
  /** Synergy: both elements must already be in the build. */
  elements?: readonly [Element, Element];
  /** Evolution: card ids needed (repeat an id to need it twice) and the skill that changes. */
  recipe?: readonly string[]; skill?: SkillId;
  /** Recruit card. */
  merc?: MercKind;
}
/** A card offered in a choice: one definition at one rarity. Values are already scaled. */
export interface UpgradeCard {
  id: string; name: string; category: string; color: string; kind?: CardKind; rarity?: Rarity;
  short: string; description: string; flavor?: string; value?: number;
  modifier?: Modifier; effect?: CardEffect; merc?: MercKind; skill?: SkillId;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const n1 = (v: number) => Number(v.toFixed(1));
const K = '#e8c58b', F = '#ec865a', T = '#a6c46a', E = '#83c9d4', S = '#d8c391', C = '#9fd8f0', X = '#f0a35e', B = '#b5cc7f';
export const ELEMENT_COLOR: Record<Element, string> = { 動能: K, 火焰: F, 冷凍: C, 電能: E, 毒素: T, 爆裂: X };
export const CARD_DEFS: readonly CardDef[] = [
  // Ammo: the first choice of a run offers these (next to its mercenaries).
  { id: 'kinetic', kind: 'normal', name: '重型彈頭', category: '動能', color: K, value: 0.35, modifier: { kind: 'Add', tags: ['Damage.Kinetic'] },
    short: v => `動能傷害 +${pct(v)}`, description: v => `所有動能傷害 +${pct(v)}。`, flavor: '這批彈頭能把牆打穿。' },
  { id: 'burn', kind: 'normal', name: '曳光燃燒彈', category: '火焰', color: F, value: 2, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'ignite' },
    short: v => `普攻點燃 ${n1(v)}/秒`, description: v => `普攻點燃：基礎每秒 ${n1(v)} 傷、持續 4 秒。保留最強燃燒；較弱或同強度命中續時並疊加易燃，每層燒快 25%（最多 12 層）。`, flavor: '曳光彈會指路，也會放火。' },
  { id: 'bio', kind: 'normal', name: '毒素彈藥', category: '毒素', color: T, value: 3, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'toxin' },
    short: v => `普攻毒素 +${n1(v)}`, description: v => `普攻附加 ${n1(v)} 毒素。毒素直接扣除防禦；防禦扣到 0 時毒爆一次，對周圍造成該喪屍最大生命 5% 的毒素傷害。`, flavor: '先融掉護甲，再談傷害。' },
  { id: 'shock', kind: 'normal', name: '感電彈藥', category: '電能', color: E, value: 0.25, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'shock' },
    short: v => `普攻附電 ${pct(v)}`, description: v => `普攻額外造成 ${pct(v)} 電能傷害，累積感電值：越滿受傷越重，滿了麻痺 4 秒（不能啃拒馬）。`, flavor: '帶電的東西都比較好打。' },
  { id: 'chill', kind: 'normal', name: '冷凍彈藥', category: '冷凍', color: C, value: 0.25, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'chill' },
    short: v => `普攻附凍 ${pct(v)}`, description: v => `普攻額外造成 ${pct(v)} 冷凍傷害，累積凍結值：越滿越慢，滿了冰凍 2 秒並受到最大生命 10% 的凍傷。`, flavor: '槍管都結霜了。' },
  { id: 'blastAmmo', kind: 'normal', name: '爆裂彈頭', category: '爆裂', color: X, value: 0.3, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'blast' },
    short: v => `普攻濺射 ${pct(v)}`, description: v => `普攻命中時爆炸，對周圍敵人造成 ${pct(v)} 爆裂傷害，累積暈眩值；滿了暈眩 4 秒。`, flavor: '打一個，震一圈。' },
  { id: 'crit', kind: 'normal', name: '精準射擊', category: '動能', color: K, value: 0.05, effect: 'crit',
    short: v => `暴擊率 +${pct(v)}`, description: v => `直接傷害暴擊率 +${pct(v)}。暴擊造成 150% 傷害。`, flavor: '呼吸，瞄準，扣扳機。' },
  { id: 'critDamage', kind: 'normal', name: '要害瞄準', category: '動能', color: K, value: 0.25, effect: 'critDamage',
    short: v => `暴擊傷害 +${pct(v)}`, description: v => `暴擊傷害 +${pct(v)}。`, flavor: '打頭。永遠打頭。' },
  { id: 'pierce', kind: 'normal', name: '穿甲彈芯', category: '動能', color: K, value: 1, effect: 'pierce', minRarity: 'rare',
    short: v => `普攻穿透 +${Math.max(1, Math.floor(v))}`, description: v => `單發普攻命中後再打穿後方 ${Math.max(1, Math.floor(v))} 名敵人，每穿透一名傷害 −40%。`, flavor: '一發子彈，兩具屍體。' },
  { id: 'fire', kind: 'normal', name: '高濃度燃料', category: '火焰', color: F, value: 0.225, modifier: { kind: 'Add', tags: ['Damage.Fire', 'Mechanic.DOT'] },
    short: v => `燃燒傷害 +${pct(v)}`, description: v => `火焰持續傷害 +${pct(v)}，與其他火焰加成相加。`, flavor: '混了點不該混的東西。' },
  { id: 'burnTime', kind: 'normal', name: '持久燃劑', category: '火焰', color: F, value: 0.15, effect: 'burnTime',
    short: v => `燃燒時間 +${pct(v)}`, description: v => `所有燃燒的持續時間 +${pct(v)}。`, flavor: '黏上去就甩不掉。' },
  { id: 'acid', kind: 'normal', name: '強效毒劑', category: '毒素', color: T, value: 0.3, effect: 'toxinGain',
    short: v => `毒素強度 +${pct(v)}`, description: v => `每次施加的毒素 +${pct(v)}。`, flavor: '連鋼板都在冒煙。' },
  { id: 'toxinDmg', kind: 'normal', name: '神經毒素', category: '毒素', color: T, value: 0.35, modifier: { kind: 'Add', tags: ['Damage.Toxin'] },
    short: v => `毒素傷害 +${pct(v)}`, description: v => `所有毒素傷害 +${pct(v)}，包含毒爆。`, flavor: '一針就夠。' },
  { id: 'coil', kind: 'normal', name: '高壓線圈', category: '電能', color: E, value: 0.3, effect: 'shockGain',
    short: v => `感電累積 +${pct(v)}`, description: v => `感電值累積速度 +${pct(v)}。`, flavor: '電壓再往上調一格。' },
  { id: 'voltage', kind: 'normal', name: '電壓提升', category: '電能', color: E, value: 0.35, modifier: { kind: 'Add', tags: ['Damage.Electric'] },
    short: v => `電能傷害 +${pct(v)}`, description: v => `所有電能傷害 +${pct(v)}，包含麻痺電擊。`, flavor: '讓線圈再紅一點。' },
  { id: 'frost', kind: 'normal', name: '低溫配方', category: '冷凍', color: C, value: 0.3, effect: 'chillGain',
    short: v => `凍結累積 +${pct(v)}`, description: v => `凍結值累積速度 +${pct(v)}。`, flavor: '再降十度。' },
  { id: 'coldDmg', kind: 'normal', name: '液態氮', category: '冷凍', color: C, value: 0.35, modifier: { kind: 'Add', tags: ['Damage.Cold'] },
    short: v => `冷凍傷害 +${pct(v)}`, description: v => `所有冷凍傷害 +${pct(v)}，包含凍傷。`, flavor: '碰到就碎。' },
  { id: 'shockwave', kind: 'normal', name: '震盪裝藥', category: '爆裂', color: X, value: 0.3, effect: 'stunGain',
    short: v => `暈眩累積 +${pct(v)}`, description: v => `暈眩值累積速度 +${pct(v)}。`, flavor: '震到站不穩。' },
  { id: 'blastDmg', kind: 'normal', name: '爆破專家', category: '爆裂', color: X, value: 0.35, modifier: { kind: 'Add', tags: ['Damage.Blast'] },
    short: v => `爆裂傷害 +${pct(v)}`, description: v => `所有爆裂傷害 +${pct(v)}，包含手榴彈。`, flavor: '裝藥量加倍。' },
  { id: 'elemental', kind: 'normal', name: '元素增幅', category: '元素', color: '#e9a2d0', value: 0.2, modifier: { kind: 'Add', tags: ['Damage.Elemental'] },
    short: v => `元素傷害 +${pct(v)}`, description: v => `火焰、冷凍、電能傷害同時 +${pct(v)}。`, flavor: '冰、火、雷，一起上。' },
  { id: 'physical', kind: 'normal', name: '物理強化', category: '物理', color: '#c9b08a', value: 0.2, modifier: { kind: 'Add', tags: ['Damage.Physical'] },
    short: v => `物理傷害 +${pct(v)}`, description: v => `動能、毒素、爆裂傷害同時 +${pct(v)}。`, flavor: '子彈、毒、炸藥。' },
  { id: 'speed', kind: 'normal', name: '快速供彈', category: '傭兵', color: S, value: 0.22, effect: 'speed',
    short: v => `攻速 +${pct(v)}`, description: v => `全隊攻擊速度 +${pct(v)}，重複選取相加。`, flavor: '彈匣換快一點，命就長一點。' },
  { id: 'training', kind: 'normal', name: '戰鬥訓練', category: '傭兵', color: S, value: 0.25, modifier: { kind: 'Add', tags: ['Skill.AutoAttack'] },
    short: v => `普攻傷害 +${pct(v)}`, description: v => `所有傭兵的普攻傷害 +${pct(v)}。`, flavor: '練到閉著眼也能打中。' },
  { id: 'active', kind: 'normal', name: '軍用炸藥', category: '主動技能', color: F, value: 0.45, modifier: { kind: 'Add', tags: ['Skill.Active'] },
    short: v => `技能傷害 +${pct(v)}`, description: v => `所有主動技能傷害 +${pct(v)}。`, flavor: '比民用的多三倍火藥。' },
  { id: 'haste', kind: 'normal', name: '軍火調度', category: '主動技能', color: E, value: 75, effect: 'haste',
    short: v => `技能急速 +${Math.round(v)}`, description: v => `技能急速 +${Math.round(v)}，依等比例公式縮短冷卻。`, flavor: '後勤說下一批馬上到。' },
  { id: 'radius', kind: 'normal', name: '擴散裝藥', category: '主動技能', color: F, value: 0.2, effect: 'radius',
    short: v => `技能範圍 ×${Number((1 + v).toFixed(2))}`, description: v => `主動技能範圍 ×${Number((1 + v).toFixed(2))}。`, flavor: '炸得更開，躲得更少。' },
  { id: 'income', kind: 'normal', name: '戰地回收', category: '經濟', color: B, value: 0.4, modifier: { kind: 'Add', tags: ['Economy.KillReward'] },
    short: v => `擊殺獎金 +${pct(v)}`, description: v => `擊殺獎金 +${pct(v)}。`, flavor: '它們身上還有能用的東西。' },
  { id: 'airdrop', kind: 'normal', name: '補給空投', category: '經濟', color: B, value: 1, effect: 'airdrop',
    short: () => '立即補給資金', description: () => '立即獲得一筆資金，金額隨戰鬥時間成長。', flavor: '注意頭頂，箱子要掉了。' },
  { id: 'haggle', kind: 'normal', name: '議價專家', category: '經濟', color: B, value: 0.1, modifier: { kind: 'More', tags: ['Economy.UpgradeCost'] },
    short: v => `升級費用 −${pct(v)}`, description: v => `傭兵升級費用 ×${Number((1 - v).toFixed(2))}，可重複疊乘。`, flavor: '軍需官欠我一個人情。' },
  { id: 'wall', kind: 'normal', name: '補強支架', category: '防守', color: B, value: 0.4, effect: 'wall',
    short: v => `拒馬上限 +${pct(v)}`, description: v => `拒馬最大生命增加開場上限的 ${pct(v)}，並修復新增的生命；重複選取不複利。`, flavor: '再釘一層木板。' },
  { id: 'repair', kind: 'normal', name: '緊急工兵', category: '防守', color: B, value: 0.4, effect: 'repair',
    short: v => `立即修復 ${pct(v)}`, description: v => `立即修復拒馬 ${pct(v)} 最大生命。`, flavor: '工兵上前，掩護他們。' },
  { id: 'plating', kind: 'normal', name: '鋼板加固', category: '防守', color: B, value: 0.08, effect: 'reduction',
    short: v => `拒馬減傷 +${pct(v)}`, description: v => `拒馬受到的傷害 ×${Number((1 - v).toFixed(2))}，可無限疊乘，永遠不會到 0。`, flavor: '焊上去，別問哪裡拆來的。' },
  { id: 'spikes', kind: 'normal', name: '尖刺拒馬', category: '防守', color: B, value: 0.5, effect: 'thorns',
    short: v => `每秒反傷 ${pct(v)}`, description: v => `啃咬拒馬的敵人每秒受到 ${pct(v)} 步槍普攻傷害的動能反傷。`, flavor: '咬下去之前最好想清楚。' },
  // Synergies (§37): only drawn once both elements are in the build (cards, mercenaries or skills).
  { id: 'phosphorus', kind: 'synergy', fixedRarity: 'rare', elements: ['動能', '火焰'], name: '白磷彈頭', category: '連動', color: F, value: 0.25, effect: 'synergy',
    short: () => '動能普攻附加燃燒', description: v => `動能普攻命中時，以該發傷害的 ${pct(v)} 附加燃燒。`, flavor: '打中的地方會一直燒。' },
  { id: 'acidcore', kind: 'synergy', fixedRarity: 'rare', elements: ['動能', '毒素'], name: '毒蝕彈芯', category: '連動', color: T, value: 2, effect: 'synergy',
    short: () => '動能普攻附加毒素', description: v => `動能普攻命中時附加 ${n1(v)} 毒素。`, flavor: '彈芯灌了毒，鑽進去才化開。' },
  { id: 'railgun', kind: 'synergy', fixedRarity: 'rare', elements: ['動能', '電能'], name: '磁軌加速', category: '連動', color: E, value: 1, effect: 'synergy',
    short: () => '感電目標直傷再加乘', description: () => '對感電目標的直接動能傷害，再乘一次感電增傷倍率。', flavor: '電磁推一把，速度翻倍。' },
  { id: 'chemfire', kind: 'synergy', fixedRarity: 'rare', elements: ['火焰', '毒素'], name: '化學火災', category: '連動', color: F, value: 0.4, effect: 'synergy',
    short: () => '毒素越深燒越痛', description: v => `每 10 點毒素使燃燒傷害 +${pct(v)}，最多 ×3。`, flavor: '毒和火，不要放在一起。' },
  { id: 'overheat', kind: 'synergy', fixedRarity: 'rare', elements: ['火焰', '電能'], name: '過熱電弧', category: '連動', color: E, value: 1, effect: 'synergy',
    short: () => '命中感電目標加易燃', description: () => '普攻命中正在燃燒的感電目標時，燃燒加一層易燃。', flavor: '短路，然後起火。' },
  { id: 'conductor', kind: 'synergy', fixedRarity: 'rare', elements: ['毒素', '電能'], name: '腐蝕導體', category: '連動', color: T, value: 0.5, effect: 'synergy',
    short: () => '毒素提高感電累積', description: v => `每 10 點毒素使感電值累積 +${pct(v)}，最多 ×3。`, flavor: '鏽掉的金屬導電最好。' },
  // Evolutions (§24): legendary, guaranteed once the recipe is complete; one variant per skill per run.
  { id: 'frag', kind: 'evolution', fixedRarity: 'legendary', skill: 'grenade', recipe: ['blastDmg', 'blastDmg', 'radius'], name: '集束破片', category: '質變', color: X, value: 0.3, effect: 'evolution',
    short: () => '爆炸噴出 6 枚破片', description: v => `手榴彈爆炸後噴出 6 枚破片，各打最近的敵人，造成 ${pct(v)} 爆炸傷害。`, flavor: '破片會自己找人。' },
  { id: 'double', kind: 'evolution', fixedRarity: 'legendary', skill: 'grenade', recipe: ['haste', 'speed', 'speed'], name: '雙重投擲', category: '質變', color: X, value: 0.7, effect: 'evolution',
    short: () => '一次投兩顆', description: v => `手榴彈一次投出兩顆，單顆傷害 ×${v}。`, flavor: '一顆不夠，那就兩顆。' },
  { id: 'hex', kind: 'evolution', fixedRarity: 'legendary', skill: 'grenade', recipe: ['active', 'active', 'active'], name: '高爆炸藥', category: '質變', color: X, value: 1.5, effect: 'evolution',
    short: () => '範圍與傷害 ×1.5', description: () => '手榴彈半徑 ×1.5、傷害 ×1.5，冷卻 ×1.3。', flavor: '退後，再退後一點。' },
  { id: 'napalm', kind: 'evolution', fixedRarity: 'legendary', skill: 'molotov', recipe: ['fire', 'fire', 'fire'], name: '凝固汽油', category: '質變', color: F, value: 2, effect: 'evolution',
    short: () => '火區威力 ×2', description: () => '燃燒瓶的燃燒威力 ×2，火區時間 ×0.7。', flavor: '黏在地上，燒到最後一滴。' },
  { id: 'inferno', kind: 'evolution', fixedRarity: 'legendary', skill: 'molotov', recipe: ['radius', 'burnTime', 'burnTime'], name: '火海', category: '質變', color: F, value: 1.6, effect: 'evolution',
    short: () => '火區 ×1.6、持續 8 秒', description: () => '燃燒瓶火區半徑 ×1.6，持續 8 秒。', flavor: '整條路都是火。' },
  { id: 'wildfire', kind: 'evolution', fixedRarity: 'legendary', skill: 'molotov', recipe: ['burn', 'fire', 'burnTime'], name: '延燒', category: '質變', color: F, value: 1, effect: 'evolution',
    short: () => '燃燒死亡留下火區', description: () => '燃燒中的敵人死亡時，原地留下 3 秒小火區，以其 40% 燃燒強度點燃尚未著火的敵人。', flavor: '倒下的，也幫忙點火。' },
  { id: 'overload', kind: 'evolution', fixedRarity: 'legendary', skill: 'laser', recipe: ['coil', 'coil', 'coil'], name: '過載', category: '質變', color: E, value: 2.5, effect: 'evolution',
    short: () => '雷射傷害 ×2.5', description: () => '雷射傷害 ×2.5，冷卻 ×1.5。', flavor: '保險絲拔掉了。' },
  { id: 'hifreq', kind: 'evolution', fixedRarity: 'legendary', skill: 'laser', recipe: ['speed', 'shock', 'coil'], name: '高頻雷射', category: '質變', color: E, value: 0.3, effect: 'evolution',
    short: () => '改為 5 段連打', description: v => `雷射改為 5 段連打，每段 ×${v}，每段都會累積感電。`, flavor: '嗡——嗡——嗡——' },
  { id: 'refract', kind: 'evolution', fixedRarity: 'legendary', skill: 'laser', recipe: ['pierce', 'coil', 'coil'], name: '折射', category: '質變', color: E, value: 0.6, effect: 'evolution',
    short: () => '命中後分出 2 道射線', description: v => `雷射命中第一名敵人後分出 2 道副射線，各造成 ${pct(v)} 傷害。`, flavor: '光會轉彎，你只是沒看過。' },
  // Black-market curses (core 黑市補給 only): a strong bonus with a lasting penalty. Bonus = value × level scale × 2.5.
  { id: 'curse_powder', kind: 'curse', fixedRarity: 'rare', name: '血汗火藥', category: '詛咒', color: '#b23a48', value: 0.6, effect: 'curse',
    short: v => `動能 +${pct(v)}・拒馬 ×0.85`, description: v => `所有動能傷害 +${pct(v)}；拒馬最大生命 ×0.85。`, flavor: '工廠沒人敢問這批火藥怎麼來的。' },
  { id: 'curse_fuel', kind: 'curse', fixedRarity: 'rare', name: '劣質燃料', category: '詛咒', color: '#b23a48', value: 0.8, effect: 'curse',
    short: v => `燃燒 +${pct(v)}・攻速 −10%`, description: v => `火焰持續傷害 +${pct(v)}；全隊攻擊速度 −10%。`, flavor: '燒得很旺，也很嗆。' },
  { id: 'curse_salvage', kind: 'curse', fixedRarity: 'rare', name: '腐爛補給', category: '詛咒', color: '#b23a48', value: 0.6, effect: 'curse',
    short: v => `獎金 +${pct(v)}・修復 ×0.7`, description: v => `擊殺獎金 +${pct(v)}；修復拒馬的修復量 ×0.7。`, flavor: '過期了，但還能賣。' },
  { id: 'curse_battery', kind: 'curse', fixedRarity: 'rare', name: '過載電池', category: '詛咒', color: '#b23a48', value: 0.7, effect: 'curse',
    short: v => `技能 +${pct(v)}・冷卻 ×1.2`, description: v => `所有主動技能傷害 +${pct(v)}；技能冷卻 ×1.2。`, flavor: '電池在發燙，別抱太緊。' },
  { id: 'curse_contract', kind: 'curse', fixedRarity: 'rare', name: '黑市合約', category: '詛咒', color: '#b23a48', value: 0.25, effect: 'curse',
    short: v => `升級 −${pct(v)}・受傷 ×1.15`, description: v => `傭兵升級費用 ×${Number((1 - v).toFixed(2))}；拒馬受到的傷害 ×1.15。`, flavor: '價錢很好，條款很爛。' },
  { id: 'curse_stim', kind: 'curse', fixedRarity: 'rare', name: '賭命藥劑', category: '詛咒', color: '#b23a48', value: 0.15, effect: 'curse',
    short: v => `暴擊 +${pct(v)}・拒馬 ×0.8`, description: v => `暴擊率 +${pct(v)}；拒馬最大生命 ×0.8。`, flavor: '打完這針，手就不會抖了。' },
  // Recruits and skills (2026-10-23): free, from the cards. One card per mercenary kind and per skill.
  ...MERC_KINDS.map((kind): CardDef => {
    const m = MERCENARIES[kind];
    return { id: `merc_${kind}`, kind: 'merc', fixedRarity: 'common', merc: kind, name: m.name, category: '招募', color: m.color, value: 0, effect: 'merc',
      short: () => `${m.elements.join('・')}・射程${rangeLabel(m.range)}`, description: () => `招募${m.name}（${m.role}）。佔一個傭兵欄位，之後用資金升級。`, flavor: m.flavor };
  }),
  ...SKILL_IDS.map((id): CardDef => {
    const s = SKILLS[id];
    return { id: `skill_${id}`, kind: 'skill', fixedRarity: 'common', skill: id, name: s.name, category: '技能', color: s.color, value: 0, effect: 'skill',
      short: () => `${s.elements.join('・')}・冷卻 ${s.cooldown} 秒`, description: () => `取得主動技能「${s.name}」：${s.description}佔一個技能欄位。`, flavor: s.flavor };
  }),
];
export const cardDef = (id: string) => CARD_DEFS.find(def => def.id === id);
/** A definition at a rarity: scaled magnitude, card face and rules text. */
export function makeCard(def: CardDef, rarity: Rarity = def.fixedRarity ?? def.minRarity ?? 'common', level = 1): UpgradeCard {
  // Normal cards are scaled for ~100 picks per long run; whole-number effects (pierce) keep their size.
  const scale = def.kind === 'normal' && def.effect !== 'pierce' ? cardScale(level) : 1;
  const value = def.kind === 'normal' ? def.value * RARITIES[rarity].mult * scale : def.kind === 'curse' ? Math.min(def.value, def.value * cardScale(level) * 2.5) : def.value;
  const scaled = def.modifier?.kind === 'More' ? (1 - def.value * scale) ** RARITIES[rarity].mult : value;
  const modifier: Modifier | undefined = !def.modifier ? undefined : def.modifier.kind === 'Special'
    ? { kind: 'Special', tags: [...def.modifier.tags], rule: def.modifier.rule!, value }
    : { kind: def.modifier.kind, tags: [...def.modifier.tags], value: scaled };
  const shown = def.modifier?.kind === 'More' ? 1 - scaled : value;
  return { id: def.id, name: def.name, category: def.category, color: def.color, kind: def.kind, rarity, value,
    short: def.short(shown), description: def.description(shown), flavor: def.flavor, modifier, effect: def.effect, merc: def.merc, skill: def.skill };
}
/** The normal cards at their base rarity (tests and tools read magnitudes from here). */
export const CARDS: readonly UpgradeCard[] = CARD_DEFS.filter(def => def.kind === 'normal').map(def => makeCard(def));
