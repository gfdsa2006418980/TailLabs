import { CORE_SLOT_STAGES } from './Balance.ts';
import { calculateValue, effectiveCooldown } from './Combat.ts';
import type { Modifier, Tag } from './Combat.ts';
import { MERCENARIES, MERC_KINDS, SKILLS } from './Content.ts';
import type { TalentTree } from './Meta.ts';

/**
 * Command blueprint (spec §52–64). 52 general nodes in 10 branches around a hub (2026-10-24 layout), all uncapped and
 * multiplicative (`growth ^ level`), plus 16 tactical cores (0/1) at branch tips and between branches.
 * Saves from the old 47-node layout are refunded in full (Meta.normalizeMeta).
 */
export const BRANCHES = ['動能', '爆裂', '火焰', '冷凍', '電能', '毒素', '傭兵', '投擲物', '拒馬', '經濟'] as const;
export type Branch = typeof BRANCHES[number] | '中心';
const BRANCH_COLOR: Record<Branch, string> = {
  中心: '#e8c58b', 動能: '#e8c58b', 爆裂: '#f0a35e', 火焰: '#ec865a', 冷凍: '#9fd8f0', 電能: '#83c9d4', 毒素: '#a6c46a',
  傭兵: '#d8c391', 投擲物: '#f8b968', 拒馬: '#a9c48a', 經濟: '#e3cf8f',
};
const BRANCH_GLYPH: Record<Branch, string> = { 中心: '◆', 動能: '✦', 爆裂: '✸', 火焰: '♨', 冷凍: '❄', 電能: 'ϟ', 毒素: '☣', 傭兵: '»', 投擲物: '◎', 拒馬: '▱', 經濟: '¤' };

interface NodeSpec { id: string; name: string; growth: number; describe: string; flavor: string }
/**
 * 2026-10-24 layout (TREE_LAYOUT 2): six element branches on one template (damage, build-up, the status itself,
 * its payoff, one extra) and four role branches. No node names a mercenary or a throwable: anything carrying the
 * element benefits. Branch order matches BRANCHES; the first node of each branch links to the hub.
 */
const SPECS: Record<Branch, NodeSpec[]> = {
  中心: [{ id: 'mercenary_damage', name: '傭兵訓練', growth: 1.06, describe: '所有傭兵的普攻與投擲物傷害', flavor: '基本功，練到不用想。' }],
  動能: [
    { id: 'kinetic_damage', name: '動能專精', growth: 1.08, describe: '所有動能傷害', flavor: '火藥多放一點。' },
    { id: 'crit_rate', name: '射擊精度', growth: 1.05, describe: '暴擊率（每級 +0.5%）', flavor: '準星對齊，再扣。' },
    { id: 'crit_power', name: '要害訓練', growth: 1.04, describe: '暴擊傷害', flavor: '知道哪裡最痛。' },
    { id: 'armor_breaker', name: '破甲戰術', growth: 1.06, describe: '對裝甲兵、精英與屍王的傷害', flavor: '大的先打。' },
    { id: 'pierce_training', name: '穿甲訓練', growth: 1.04, describe: '穿透後保留的傷害（冷鋼紀律，上限 95%）', flavor: '別讓子彈停下來。' },
  ],
  爆裂: [
    { id: 'blast_damage', name: '爆破專精', growth: 1.08, describe: '所有爆裂傷害', flavor: '裝藥量再加一成。' },
    { id: 'stun_power', name: '震盪裝藥', growth: 1.06, describe: '暈眩值累積速度', flavor: '震得它們站不穩。' },
    { id: 'stun_time', name: '耳鳴', growth: 1.04, describe: '暈眩持續時間', flavor: '嗡嗡聲還沒停。' },
    { id: 'blast_radius', name: '擴散炸藥', growth: 1.03, describe: '所有爆炸範圍（擲彈兵、工兵、手榴彈、迫擊砲、地雷）', flavor: '炸得更開。' },
    { id: 'impact', name: '震退裝藥', growth: 1.05, describe: '爆炸擊退距離', flavor: '把它們推回去。' },
  ],
  火焰: [
    { id: 'fire_damage', name: '燃燒專精', growth: 1.08, describe: '所有火焰傷害', flavor: '燒得更旺。' },
    { id: 'ignite_power', name: '助燃劑', growth: 1.06, describe: '點燃值累積速度', flavor: '一碰就著。' },
    { id: 'fire_dot', name: '高效燃料', growth: 1.08, describe: '點燃後每秒的燃燒傷害', flavor: '燒得更久更痛。' },
    { id: 'slow_burn', name: '緩燃劑', growth: 1.04, describe: '點燃持續時間', flavor: '慢慢燒，燒乾淨。' },
    { id: 'firezone', name: '火區擴張', growth: 1.04, describe: '火區範圍與持續時間（燃燒瓶、延燒）', flavor: '潑得更開，燒得更久。' },
  ],
  冷凍: [
    { id: 'cold_damage', name: '冷凍專精', growth: 1.08, describe: '所有冷凍傷害', flavor: '溫度再降一點。' },
    { id: 'chill_power', name: '急凍配方', growth: 1.06, describe: '凍結值累積速度', flavor: '凍得更快。' },
    { id: 'freeze_time', name: '永凍層', growth: 1.04, describe: '冰凍持續時間', flavor: '冰不會自己化。' },
    { id: 'frostbite', name: '凍傷', growth: 1.08, describe: '冰凍時的凍傷傷害', flavor: '凍裂的地方最脆。' },
    { id: 'deep_chill', name: '寒氣', growth: 1.04, describe: '凍結值累積時的減速效果（上限 90%）', flavor: '腳步越來越重。' },
  ],
  電能: [
    { id: 'electric_damage', name: '電能專精', growth: 1.08, describe: '所有電能傷害', flavor: '電壓拉滿。' },
    { id: 'shock_power', name: '電容強化', growth: 1.06, describe: '感電值累積速度', flavor: '電容再加一組。' },
    { id: 'shock_time', name: '蓄電', growth: 1.04, describe: '麻痺持續時間', flavor: '電流留在體內。' },
    { id: 'shock_burst', name: '過載電擊', growth: 1.08, describe: '麻痺時的電擊傷害', flavor: '一次放乾。' },
    { id: 'shock_vuln', name: '導電體質', growth: 1.04, describe: '感電中受到的額外傷害', flavor: '帶電的東西比較好打。' },
  ],
  毒素: [
    { id: 'toxin_damage', name: '毒素專精', growth: 1.08, describe: '所有毒素傷害', flavor: '毒性更強。' },
    { id: 'corrosion_power', name: '毒劑研究', growth: 1.06, describe: '施加的毒素', flavor: '配方又改良了。' },
    { id: 'corrosion_time', name: '毒素保存', growth: 1.04, describe: '毒素持續時間', flavor: '酸不會自己乾掉。' },
    { id: 'toxic_burst', name: '毒爆強化', growth: 1.08, describe: '毒爆的傷害', flavor: '一爆一大片。' },
    { id: 'toxic_residue', name: '毒霧殘留', growth: 1.06, describe: '中毒的敵人死亡時，使周圍敵人中毒', flavor: '死了也要害人。' },
  ],
  傭兵: [
    { id: 'auto_damage', name: '射擊訓練', growth: 1.06, describe: '所有傭兵的普攻傷害', flavor: '每一發都更準。' },
    { id: 'attack_speed', name: '供彈訓練', growth: 1.03, describe: '所有傭兵攻擊速度', flavor: '換彈匣再快一秒。' },
    { id: 'merc_range', name: '高地佈陣', growth: 1.03, describe: '所有傭兵的射程', flavor: '站高一點，看得更遠。' },
    { id: 'veteran', name: '資深士官', growth: 1.02, describe: '傭兵升級費用降低', flavor: '老兵帶新兵。' },
    { id: 'drill', name: '戰前操練', growth: 1, describe: '傭兵開局等級（每 2 級 +1）', flavor: '上戰場前先練過。' },
  ],
  投擲物: [
    { id: 'active_skill_damage', name: '軍火專精', growth: 1.08, describe: '所有投擲物傷害', flavor: '炸藥，更多炸藥。' },
    { id: 'active_skill_haste', name: '火力排程', growth: 1.06, describe: '投擲物冷卻效率（換算為無上限急速）', flavor: '補給線很順。' },
    { id: 'skill_reach', name: '射程延伸', growth: 1.03, describe: '所有投擲物範圍', flavor: '丟得更遠，炸得更開。' },
    { id: 'skill_crit', name: '精準投擲', growth: 1, describe: '投擲物暴擊率（每級 +1%）', flavor: '丟在最痛的地方。' },
    { id: 'skill_build', name: '特殊彈頭', growth: 1.06, describe: '投擲物造成的異常累積（點燃、冰凍、麻痺、暈眩）', flavor: '彈頭裡加了料。' },
  ],
  拒馬: [
    { id: 'barricade_health', name: '堅固防線', growth: 1.08, describe: '開場拒馬最大生命', flavor: '再釘一層。' },
    { id: 'repair_efficiency', name: '工兵手冊', growth: 1.06, describe: '修復拒馬的修復量', flavor: '工兵手腳很快。' },
    { id: 'plating', name: '裝甲焊接', growth: 1.01, describe: '拒馬受到的傷害降低（每級 1%，疊乘）', flavor: '焊上去。' },
    { id: 'spikes', name: '倒刺鐵網', growth: 1.08, describe: '啃咬拒馬的敵人受到反傷', flavor: '咬下去會痛。' },
    { id: 'builder', name: '建材配給', growth: 1.03, describe: '補強與修復拒馬的費用降低', flavor: '木頭和工具都便宜了。' },
  ],
  經濟: [
    { id: 'economy_income', name: '戰利品回收', growth: 1.06, describe: '擊殺獎金', flavor: '能用的都撿回來。' },
    { id: 'wave_bonus', name: '守城獎勵', growth: 1.08, describe: '過關獎勵', flavor: '守住一關，賞一關。' },
    { id: 'bounty', name: '懸賞名單', growth: 1.08, describe: '精英與屍王的擊殺獎金', flavor: '頭目值錢。' },
    { id: 'starting_funds', name: '作戰經費', growth: 1.1, describe: '開場資金（第 1 級 5，之後等比）', flavor: '開戰前先領錢。' },
    { id: 'logistics', name: '後勤補給', growth: 1, describe: '每 5 級，每局免費重抽 +1', flavor: '補給官多給了一箱。' },
    { id: 'lucky', name: '優先配給', growth: 1.03, describe: '稀有以上補給的出現權重', flavor: '好貨先留給我們。' },
  ],
};

export interface TalentNode {
  id: string; name: string; category: Branch; growth: number; description: string; flavor: string;
  color: string; glyph: string; x: number; y: number;
}
/** Map coordinates in px: the hub at the centre, branches every 36° from the top, nodes every 78 px outwards. */
export const MAP_SIZE = 1500, MAP_CENTRE = MAP_SIZE / 2;
const RING = (i: number) => 130 + i * 78;
const STEP = 2 * Math.PI / BRANCHES.length;
const angleOf = (b: number) => -Math.PI / 2 + b * STEP;
const place = (angle: number, radius: number, sway = 0) => ({
  x: Math.round(MAP_CENTRE + Math.cos(angle) * radius - Math.sin(angle) * sway),
  y: Math.round(MAP_CENTRE + Math.sin(angle) * radius + Math.cos(angle) * sway),
});
const nodes: TalentNode[] = [{ ...SPECS.中心[0]!, description: SPECS.中心[0]!.describe, category: '中心', color: BRANCH_COLOR.中心, glyph: BRANCH_GLYPH.中心, x: MAP_CENTRE, y: MAP_CENTRE }];
const links: [string, string][] = [];
BRANCHES.forEach((branch, b) => SPECS[branch].forEach((spec, i) => {
  nodes.push({ ...spec, description: spec.describe, category: branch, color: BRANCH_COLOR[branch], glyph: BRANCH_GLYPH[branch], ...place(angleOf(b), RING(i), i % 2 ? 16 : -16) });
  links.push([i === 0 ? 'mercenary_damage' : SPECS[branch][i - 1]!.id, spec.id]);
}));
export const TALENTS: readonly TalentNode[] = nodes;
export type TalentId = string;
export const TALENT_LINKS: readonly (readonly [string, string])[] = links;
const tipOf = (branch: typeof BRANCHES[number]) => SPECS[branch].at(-1)!.id;

// ---------- tactical cores ----------
export type CoreId = 'coldsteel' | 'layers' | 'agony' | 'rotation' | 'lonewolf' | 'autofire' | 'plunder' | 'ammoeco'
  | 'cremation' | 'corpseblast' | 'raisedead' | 'focusfire' | 'uniform' | 'bloodprice' | 'pointblank' | 'blackmarket';
export interface CoreNode {
  id: CoreId; name: string; kind: string; rule: string; price: string; flavor: string; cost: number;
  exclusive: CoreId[]; links: string[]; x: number; y: number; color: string;
}
interface CoreSpec { id: CoreId; name: string; kind: string; rule: string; price: string; flavor: string; cost: number; exclusive?: CoreId[] }
const CORE_SPECS: { at: number; between: boolean; spec: CoreSpec }[] = [
  { at: 0, between: false, spec: { id: 'coldsteel', name: '冷鋼紀律', kind: '狀態', rule: '動能傷害無視敵人 50% 物理防禦，單發普攻必定穿透 2 名。', price: '永遠不會暴擊。', flavor: '不靠運氣，靠紀律。', cost: 15 } },
  { at: 2, between: false, spec: { id: 'layers', name: '千層烈焰', kind: '狀態', rule: '點燃中繼續累積點燃值會疊層並重置時間，最多 10 層。', price: '每層燃燒傷害只有原本的 35%。', flavor: '一層一層燒上去。', cost: 15 } },
  { at: 3, between: false, spec: { id: 'agony', name: '痛苦精通', kind: '轉換', rule: '暴擊時，這一擊的燃燒、毒素與冷凍／感電／暈眩累積 × 暴擊傷害。', price: '暴擊不再加倍直接傷害。', flavor: '讓它們痛得久一點。', cost: 25 } },
  { at: 4, between: false, spec: { id: 'rotation', name: '元素輪替', kind: '狀態', rule: '敵人受到與上一擊「不同屬性」的傷害 ×1.6。', price: '同屬性連打 ×0.7。', flavor: '換個方式打，它就扛不住。', cost: 25 } },
  { at: 6, between: false, spec: { id: 'lonewolf', name: '孤狼', kind: '陣容', rule: '只能部署 1 名傭兵；他的傷害 ×4、攻速 ×1.5、投擲物冷卻 ×0.5。', price: '另外兩個招募入口關閉。', flavor: '一個人就夠了。', cost: 40 } },
  { at: 7, between: false, spec: { id: 'autofire', name: '自動火控', kind: '投擲', rule: '投擲物就緒時自動朝最大的敵群投出，仍可手動拖曳。', price: '投擲物傷害 ×0.85。', flavor: '系統會自己找目標。', cost: 15 } },
  { at: 8, between: false, spec: { id: 'plunder', name: '掠奪者', kind: '經濟', rule: '每次擊殺回復拒馬 1% 最大生命，補強費用 ×0.6。', price: '「修復」停用。', flavor: '拆它們的骨頭補牆。', cost: 15 } },
  { at: 9, between: false, spec: { id: 'ammoeco', name: '彈藥經濟', kind: '經濟', rule: '動能傷害 ×（1 + log₂(1 + 資金) ÷ 4）。', price: '每發動能普攻消耗當前資金 1%；資金歸零時動能傷害 ×0.5。', flavor: '錢就是子彈。', cost: 25 } },
  { at: 1, between: true, spec: { id: 'cremation', name: '焚化協議', kind: '轉換', rule: '所有直接傷害改為 80% 威力的火焰傷害（累積點燃值）。', price: '不再造成原屬性的傷害。', flavor: '全部燒掉，一個不留。', cost: 25 } },
  { at: 1, between: false, spec: { id: 'corpseblast', name: '屍爆連鎖', kind: '連鎖', rule: '敵人死亡時爆炸，對周圍造成其最大生命 20% 的動能爆炸傷害，可以連鎖。', price: '擊殺獎金 ×0.7。', flavor: '一爆一整片。', cost: 25 } },
  { at: 5, between: false, spec: { id: 'raisedead', name: '亡者徵召', kind: '連鎖', rule: '被擊殺的一般喪屍有 30% 機率變成我方屍兵，往前衝進敵群爆炸。', price: '拒馬最大生命固定為 1，無法補強。', flavor: '它們會替我們走回去。', cost: 40 } },
  { at: 0, between: true, spec: { id: 'focusfire', name: '集火射擊', kind: '連鎖', rule: '連續射擊同一目標，每發射速 +15%，最多 ×4。', price: '換目標就歸零。', flavor: '所有人，打那一隻。', cost: 15 } },
  { at: 9, between: true, spec: { id: 'uniform', name: '制式部隊', kind: '陣容', rule: '可以招募 3 名步槍手；每多一名，全隊傷害 ×1.3。', price: '只能招募步槍手。', flavor: '同一套裝備，同一套戰法。', cost: 40 } },
  { at: 7, between: true, spec: { id: 'bloodprice', name: '血債血償', kind: '背水', rule: '拒馬生命越低，所有造成的傷害越高，最高 ×2（生命一半時 ×1.5）。', price: '每次使用投擲物消耗拒馬 4% 最大生命（最低留 1）。', flavor: '牆塌一寸，火力加一分。', cost: 25 } },
  { at: 6, between: true, spec: { id: 'pointblank', name: '探照獵殺', kind: '光照', rule: '探照燈照到的喪屍受到的傷害 ×2；光圈放大，傭兵優先射擊光圈內的目標。', price: '沒被照到的喪屍受到的傷害 ÷2。', flavor: '燈照到哪，就打哪。', cost: 15 } },
  { at: 8, between: true, spec: { id: 'blackmarket', name: '以牆為彈', kind: '火力', rule: '每名傭兵每秒額外造成拒馬當前生命 8% 的傷害（分攤到每一發普攻）。', price: '拒馬受到的傷害 ×1.3。', flavor: '牆越厚，子彈越重。', cost: 25 } },
];
export const CORES: readonly CoreNode[] = CORE_SPECS.map(({ at, between, spec }) => {
  const branch = BRANCHES[at]!, next = BRANCHES[(at + 1) % BRANCHES.length]!;
  const reach = RING(SPECS[branch].length - 1);
  const position = between ? place(angleOf(at) + STEP / 2, Math.max(reach, RING(SPECS[next].length - 1)) + 40) : place(angleOf(at), reach + 92);
  return { ...spec, exclusive: spec.exclusive ?? [], links: between ? [tipOf(branch), tipOf(next)] : [tipOf(branch)], ...position, color: between ? '#ff7a5c' : '#ffd062' };
});
export const coreById = (id: string) => CORES.find(core => core.id === id);
/** Core slots open with the map tier: T1 one, T2 two, T3 three (spec max 3). */
/** v2: one core slot from the start, one more on the first clear of stage 10 and of stage 20 (no longer tied to the tier). */
export const coreSlots = (tree: TalentTree) => 1 + CORE_SLOT_STAGES.filter(stage => (tree.bestStage ?? 0) >= stage).length;
export const isCoreRevealed = (tree: TalentTree, id: string) => coreById(id)?.links.some(link => talentLevel(tree, link) > 0) ?? false;
export const isCoreUnlocked = (tree: TalentTree, id: string) => tree.unlockedCoreTalents.includes(id);
export const isCoreActive = (tree: TalentTree, id: string) => tree.activeCoreTalents.includes(id);
/** Active cores that cannot share a loadout with `id`. None since 2026-10-23 (the field stays for future use). */
export const coreConflicts = (tree: TalentTree, id: string) => (coreById(id)?.exclusive ?? []).filter(other => tree.activeCoreTalents.includes(other));

// ---------- general nodes ----------
export const talentById = (id: string) => TALENTS.find(node => node.id === id);
export const talentLevel = (tree: TalentTree, id: string) => tree.nodes[id] ?? 0;
/** Depth of a node: 0 for the hub, 1 for the first node of each branch, and so on outwards. */
const DEPTH: Record<string, number> = { mercenary_damage: 0 };
for (const branch of BRANCHES) SPECS[branch].forEach((spec, i) => { DEPTH[spec.id] = i + 1; });
export const talentDepth = (id: string) => DEPTH[id] ?? 0;
/** §64 `BaseCost × 1.12^Level`; the base rises with depth, so exploring outwards costs more than the first ring. */
export const talentCost = (level: number, id?: string) => Math.ceil(1.12 ** level * (1 + 0.35 * Math.max(0, talentDepth(id ?? '') - 1)));
export function isRevealed(tree: TalentTree, id: string): boolean {
  return id === 'mercenary_damage' || talentLevel(tree, id) > 0 || TALENT_LINKS.some(([a, b]) =>
    (a === id && talentLevel(tree, b) > 0) || (b === id && talentLevel(tree, a) > 0));
}
export function canBreakthrough(tree: TalentTree): boolean {
  // 2026-10-23: every node must reach the tier cap before the next tier opens.
  return TALENTS.every(node => talentLevel(tree, node.id) >= tree.maxNodeLevel);
}
export const talentMultiplier = (tree: TalentTree, id: string) => (talentById(id)?.growth ?? 1) ** talentLevel(tree, id);

/** Everything a run takes from the star map, as one value snapshot. Neutral values mean "no talent". */
export interface PermanentEffects {
  modifiers: Modifier[]; wallHealth: number; attackSpeed: number; haste: number;
  critChance?: number; critDamage?: number; pierceRetention?: number; knockback?: number; armorBreaker?: number;
  burnTime?: number; molotovRadius?: number; molotovTime?: number; igniteGain?: number;
  corrosionGain?: number; corrosionTime?: number; eroder?: number; toxicResidue?: number; bioShield?: number; toxinBurst?: number;
  shockGain?: number; shockTime?: number; teslaSpeed?: number; stunField?: number; shockVuln?: number;
  chillGain?: number; freezeTime?: number; chillSlow?: number; stunGain?: number; stunTime?: number; blastRadius?: number;
  rangeScale?: number; startLevel?: number; skillCrit?: number; skillBuild?: number;
  skillRange?: number; laserWidth?: number;
  wallReduction?: number; thorns?: number; fortifyCost?: number; repairCost?: number;
  bounty?: number; startMoney?: number; freeRerolls?: number; passiveIncome?: number; luck?: number;
  cores?: CoreId[];
}
/** Compile a value snapshot. A later purchase never changes an already-running battle. */
export function compileTalents(tree: TalentTree): PermanentEffects {
  const modifiers: Modifier[] = [];
  const m = (id: string) => talentMultiplier(tree, id), lv = (id: string) => talentLevel(tree, id);
  const more = (tags: Tag[], value: number) => { if (value !== 1) modifiers.push({ kind: 'More', tags: [...tags], value }); };
  // The hub raises every mercenary's attacks and, since skills no longer belong to a mercenary (2026-10-23), every active skill.
  for (const kind of MERC_KINDS) more([`Mercenary.${kind}`], m('mercenary_damage'));
  more(['Skill.Active'], m('mercenary_damage'));
  // Elements: anything that carries the element (guns, throwables, procs, statuses) takes the damage node.
  more(['Damage.Kinetic'], m('kinetic_damage'));
  more(['Damage.Blast'], m('blast_damage'));
  more(['Damage.Fire'], m('fire_damage')); more(['Damage.Fire', 'Mechanic.DOT'], m('fire_dot'));
  more(['Damage.Cold'], m('cold_damage')); more(['Damage.Cold', 'Status.Frozen'], m('frostbite'));
  more(['Damage.Electric'], m('electric_damage')); more(['Damage.Electric', 'Status.Paralyzed'], m('shock_burst'));
  more(['Damage.Toxin'], m('toxin_damage'));
  more(['Skill.AutoAttack'], m('auto_damage'));
  more(['Skill.Active'], m('active_skill_damage'));
  more(['Economy.KillReward'], m('economy_income'));
  more(['Economy.WaveReward'], m('wave_bonus'));
  more(['Defense.Repair'], m('repair_efficiency'));
  if (lv('veteran')) more(['Economy.UpgradeCost'], 1 / m('veteran'));
  const effects: PermanentEffects = {
    modifiers, wallHealth: m('barricade_health'), attackSpeed: m('attack_speed'), haste: 100 * (m('active_skill_haste') - 1),
  };
  // Only non-neutral extras are written, so an empty map compiles to the original four fields.
  const set = <K extends keyof PermanentEffects>(key: K, value: PermanentEffects[K], neutral: PermanentEffects[K]) => { if (value !== neutral) effects[key] = value; };
  set('critChance', 0.005 * lv('crit_rate'), 0);
  set('critDamage', m('crit_power'), 1);
  set('pierceRetention', Math.min(0.95, 0.6 * m('pierce_training')), 0.6);
  set('knockback', m('impact'), 1);
  set('armorBreaker', m('armor_breaker') * 1, 1);
  set('burnTime', m('slow_burn'), 1); set('igniteGain', m('ignite_power') - 1, 0);
  set('molotovRadius', m('firezone'), 1); set('molotovTime', m('firezone'), 1);
  set('chillGain', m('chill_power') - 1, 0); set('freezeTime', m('freeze_time'), 1); set('chillSlow', m('deep_chill'), 1);
  set('stunGain', m('stun_power') - 1, 0); set('stunTime', m('stun_time'), 1); set('blastRadius', m('blast_radius'), 1);
  set('corrosionGain', m('corrosion_power') - 1, 0); set('corrosionTime', m('corrosion_time'), 1);
  set('toxicResidue', lv('toxic_residue') ? 0.3 * m('toxic_residue') : 0, 0); set('toxinBurst', m('toxic_burst'), 1);
  set('shockGain', m('shock_power') - 1, 0); set('shockTime', m('shock_time'), 1); set('shockVuln', m('shock_vuln'), 1);
  set('rangeScale', m('merc_range'), 1); set('startLevel', Math.floor(lv('drill') / 2), 0);
  set('skillRange', m('skill_reach'), 1); set('skillCrit', 0.01 * lv('skill_crit'), 0); set('skillBuild', m('skill_build'), 1);
  set('wallReduction', 1 - 0.99 ** lv('plating'), 0);
  set('thorns', lv('spikes') ? 0.1 * talentMultiplier(tree, 'spikes') : 0, 0);
  set('fortifyCost', 1 / m('builder'), 1); set('repairCost', 1 / m('builder'), 1);
  set('bounty', m('bounty'), 1);
  set('startMoney', lv('starting_funds') ? 5 * 1.1 ** (lv('starting_funds') - 1) : 0, 0);
  set('freeRerolls', Math.floor(lv('logistics') / 5), 0);
  set('luck', m('lucky'), 1);
  const cores = tree.activeCoreTalents.filter((id): id is CoreId => !!coreById(id)).slice(0, coreSlots(tree));
  if (cores.length) effects.cores = cores;
  return effects;
}
export function deploymentStats(effects: PermanentEffects) {
  const rifle = MERCENARIES.rifle;
  const damage = calculateValue(rifle.damage, rifle.tags, effects.modifiers);
  return { damage, dps: damage / (rifle.interval / effects.attackSpeed), wallHealth: 40 * effects.wallHealth,
    income: calculateValue(1, ['Economy.KillReward'], effects.modifiers), grenadeCooldown: effectiveCooldown(SKILLS.grenade.cooldown, effects.haste) };
}
