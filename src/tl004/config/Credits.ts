/** Who each serpentela belongs to (shown in the partner intro). */
export const OWNERS: Readonly<Record<string, string>> = {
  caideng: '牛牛',
  jiangpian: '牛牛',
  poker: '牛牛',
  zhusun: '牛牛',
  zhaxidele: '阿蛇',
  jian: '阿蛇',
  youfan3d: '阿言',
  sishikuai: '阿言',
};

/** The 四十塊 card at the end of the partner intro (it is the one being hit, so it has no ability). */
export const SISHIKUAI = {
  id: 'sishikuai',
  name: '四十塊',
  role: '被爆打的那隻',
  description: '逃家了還到處亂跑,躲進塔裡不肯出來。被打中就會整隻飛出畫面。',
  /** Serpentela art used for its card. */
  art: 'serpentela-w50-02',
} as const;

/** 開發名單 in the menu. */
export const CREDITS: readonly { role: string; names: readonly string[] }[] = [
  { role: '程式', names: ['浣熊拉芙'] },
  { role: '美術', names: ['牛牛', '阿樹'] },
  { role: '飼主', names: ['牛牛', '阿蛇', '阿言'] },
];
