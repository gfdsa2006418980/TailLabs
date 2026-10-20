import type { Modifier, Tag } from './Combat.ts';

export type MercKind = 'rifle' | 'flame' | 'tesla';
export const MERCENARIES = {
  rifle: { name: '步槍手', callSign: 'ROOK', role: '動能 · 穩定射擊', color: '#e8c58b', recruit: 12, damage: 5.2, interval: 1.25, skill: '破片手榴彈', cooldown: 30, radius: 105, tags: ['Damage.Kinetic', 'Mechanic.Projectile', 'Skill.AutoAttack', 'Weapon.Rifle', 'Mercenary.rifle'] as Tag[] },
  flame: { name: '焚燒兵', callSign: 'EMBER', role: '火焰 · 持續燃燒', color: '#ec865a', recruit: 18, damage: 5, interval: 1.4, skill: '燃燒瓶', cooldown: 35, radius: 110, tags: ['Damage.Fire', 'Mechanic.DOT', 'Skill.AutoAttack', 'Weapon.Flamer', 'Mercenary.flame'] as Tag[] },
  tesla: { name: '電磁兵', callSign: 'VOLT', role: '電能 · 感電增傷', color: '#83c9d4', recruit: 24, damage: 6, interval: 1.3, skill: '貫穿雷射', cooldown: 45, radius: 34, tags: ['Damage.Kinetic', 'Damage.Electric', 'Mechanic.Projectile', 'Skill.AutoAttack', 'Weapon.Tesla', 'Mercenary.tesla'] as Tag[] },
} as const;
export const MERC_KINDS: MercKind[] = ['rifle', 'flame', 'tesla'];
export type EnemyKind = 'walker' | 'runner' | 'brute' | 'armored' | 'elite';
export const ENEMIES = {
  walker: { hp: 25, speed: 44, defense: 5, attack: 7, reward: 3, xp: 1, color: '#9baa78', size: 1 },
  runner: { hp: 19, speed: 66, defense: 0, attack: 5, reward: 4.5, xp: 1, color: '#c3b688', size: 0.85 },
  brute: { hp: 85, speed: 30, defense: 15, attack: 14, reward: 9, xp: 3, color: '#8b9b80', size: 1.5 },
  armored: { hp: 65, speed: 37, defense: 130, attack: 10, reward: 15, xp: 4, color: '#8d9b9c', size: 1.2 },
  elite: { hp: 260, speed: 34, defense: 70, attack: 24, reward: 60, xp: 10, color: '#cb9c77', size: 1.8 },
} as const;

export interface UpgradeCard { id: string; name: string; category: string; description: string; color: string; modifier?: Modifier; effect?: 'speed' | 'haste' | 'radius' | 'wall' | 'repair' }
export const CARDS: readonly UpgradeCard[] = [
  { id: 'kinetic', name: '重型彈頭', category: '動能', description: '所有動能傷害 +45%，包含手榴彈。', color: '#e8c58b', modifier: { kind: 'Add', tags: ['Damage.Kinetic'], value: 0.45 } },
  { id: 'burn', name: '曳光燃燒彈', category: '火焰', description: '普攻附加可累積的燃燒，每秒造成 4 點基礎傷害，持續 4 秒。', color: '#ec865a', modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'ignite', value: 4 } },
  { id: 'bio', name: '腐蝕彈藥', category: '生化', description: '普攻疊加腐蝕。敵人防禦 ÷（1 + 腐蝕強度）。', color: '#b5cc7f', modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'corrode', value: 1 } },
  { id: 'shock', name: '感電彈藥', category: '電能', description: '普攻疊加感電，提高敵人受到的所有傷害，包含燃燒。', color: '#83c9d4', modifier: { kind: 'Special', tags: ['Skill.AutoAttack'], rule: 'shock', value: 1 } },
  { id: 'fire', name: '高濃度燃料', category: '火焰', description: '火焰持續傷害 ×1.6。', color: '#ec865a', modifier: { kind: 'More', tags: ['Damage.Fire', 'Mechanic.DOT'], value: 1.6 } },
  { id: 'speed', name: '快速供彈', category: '傭兵', description: '全隊攻擊速度 ×1.3。', color: '#e8c58b', effect: 'speed' },
  { id: 'active', name: '軍用炸藥', category: '主動技能', description: '所有主動技能傷害 +60%。', color: '#e8c58b', modifier: { kind: 'Add', tags: ['Skill.Active'], value: 0.6 } },
  { id: 'haste', name: '軍火調度', category: '主動技能', description: '技能急速 +100。依等比例公式縮短冷卻。', color: '#83c9d4', effect: 'haste' },
  { id: 'radius', name: '擴散裝藥', category: '主動技能', description: '主動技能範圍 ×1.3。', color: '#ec865a', effect: 'radius' },
  { id: 'income', name: '戰地回收', category: '經濟', description: '擊殺獎金 +50%。', color: '#b5cc7f', modifier: { kind: 'Add', tags: ['Economy.KillReward'], value: 0.5 } },
  { id: 'wall', name: '補強支架', category: '防守', description: '拒馬最大生命 +50%，並修復新增的生命。', color: '#b5cc7f', effect: 'wall' },
  { id: 'repair', name: '緊急工兵', category: '防守', description: '修復拒馬 50% 最大生命。', color: '#b5cc7f', effect: 'repair' },
];
