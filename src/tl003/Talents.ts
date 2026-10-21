import { calculateValue, effectiveCooldown } from './Combat.ts';
import type { Modifier } from './Combat.ts';
import { MERCENARIES, MERC_KINDS } from './Content.ts';
import type { TalentTree } from './Meta.ts';

export const TALENTS = [
  { id: 'mercenary_damage', name: '傭兵訓練', category: '傭兵', growth: 1.06, description: '所有傭兵的普攻與主動技能傷害，每級 ×1.06。', color: '#e8c58b', glyph: '◇', column: 1, row: 0 },
  { id: 'kinetic_damage', name: '動能專精', category: '動能', growth: 1.08, description: '所有動能直接傷害，每級 ×1.08，包含手榴彈。', color: '#e8c58b', glyph: '＋', column: 0, row: 1 },
  { id: 'barricade_health', name: '堅固防線', category: '防守', growth: 1.08, description: '開場拒馬最大生命，每級 ×1.08。', color: '#b5cc7f', glyph: '▱', column: 1, row: 1 },
  { id: 'economy_income', name: '戰場回收', category: '經濟', growth: 1.06, description: '擊殺與 Wave 獎金，每級 ×1.06。', color: '#d8c391', glyph: '¤', column: 2, row: 1 },
  { id: 'fire_dot', name: '高效燃料', category: '火焰', growth: 1.08, description: '所有火焰持續傷害，每級 ×1.08。', color: '#ec865a', glyph: '♨', column: 0, row: 2 },
  { id: 'repair_efficiency', name: '戰地工兵', category: '防守', growth: 1.06, description: '花費資金修復拒馬時，修復量每級 ×1.06。', color: '#b5cc7f', glyph: '✚', column: 1, row: 2 },
  { id: 'attack_speed', name: '供彈訓練', category: '傭兵', growth: 1.03, description: '所有傭兵攻擊速度，每級 ×1.03。', color: '#d8c391', glyph: '»', column: 2, row: 2 },
  { id: 'active_skill_damage', name: '軍火專精', category: '主動技能', growth: 1.08, description: '所有主動技能傷害，每級 ×1.08。', color: '#ec865a', glyph: '◎', column: 0, row: 3 },
  { id: 'active_skill_haste', name: '軍火調度', category: '主動技能', growth: 1.06, description: '技能冷卻效率每級 ×1.06，換算為無上限技能急速。', color: '#83c9d4', glyph: 'ϟ', column: 1, row: 3 },
] as const;
export type TalentId = typeof TALENTS[number]['id'];
export const TALENT_LINKS: readonly (readonly [TalentId, TalentId])[] = [
  ['mercenary_damage', 'kinetic_damage'], ['mercenary_damage', 'barricade_health'], ['mercenary_damage', 'economy_income'],
  ['kinetic_damage', 'fire_dot'], ['barricade_health', 'repair_efficiency'], ['economy_income', 'attack_speed'],
  ['fire_dot', 'active_skill_damage'], ['repair_efficiency', 'active_skill_haste'], ['attack_speed', 'active_skill_haste'],
];
export const talentById = (id: string) => TALENTS.find(node => node.id === id);
export const talentLevel = (tree: TalentTree, id: TalentId) => tree.nodes[id] ?? 0;
export const talentCost = (level: number) => Math.ceil(1.12 ** level);
export function isRevealed(tree: TalentTree, id: TalentId): boolean {
  return id === 'mercenary_damage' || talentLevel(tree, id) > 0 || TALENT_LINKS.some(([a, b]) =>
    (a === id && talentLevel(tree, b) > 0) || (b === id && talentLevel(tree, a) > 0));
}
export function canBreakthrough(tree: TalentTree): boolean {
  return TALENTS.some(node => talentLevel(tree, node.id) >= tree.maxNodeLevel);
}
export const talentMultiplier = (tree: TalentTree, id: TalentId) => talentById(id)!.growth ** talentLevel(tree, id);

export interface PermanentEffects {
  modifiers: Modifier[]; wallHealth: number; attackSpeed: number; haste: number;
}
/** Compile a value snapshot. A later purchase never changes an already-running battle. */
export function compileTalents(tree: TalentTree): PermanentEffects {
  const modifiers: Modifier[] = [];
  const more = (tags: Modifier['tags'], value: number) => { if (value !== 1) modifiers.push({ kind: 'More', tags: [...tags], value }); };
  for (const kind of MERC_KINDS) more([`Mercenary.${kind}`], talentMultiplier(tree, 'mercenary_damage'));
  more(['Damage.Kinetic'], talentMultiplier(tree, 'kinetic_damage'));
  more(['Damage.Fire', 'Mechanic.DOT'], talentMultiplier(tree, 'fire_dot'));
  more(['Skill.Active'], talentMultiplier(tree, 'active_skill_damage'));
  more(['Economy.KillReward'], talentMultiplier(tree, 'economy_income'));
  more(['Economy.WaveReward'], talentMultiplier(tree, 'economy_income'));
  more(['Defense.Repair'], talentMultiplier(tree, 'repair_efficiency'));
  return { modifiers, wallHealth: talentMultiplier(tree, 'barricade_health'), attackSpeed: talentMultiplier(tree, 'attack_speed'),
    haste: 100 * (talentMultiplier(tree, 'active_skill_haste') - 1) };
}
export function deploymentStats(effects: PermanentEffects) {
  const rifle = MERCENARIES.rifle;
  const damage = calculateValue(rifle.damage, rifle.tags, effects.modifiers);
  return { damage, dps: damage / (rifle.interval / effects.attackSpeed), wallHealth: 40 * effects.wallHealth,
    income: calculateValue(1, ['Economy.KillReward'], effects.modifiers), grenadeCooldown: effectiveCooldown(rifle.cooldown, effects.haste) };
}
