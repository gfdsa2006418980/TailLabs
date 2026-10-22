import type { Modifier, Tag } from './Combat.ts';
import { cardScale } from './Balance.ts';

export type MercKind = 'rifle' | 'flame' | 'tesla';
export const MERCENARIES = {
  rifle: { name: '步槍手', callSign: 'ROOK', role: '動能 · 穩定射擊', color: '#e8c58b', damage: 5.2, interval: 1.25, skill: '破片手榴彈', cooldown: 10, radius: 105, tags: ['Damage.Kinetic', 'Mechanic.Projectile', 'Skill.AutoAttack', 'Weapon.Rifle', 'Mercenary.rifle'] as Tag[] },
  flame: { name: '焚燒兵', callSign: 'EMBER', role: '火焰 · 持續燃燒', color: '#ec865a', damage: 4.5, interval: 1.4, skill: '燃燒瓶', cooldown: 35, radius: 110, tags: ['Damage.Fire', 'Mechanic.DOT', 'Skill.AutoAttack', 'Weapon.Flamer', 'Mercenary.flame'] as Tag[] },
  tesla: { name: '電磁兵', callSign: 'VOLT', role: '電能 · 感電增傷', color: '#83c9d4', damage: 6, interval: 1.3, skill: '貫穿雷射', cooldown: 45, radius: 34, tags: ['Damage.Kinetic', 'Damage.Electric', 'Mechanic.Projectile', 'Skill.AutoAttack', 'Weapon.Tesla', 'Mercenary.tesla'] as Tag[] },
} as const;
export const MERC_KINDS: MercKind[] = ['rifle', 'flame', 'tesla'];
export type EnemyKind = 'walker' | 'runner' | 'brute' | 'armored' | 'elite' | 'boss';
export const ENEMIES = {
  walker: { hp: 25, speed: 44, defense: 5, attack: 7, reward: 3, xp: 1, color: '#9baa78', size: 1 },
  runner: { hp: 19, speed: 66, defense: 0, attack: 5, reward: 4.5, xp: 1, color: '#c3b688', size: 0.85 },
  brute: { hp: 85, speed: 30, defense: 15, attack: 14, reward: 9, xp: 3, color: '#8b9b80', size: 1.5 },
  armored: { hp: 65, speed: 37, defense: 130, attack: 10, reward: 15, xp: 4, color: '#8d9b9c', size: 1.2 },
  elite: { hp: 260, speed: 34, defense: 70, attack: 24, reward: 60, xp: 10, color: '#cb9c77', size: 1.8 },
  /** Only spawned by the boss rush (Balance.BOSS_*), never by the random roster. */
  boss: { hp: 4800, speed: 30, defense: 40, attack: 60, reward: 150, xp: 12, color: '#d4735f', size: 2.4 },
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
  | 'thorns' | 'airdrop' | 'burnTime' | 'corrosionGain' | 'shockGain' | 'synergy' | 'evolution' | 'curse';
export type CardKind = 'normal' | 'synergy' | 'evolution' | 'curse';
export type Element = '動能' | '火焰' | '生化' | '電能';

/** A card as authored: magnitudes are for the common tier; rarity scales them. */
export interface CardDef {
  id: string; name: string; category: string; color: string; kind: CardKind;
  /** Common-tier magnitude (percent cards as fractions). */
  value: number;
  short: (v: number) => string; description: (v: number) => string;
  /** One radio line, shown in grey under the rules. */
  flavor: string;
  modifier?: { kind: 'Add' | 'More' | 'Special'; tags: Tag[]; rule?: 'ignite' | 'corrode' | 'shock' };
  effect?: CardEffect; minRarity?: Rarity; fixedRarity?: Rarity;
  /** Synergy: both elements must already be in the build. */
  elements?: readonly [Element, Element];
  /** Evolution: card ids needed (repeat an id to need it twice) and the mercenary whose skill changes. */
  recipe?: readonly string[]; merc?: MercKind;
}
/** A card offered in a choice: one definition at one rarity. Values are already scaled. */
export interface UpgradeCard {
  id: string; name: string; category: string; color: string; kind?: CardKind; rarity?: Rarity;
  short: string; description: string; flavor?: string; value?: number;
  modifier?: Modifier; effect?: CardEffect; merc?: MercKind;
}
const pct = (v: number) => `${Math.round(v * 100)}%`;
const K = '#e8c58b', F = '#ec865a', B = '#b5cc7f', E = '#83c9d4', S = '#d8c391';
export const CARD_DEFS: readonly CardDef[] = [
  // Starters first: the very first choice of a run only offers these four.
  { id: 'kinetic', kind: 'normal', name: '重型彈頭', category: '動能', color: K, value: 0.35, modifier: { kind: 'Add', tags: ['Damage.Kinetic'] },
    short: v => `動能傷害 +${pct(v)}`, description: v => `所有動能傷害 +${pct(v)}，包含手榴彈。`, flavor: '這批彈頭能把牆打穿。' },
  { id: 'burn', kind: 'normal', name: '曳光燃燒彈', category: '火焰', color: F, value: 2, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'ignite' },
    short: v => `普攻點燃 ${Number(v.toFixed(1))}/秒`, description: v => `普攻點燃：基礎每秒 ${Number(v.toFixed(1))} 傷、持續 4 秒。保留最強燃燒；較弱或同強度命中續時並疊加易燃，每層燒快 25%（最多 12 層）。`, flavor: '曳光彈會指路，也會放火。' },
  { id: 'bio', kind: 'normal', name: '腐蝕彈藥', category: '生化', color: B, value: 1, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'corrode' },
    short: v => `普攻腐蝕 ${Number(v.toFixed(1))}`, description: v => `普攻疊加 ${Number(v.toFixed(1))} 腐蝕。敵人防禦 ÷（1 + 腐蝕強度）。`, flavor: '先融掉護甲，再談傷害。' },
  { id: 'shock', kind: 'normal', name: '感電彈藥', category: '電能', color: E, value: 1, modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'shock' },
    short: v => `普攻感電 ${Number(v.toFixed(1))}`, description: v => `普攻疊加 ${Number(v.toFixed(1))} 感電，提高敵人受到的所有傷害，包含燃燒。`, flavor: '帶電的東西都比較好打。' },
  { id: 'crit', kind: 'normal', name: '精準射擊', category: '動能', color: K, value: 0.05, effect: 'crit',
    short: v => `暴擊率 +${pct(v)}`, description: v => `直接傷害暴擊率 +${pct(v)}。暴擊造成 150% 傷害。`, flavor: '呼吸，瞄準，扣扳機。' },
  { id: 'critDamage', kind: 'normal', name: '要害瞄準', category: '動能', color: K, value: 0.25, effect: 'critDamage',
    short: v => `暴擊傷害 +${pct(v)}`, description: v => `暴擊傷害 +${pct(v)}。`, flavor: '打頭。永遠打頭。' },
  { id: 'pierce', kind: 'normal', name: '穿甲彈芯', category: '動能', color: K, value: 1, effect: 'pierce', minRarity: 'rare',
    short: v => `普攻穿透 +${Math.max(1, Math.floor(v))}`, description: v => `普攻命中後再打穿後方 ${Math.max(1, Math.floor(v))} 名敵人，每穿透一名傷害 −40%。`, flavor: '一發子彈，兩具屍體。' },
  { id: 'fire', kind: 'normal', name: '高濃度燃料', category: '火焰', color: F, value: 0.225, modifier: { kind: 'Add', tags: ['Damage.Fire', 'Mechanic.DOT'] },
    short: v => `燃燒傷害 +${pct(v)}`, description: v => `火焰持續傷害 +${pct(v)}，與其他火焰加成相加。`, flavor: '混了點不該混的東西。' },
  { id: 'burnTime', kind: 'normal', name: '持久燃劑', category: '火焰', color: F, value: 0.15, effect: 'burnTime',
    short: v => `燃燒時間 +${pct(v)}`, description: v => `所有燃燒的持續時間 +${pct(v)}。`, flavor: '黏上去就甩不掉。' },
  { id: 'acid', kind: 'normal', name: '強酸配方', category: '生化', color: B, value: 0.3, effect: 'corrosionGain',
    short: v => `腐蝕強度 +${pct(v)}`, description: v => `每次施加的腐蝕強度 +${pct(v)}。`, flavor: '連鋼板都在冒煙。' },
  { id: 'coil', kind: 'normal', name: '高壓線圈', category: '電能', color: E, value: 0.3, effect: 'shockGain',
    short: v => `感電強度 +${pct(v)}`, description: v => `每次施加的感電強度 +${pct(v)}。`, flavor: '電壓再往上調一格。' },
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
  // Synergies (§37): only drawn once both elements are in the build.
  { id: 'phosphorus', kind: 'synergy', fixedRarity: 'rare', elements: ['動能', '火焰'], name: '白磷彈頭', category: '連動', color: F, value: 0.25, effect: 'synergy',
    short: () => '動能普攻附加燃燒', description: v => `動能普攻命中時，以該發傷害的 ${pct(v)} 附加燃燒。`, flavor: '打中的地方會一直燒。' },
  { id: 'acidcore', kind: 'synergy', fixedRarity: 'rare', elements: ['動能', '生化'], name: '酸蝕彈芯', category: '連動', color: B, value: 0.5, effect: 'synergy',
    short: () => '動能普攻附加腐蝕', description: v => `動能普攻命中時附加 ${Number(v.toFixed(1))} 腐蝕。`, flavor: '彈芯灌了酸，鑽進去才化開。' },
  { id: 'railgun', kind: 'synergy', fixedRarity: 'rare', elements: ['動能', '電能'], name: '磁軌加速', category: '連動', color: E, value: 1, effect: 'synergy',
    short: () => '感電目標直傷再加乘', description: () => '對感電目標的直接傷害，再乘一次感電增傷倍率。', flavor: '電磁推一把，速度翻倍。' },
  { id: 'chemfire', kind: 'synergy', fixedRarity: 'rare', elements: ['火焰', '生化'], name: '化學火災', category: '連動', color: F, value: 0.4, effect: 'synergy',
    short: () => '腐蝕越深燒越痛', description: v => `燃燒傷害 ×（1 + ${v} × 腐蝕強度），最多 ×3。`, flavor: '酸和火，不要放在一起。' },
  { id: 'overheat', kind: 'synergy', fixedRarity: 'rare', elements: ['火焰', '電能'], name: '過熱電弧', category: '連動', color: E, value: 1, effect: 'synergy',
    short: () => '命中感電目標加易燃', description: () => '命中正在燃燒的感電目標時，燃燒加一層易燃。', flavor: '短路，然後起火。' },
  { id: 'conductor', kind: 'synergy', fixedRarity: 'rare', elements: ['生化', '電能'], name: '腐蝕導體', category: '連動', color: B, value: 0.5, effect: 'synergy',
    short: () => '腐蝕提高感電累積', description: v => `感電累積 ×（1 + ${v} × 腐蝕強度）。`, flavor: '鏽掉的金屬導電最好。' },
  // Evolutions (§24): legendary, guaranteed once the recipe is complete; one variant per skill per run.
  { id: 'frag', kind: 'evolution', fixedRarity: 'legendary', merc: 'rifle', recipe: ['kinetic', 'kinetic', 'radius'], name: '集束破片', category: '質變', color: K, value: 0.3, effect: 'evolution',
    short: () => '爆炸噴出 6 枚破片', description: v => `手榴彈爆炸後噴出 6 枚破片，各打最近的敵人，造成 ${pct(v)} 爆炸傷害。`, flavor: '破片會自己找人。' },
  { id: 'double', kind: 'evolution', fixedRarity: 'legendary', merc: 'rifle', recipe: ['haste', 'speed', 'speed'], name: '雙重投擲', category: '質變', color: K, value: 0.7, effect: 'evolution',
    short: () => '一次投兩顆', description: v => `手榴彈一次投出兩顆，單顆傷害 ×${v}。`, flavor: '一顆不夠，那就兩顆。' },
  { id: 'hex', kind: 'evolution', fixedRarity: 'legendary', merc: 'rifle', recipe: ['active', 'active', 'active'], name: '高爆炸藥', category: '質變', color: K, value: 1.5, effect: 'evolution',
    short: () => '範圍與傷害 ×1.5', description: () => '手榴彈半徑 ×1.5、傷害 ×1.5，冷卻 ×1.3。', flavor: '退後，再退後一點。' },
  { id: 'napalm', kind: 'evolution', fixedRarity: 'legendary', merc: 'flame', recipe: ['fire', 'fire', 'fire'], name: '凝固汽油', category: '質變', color: F, value: 2, effect: 'evolution',
    short: () => '火區威力 ×2', description: () => '燃燒瓶的燃燒威力 ×2，火區時間 ×0.7。', flavor: '黏在地上，燒到最後一滴。' },
  { id: 'inferno', kind: 'evolution', fixedRarity: 'legendary', merc: 'flame', recipe: ['radius', 'burnTime', 'burnTime'], name: '火海', category: '質變', color: F, value: 1.6, effect: 'evolution',
    short: () => '火區 ×1.6、持續 8 秒', description: () => '燃燒瓶火區半徑 ×1.6，持續 8 秒。', flavor: '整條路都是火。' },
  { id: 'wildfire', kind: 'evolution', fixedRarity: 'legendary', merc: 'flame', recipe: ['burn', 'fire', 'burnTime'], name: '延燒', category: '質變', color: F, value: 1, effect: 'evolution',
    short: () => '燃燒死亡留下火區', description: () => '燃燒中的敵人死亡時，原地留下 3 秒小火區，以其 40% 燃燒強度點燃尚未著火的敵人。', flavor: '倒下的，也幫忙點火。' },
  { id: 'overload', kind: 'evolution', fixedRarity: 'legendary', merc: 'tesla', recipe: ['coil', 'coil', 'coil'], name: '過載', category: '質變', color: E, value: 2.5, effect: 'evolution',
    short: () => '雷射傷害 ×2.5', description: () => '雷射傷害 ×2.5，冷卻 ×1.5。', flavor: '保險絲拔掉了。' },
  { id: 'hifreq', kind: 'evolution', fixedRarity: 'legendary', merc: 'tesla', recipe: ['speed', 'shock', 'coil'], name: '高頻雷射', category: '質變', color: E, value: 0.3, effect: 'evolution',
    short: () => '改為 5 段連打', description: v => `雷射改為 5 段連打，每段 ×${v}，每段都會疊感電。`, flavor: '嗡——嗡——嗡——' },
  { id: 'refract', kind: 'evolution', fixedRarity: 'legendary', merc: 'tesla', recipe: ['pierce', 'coil', 'coil'], name: '折射', category: '質變', color: E, value: 0.6, effect: 'evolution',
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
    short: def.short(shown), description: def.description(shown), flavor: def.flavor, modifier, effect: def.effect, merc: def.merc };
}
/** The normal cards at their base rarity (tests and tools read magnitudes from here). */
export const CARDS: readonly UpgradeCard[] = CARD_DEFS.filter(def => def.kind === 'normal').map(def => makeCard(def));
