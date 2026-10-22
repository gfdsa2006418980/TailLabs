import { calculateValue, effectiveCooldown } from './Combat.ts';
import type { Modifier, Tag } from './Combat.ts';
import { MERCENARIES, MERC_KINDS } from './Content.ts';
import type { TalentTree } from './Meta.ts';

/**
 * Command star map (spec §52–64). 47 general nodes in 8 branches around a hub, all uncapped and
 * multiplicative (`growth ^ level`), plus 16 tactical cores (0/1) at branch tips and between branches.
 * The 9 original node ids are kept so existing saves keep every level.
 */
export const BRANCHES = ['動能', '火焰', '生化', '電能', '傭兵', '主動技能', '拒馬', '經濟'] as const;
export type Branch = typeof BRANCHES[number] | '中心';
const BRANCH_COLOR: Record<Branch, string> = {
  中心: '#e8c58b', 動能: '#e8c58b', 火焰: '#ec865a', 生化: '#b5cc7f', 電能: '#83c9d4', 傭兵: '#d8c391', 主動技能: '#f0a35e', 拒馬: '#a9c48a', 經濟: '#e3cf8f',
};
const BRANCH_GLYPH: Record<Branch, string> = { 中心: '◆', 動能: '✦', 火焰: '♨', 生化: '☣', 電能: 'ϟ', 傭兵: '»', 主動技能: '◎', 拒馬: '▱', 經濟: '¤' };

interface NodeSpec { id: string; name: string; growth: number; describe: string; flavor: string }
/** Branch order matches BRANCHES; the first node of each branch links to the hub. */
const SPECS: Record<Branch, NodeSpec[]> = {
  中心: [{ id: 'mercenary_damage', name: '傭兵訓練', growth: 1.06, describe: '所有傭兵的普攻與技能傷害', flavor: '基本功，練到不用想。' }],
  動能: [
    { id: 'kinetic_damage', name: '動能專精', growth: 1.08, describe: '所有動能傷害，包含手榴彈', flavor: '火藥多放一點。' },
    { id: 'crit_rate', name: '射擊精度', growth: 1.05, describe: '暴擊率（每級 +0.5%）', flavor: '準星對齊，再扣。' },
    { id: 'crit_power', name: '要害訓練', growth: 1.04, describe: '暴擊傷害', flavor: '知道哪裡最痛。' },
    { id: 'pierce_training', name: '穿甲訓練', growth: 1.04, describe: '穿透後保留的傷害（上限 95%）', flavor: '別讓子彈停下來。' },
    { id: 'impact', name: '震退裝藥', growth: 1.05, describe: '手榴彈擊退距離', flavor: '把它們推回去。' },
    { id: 'armor_breaker', name: '破甲戰術', growth: 1.06, describe: '對裝甲兵、精英與屍王的傷害', flavor: '大的先打。' },
  ],
  火焰: [
    { id: 'fire_dot', name: '高效燃料', growth: 1.08, describe: '所有火焰持續傷害', flavor: '燒得更旺。' },
    { id: 'slow_burn', name: '緩燃劑', growth: 1.04, describe: '燃燒持續時間', flavor: '慢慢燒，燒乾淨。' },
    { id: 'igniter', name: '引燃技術', growth: 1.06, describe: '普攻造成的燃燒傷害', flavor: '每一發都帶火。' },
    { id: 'firezone', name: '火區擴張', growth: 1.03, describe: '燃燒瓶火區半徑', flavor: '潑得更開。' },
    { id: 'fuel_stock', name: '汽油存量', growth: 1.04, describe: '燃燒瓶火區持續時間', flavor: '油還很多。' },
  ],
  生化: [
    { id: 'corrosion_power', name: '腐蝕研究', growth: 1.06, describe: '施加的腐蝕強度', flavor: '配方又改良了。' },
    { id: 'corrosion_time', name: '酸液保存', growth: 1.04, describe: '腐蝕持續時間', flavor: '酸不會自己乾掉。' },
    { id: 'eroder', name: '侵蝕彈頭', growth: 1.05, describe: '對防禦 50 以上敵人的傷害', flavor: '越硬越好吃。' },
    { id: 'toxic_residue', name: '毒霧殘留', growth: 1.06, describe: '腐蝕中的敵人死亡時，使周圍敵人腐蝕', flavor: '死了也要害人。' },
    { id: 'bio_shield', name: '生化防護', growth: 1.03, describe: '腐蝕中的敵人對拒馬的傷害降低', flavor: '它們的牙齒先爛了。' },
  ],
  電能: [
    { id: 'shock_power', name: '電容強化', growth: 1.06, describe: '施加的感電強度', flavor: '電容再加一組。' },
    { id: 'shock_time', name: '蓄電', growth: 1.04, describe: '感電持續時間', flavor: '電流留在體內。' },
    { id: 'laser_focus', name: '雷射校準', growth: 1.08, describe: '雷射傷害', flavor: '焦點對準了。' },
    { id: 'coil_cooling', name: '線圈冷卻', growth: 1.03, describe: '電磁兵攻擊速度', flavor: '線圈不再過熱。' },
    { id: 'stun_field', name: '高壓警戒', growth: 1.02, describe: '感電中的敵人移動速度降低（下限 −40%）', flavor: '電麻了就走不動。' },
  ],
  傭兵: [
    { id: 'attack_speed', name: '供彈訓練', growth: 1.03, describe: '所有傭兵攻擊速度', flavor: '換彈匣再快一秒。' },
    { id: 'rifle_specialist', name: '步槍專精', growth: 1.07, describe: '步槍手的所有傷害', flavor: '一槍一個。' },
    { id: 'flame_specialist', name: '焚燒兵專精', growth: 1.07, describe: '焚燒兵的所有傷害', flavor: '噴嘴調到最大。' },
    { id: 'tesla_specialist', name: '電磁兵專精', growth: 1.07, describe: '電磁兵的所有傷害', flavor: '電壓拉滿。' },
    { id: 'recruiter', name: '招募網路', growth: 1.03, describe: '招募費用降低', flavor: '外面還有人願意來。' },
    { id: 'veteran', name: '資深士官', growth: 1.02, describe: '升級費用降低', flavor: '老兵帶新兵。' },
  ],
  主動技能: [
    { id: 'active_skill_damage', name: '軍火專精', growth: 1.08, describe: '所有主動技能傷害', flavor: '炸藥，更多炸藥。' },
    { id: 'active_skill_haste', name: '火力排程', growth: 1.06, describe: '技能冷卻效率（換算為無上限急速）', flavor: '補給線很順。' },
    { id: 'skill_reach', name: '射程延伸', growth: 1.02, describe: '所有技能範圍', flavor: '丟得更遠，炸得更開。' },
    { id: 'grenade_payload', name: '破片強化', growth: 1.08, describe: '手榴彈傷害', flavor: '破片多兩倍。' },
    { id: 'molotov_payload', name: '燃料配方', growth: 1.08, describe: '燃燒瓶傷害', flavor: '瓶子裡不只是汽油。' },
    { id: 'laser_width', name: '聚焦鏡組', growth: 1.02, describe: '雷射寬度', flavor: '光束更粗了。' },
  ],
  拒馬: [
    { id: 'barricade_health', name: '堅固防線', growth: 1.08, describe: '開場拒馬最大生命', flavor: '再釘一層。' },
    { id: 'repair_efficiency', name: '工兵手冊', growth: 1.06, describe: '修復拒馬的修復量', flavor: '工兵手腳很快。' },
    { id: 'plating', name: '裝甲焊接', growth: 1.01, describe: '拒馬受到的傷害降低（每級 1%，疊乘）', flavor: '焊上去。' },
    { id: 'spikes', name: '倒刺鐵網', growth: 1.08, describe: '啃咬拒馬的敵人受到反傷', flavor: '咬下去會痛。' },
    { id: 'builder', name: '建材配給', growth: 1.03, describe: '補強拒馬的費用降低', flavor: '木頭便宜了。' },
    { id: 'field_medic', name: '維修配額', growth: 1.03, describe: '修復拒馬的費用降低', flavor: '工具都準備好了。' },
  ],
  經濟: [
    { id: 'economy_income', name: '戰利品回收', growth: 1.06, describe: '擊殺與 Wave 獎金', flavor: '能用的都撿回來。' },
    { id: 'wave_bonus', name: '波次獎勵', growth: 1.08, describe: 'Wave 獎金', flavor: '撐過一波，賞一波。' },
    { id: 'bounty', name: '懸賞名單', growth: 1.08, describe: '精英與屍王的擊殺獎金', flavor: '頭目值錢。' },
    { id: 'starting_funds', name: '作戰經費', growth: 1.1, describe: '開場資金（第 1 級 5，之後等比）', flavor: '出發前先領錢。' },
    { id: 'logistics', name: '後勤補給', growth: 1, describe: '每 5 級，每局免費重抽 +1', flavor: '補給官多給了一箱。' },
    { id: 'supply_line', name: '軍需運輸', growth: 1.06, describe: '每 10 秒被動收入', flavor: '卡車準時到。' },
    { id: 'lucky', name: '優先配給', growth: 1.03, describe: '稀有以上補給的出現權重', flavor: '好貨先留給我們。' },
  ],
};

export interface TalentNode {
  id: string; name: string; category: Branch; growth: number; description: string; flavor: string;
  color: string; glyph: string; x: number; y: number;
}
/** Map coordinates in px: the hub at the centre, branches every 45° from the top, nodes every 78 px outwards. */
export const MAP_SIZE = 1500, MAP_CENTRE = MAP_SIZE / 2;
const RING = (i: number) => 130 + i * 78;
const angleOf = (b: number) => -Math.PI / 2 + b * Math.PI / 4;
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
  { at: 0, between: false, spec: { id: 'coldsteel', name: '冷鋼紀律', kind: '狀態', rule: '直接傷害無視敵人 60% 防禦，普攻必定穿透 1 名。', price: '永遠不會暴擊。', flavor: '不靠運氣，靠紀律。', cost: 15, exclusive: ['cremation', 'agony'] } },
  { at: 1, between: false, spec: { id: 'layers', name: '千層烈焰', kind: '狀態', rule: '燃燒不再只取最強，改為可以疊加，最多 10 層。', price: '每層威力 ×0.35。', flavor: '一層一層燒上去。', cost: 15 } },
  { at: 2, between: false, spec: { id: 'agony', name: '痛苦精通', kind: '轉換', rule: '暴擊時，這一擊施加的燃燒、腐蝕、感電威力 × 暴擊傷害。', price: '暴擊不再加倍直接傷害。', flavor: '讓它們痛得久一點。', cost: 25, exclusive: ['coldsteel', 'cremation'] } },
  { at: 3, between: false, spec: { id: 'rotation', name: '元素輪替', kind: '狀態', rule: '敵人受到與上一擊「不同屬性」的傷害 ×1.6。', price: '同屬性連打 ×0.7。', flavor: '換個方式打，它就扛不住。', cost: 25, exclusive: ['uniform'] } },
  { at: 4, between: false, spec: { id: 'lonewolf', name: '孤狼', kind: '陣容', rule: '只能部署 1 名傭兵；他的傷害 ×4、攻速 ×1.5、技能冷卻 ×0.5。', price: '另外兩個招募入口關閉。', flavor: '一個人就夠了。', cost: 40, exclusive: ['uniform'] } },
  { at: 5, between: false, spec: { id: 'autofire', name: '自動火控', kind: '技能', rule: '技能就緒時自動朝最大的敵群施放，仍可手動拖曳。', price: '技能傷害 ×0.85。', flavor: '系統會自己找目標。', cost: 15, exclusive: ['bloodprice'] } },
  { at: 6, between: false, spec: { id: 'plunder', name: '掠奪者', kind: '經濟', rule: '每次擊殺回復拒馬 1% 最大生命，補強費用 ×0.6。', price: '「修復」停用。', flavor: '拆它們的骨頭補牆。', cost: 15 } },
  { at: 7, between: false, spec: { id: 'ammoeco', name: '彈藥經濟', kind: '經濟', rule: '普攻傷害 ×（1 + log₂(1 + 資金) ÷ 4）。', price: '每發消耗當前資金 1%；資金歸零時傷害 ×0.5。', flavor: '錢就是子彈。', cost: 25 } },
  { at: 0, between: true, spec: { id: 'cremation', name: '焚化協議', kind: '轉換', rule: '所有直接傷害改為以 120% 威力掛上燃燒。', price: '不再造成任何直接傷害。', flavor: '全部燒掉，一個不留。', cost: 25, exclusive: ['coldsteel', 'agony'] } },
  { at: 1, between: true, spec: { id: 'corpseblast', name: '屍爆連鎖', kind: '連鎖', rule: '敵人死亡時爆炸，對周圍造成其最大生命 20% 的動能爆炸傷害，可以連鎖。', price: '擊殺獎金 ×0.7。', flavor: '一爆一整片。', cost: 25 } },
  { at: 2, between: true, spec: { id: 'raisedead', name: '亡者徵召', kind: '連鎖', rule: '被擊殺的一般喪屍有 30% 機率變成我方屍兵，往前衝進敵群爆炸。', price: '拒馬最大生命 ×0.6。', flavor: '它們會替我們走回去。', cost: 40 } },
  { at: 3, between: true, spec: { id: 'focusfire', name: '集火射擊', kind: '連鎖', rule: '連續命中同一目標，每發傷害 +15%，最多 ×4。', price: '換目標就歸零。', flavor: '所有人，打那一隻。', cost: 15 } },
  { at: 4, between: true, spec: { id: 'uniform', name: '制式部隊', kind: '陣容', rule: '可以招募 3 名步槍手；每多一名，全隊傷害 ×1.3。', price: '只能招募步槍手。', flavor: '同一套裝備，同一套戰法。', cost: 40, exclusive: ['lonewolf', 'rotation'] } },
  { at: 5, between: true, spec: { id: 'bloodprice', name: '血債血償', kind: '技能', rule: '技能不再有冷卻，修復費用 ×0.5。', price: '每次施放消耗拒馬 10% 最大生命。', flavor: '用牆換火力。', cost: 25, exclusive: ['autofire'] } },
  { at: 6, between: true, spec: { id: 'pointblank', name: '定點防禦', kind: '距離', rule: '敵人越接近拒馬受到的傷害越高，拒馬前 ×2.5。', price: '遠處只有 ×0.4。', flavor: '等它們靠近。', cost: 15 } },
  { at: 7, between: true, spec: { id: 'blackmarket', name: '黑市補給', kind: '補給', rule: '戰地補給改為五選二。', price: '其中 1～2 張是帶副作用的詛咒卡，重抽停用。', flavor: '別問貨從哪來。', cost: 25 } },
];
export const CORES: readonly CoreNode[] = CORE_SPECS.map(({ at, between, spec }) => {
  const branch = BRANCHES[at]!, next = BRANCHES[(at + 1) % BRANCHES.length]!;
  const reach = RING(SPECS[branch].length - 1);
  const position = between ? place(angleOf(at) + Math.PI / 8, Math.max(reach, RING(SPECS[next].length - 1)) + 40) : place(angleOf(at), reach + 92);
  return { ...spec, exclusive: spec.exclusive ?? [], links: between ? [tipOf(branch), tipOf(next)] : [tipOf(branch)], ...position, color: between ? '#ff7a5c' : '#ffd062' };
});
export const coreById = (id: string) => CORES.find(core => core.id === id);
/** Core slots open with the map tier: T1 one, T2 two, T3 three (spec max 3). */
export const coreSlots = (tree: TalentTree) => Math.min(3, Math.max(1, tree.tier));
export const isCoreRevealed = (tree: TalentTree, id: string) => coreById(id)?.links.some(link => talentLevel(tree, link) > 0) ?? false;
export const isCoreUnlocked = (tree: TalentTree, id: string) => tree.unlockedCoreTalents.includes(id);
export const isCoreActive = (tree: TalentTree, id: string) => tree.activeCoreTalents.includes(id);
/** Active cores that cannot share a loadout with `id`. */
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
  return TALENTS.some(node => talentLevel(tree, node.id) >= tree.maxNodeLevel);
}
export const talentMultiplier = (tree: TalentTree, id: string) => (talentById(id)?.growth ?? 1) ** talentLevel(tree, id);

/** Everything a run takes from the star map, as one value snapshot. Neutral values mean "no talent". */
export interface PermanentEffects {
  modifiers: Modifier[]; wallHealth: number; attackSpeed: number; haste: number;
  critChance?: number; critDamage?: number; pierceRetention?: number; knockback?: number; armorBreaker?: number;
  burnTime?: number; molotovRadius?: number; molotovTime?: number;
  corrosionGain?: number; corrosionTime?: number; eroder?: number; toxicResidue?: number; bioShield?: number;
  shockGain?: number; shockTime?: number; teslaSpeed?: number; stunField?: number;
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
  for (const kind of MERC_KINDS) more([`Mercenary.${kind}`], m('mercenary_damage'));
  more(['Damage.Kinetic'], m('kinetic_damage'));
  more(['Damage.Fire', 'Mechanic.DOT'], m('fire_dot'));
  more(['Skill.Active'], m('active_skill_damage'));
  more(['Economy.KillReward'], m('economy_income'));
  more(['Economy.WaveReward'], m('economy_income') * m('wave_bonus'));
  more(['Defense.Repair'], m('repair_efficiency'));
  more(['Skill.AutoAttack', 'Mechanic.DOT'], m('igniter'));
  more(['Mercenary.rifle'], m('rifle_specialist')); more(['Mercenary.flame'], m('flame_specialist')); more(['Mercenary.tesla'], m('tesla_specialist'));
  more(['Mercenary.tesla', 'Skill.Active'], m('laser_focus'));
  more(['Mercenary.rifle', 'Skill.Active'], m('grenade_payload')); more(['Mercenary.flame', 'Skill.Active'], m('molotov_payload'));
  if (lv('recruiter')) more(['Economy.RecruitCost'], 1 / m('recruiter'));
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
  set('burnTime', m('slow_burn'), 1);
  set('molotovRadius', m('firezone'), 1); set('molotovTime', m('fuel_stock'), 1);
  set('corrosionGain', m('corrosion_power') - 1, 0); set('corrosionTime', m('corrosion_time'), 1);
  set('eroder', m('eroder'), 1); set('toxicResidue', lv('toxic_residue') ? 0.3 * m('toxic_residue') : 0, 0);
  set('bioShield', 1 / m('bio_shield'), 1);
  set('shockGain', m('shock_power') - 1, 0); set('shockTime', m('shock_time'), 1);
  set('teslaSpeed', m('coil_cooling'), 1); set('stunField', Math.max(0.6, 1 / m('stun_field')), 1);
  set('skillRange', m('skill_reach'), 1); set('laserWidth', m('laser_width'), 1);
  set('wallReduction', 1 - 0.99 ** lv('plating'), 0);
  set('thorns', lv('spikes') ? 0.1 * talentMultiplier(tree, 'spikes') : 0, 0);
  set('fortifyCost', 1 / m('builder'), 1); set('repairCost', 1 / m('field_medic'), 1);
  set('bounty', m('bounty'), 1);
  set('startMoney', lv('starting_funds') ? 5 * 1.1 ** (lv('starting_funds') - 1) : 0, 0);
  set('freeRerolls', Math.floor(lv('logistics') / 5), 0);
  set('passiveIncome', lv('supply_line') ? 2 * m('supply_line') : 0, 0);
  set('luck', m('lucky'), 1);
  const cores = tree.activeCoreTalents.filter((id): id is CoreId => !!coreById(id)).slice(0, coreSlots(tree));
  if (cores.length) effects.cores = cores;
  return effects;
}
export function deploymentStats(effects: PermanentEffects) {
  const rifle = MERCENARIES.rifle;
  const damage = calculateValue(rifle.damage, rifle.tags, effects.modifiers);
  return { damage, dps: damage / (rifle.interval / effects.attackSpeed), wallHealth: 40 * effects.wallHealth,
    income: calculateValue(1, ['Economy.KillReward'], effects.modifiers), grenadeCooldown: effectiveCooldown(rifle.cooldown, effects.haste) };
}
