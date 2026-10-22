// TL004 level layouts. Each level is built from small helpers (posts, planks, huts, 四十塊) so the
// coordinates stay readable. `node tools/tl004-balance.mjs` solves, checks and writes them to
// src/tl004/levels/levels.json; this file only describes the geometry.

/** Ground line (WORLD.groundY). */
export const G = 940;

/** Height of a 四十塊's centre above the surface it sits on (presettle drops it the last few px). */
const TARGET_LIFT = 42;

function builder() {
  const blocks = [];
  const api = {
    blocks,
    /** A rectangle standing on `bottom`; returns its top. */
    box(material, x, bottom, w, h) {
      blocks.push({ material, x: Math.round(x), y: Math.round(bottom - h / 2), w, h });
      return bottom - h;
    },
    post(x, bottom, h, material = 'wood', w = 30) { return api.box(material, x, bottom, w, h); },
    slab(x, bottom, w, material = 'wood', h = 26) { return api.box(material, x, bottom, w, h); },
    /** Two posts and a roof plank: `span` is outer post-to-post width. Returns the roof top. */
    hut(cx, bottom, span, h, { material = 'wood', roof = material, post = 30, roofH = 26, over = 12 } = {}) {
      const offset = span / 2 - post / 2;
      api.post(cx - offset, bottom, h, material, post);
      api.post(cx + offset, bottom, h, material, post);
      return api.slab(cx, bottom - h, span + over * 2, roof, roofH);
    },
    /** A 四十塊 standing on `bottom`. */
    t(x, bottom, shape) {
      blocks.push({ material: 'target', x: Math.round(x), y: Math.round(bottom - TARGET_LIFT), shape });
    },
  };
  return api;
}

const S = {
  a: 'serpentela-w50-01', b: 'serpentela-w50-02', c: 'serpentela-w50-03', d: 'serpentela-w50-04', e: 'serpentela-w50-05',
  f: 'serpentela-w20-01', g: 'serpentela-w20-02', h: 'serpentela-w20-03', i: 'serpentela-w20-04', j: 'serpentela-w20-05',
  k: 'serpentela-w5-01', l: 'serpentela-w5-02', m: 'serpentela-w5-03', n: 'serpentela-w1-01', o: 'serpentela-w1-02',
};

/** `dx` moves the whole layout sideways: further away is harder to reach with a rough aim. */
function level(id, name, shots, build, { dx = 0 } = {}) {
  const b = builder();
  build(b);
  return { id, name, shots, blocks: b.blocks.map((block) => ({ ...block, x: block.x + dx })) };
}

/** Level 1 is the hand-made hut the user approved: kept exactly as it was. */
const LEVEL_1 = {
  id: 'm1-wood-hut',
  name: '木造小工坊',
  shots: ['caideng', 'zhusun', 'poker', 'jiangpian', 'youfan3d'],
  stars: { two: 35000, three: 45000 },
  blocks: [
    { material: 'wood', x: 1280, y: 865, w: 30, h: 150 },
    { material: 'wood', x: 1540, y: 865, w: 30, h: 150 },
    { material: 'target', x: 1410, y: 895, shape: 'serpentela-w50-02' },
    { material: 'wood', x: 1410, y: 777, w: 300, h: 26 },
    { material: 'wood', x: 1335, y: 709, w: 28, h: 110 },
    { material: 'wood', x: 1485, y: 709, w: 28, h: 110 },
    { material: 'target', x: 1410, y: 718, shape: 'serpentela-w20-01' },
    { material: 'wood', x: 1410, y: 642, w: 200, h: 24 },
    { material: 'target', x: 1410, y: 588, shape: 'serpentela-w5-01' },
  ],
};

/** Every level, keyed by id. Play order is ORDER below. */
const DEFINED = [
  LEVEL_1,

  // 2–6: wood only, each one showing off one partner's ability.
  level('firework-shed', '煙火工坊', ['caideng', 'caideng', 'poker', 'caideng', 'zhusun'], (b) => {
    const roof = b.hut(1430, G, 300, 100, { post: 26, roofH: 22 });
    b.t(1380, G, S.b); b.t(1480, G, S.f);
    b.t(1430, roof, S.k);
  }, { dx: -60 }),

  level('bamboo-gate', '竹林關', ['zhusun', 'zhusun', 'caideng', 'zhusun', 'poker'], (b) => {
    b.post(1300, G, 90, 'wood', 24);
    const roofA = b.hut(1450, G, 190, 120);
    b.t(1450, G, S.c);
    b.t(1405, roofA, S.g);
    b.t(1495, roofA, S.l);
  }),

  level('card-tower', '紙牌塔', ['poker', 'poker', 'caideng', 'poker', 'jiangpian'], (b) => {
    let floor = G;
    for (const shape of [S.d, S.h, S.m]) {
      const top = b.hut(1500, floor, 180, 110);
      b.t(1500, floor, shape);
      floor = top;
    }
  }, { dx: 250 }),

  level('rice-press', '油飯壓頂', ['youfan3d', 'youfan3d', 'caideng', 'youfan3d', 'zhusun'], (b) => {
    b.post(1300, G, 230, 'wood', 36);
    b.post(1342, G, 230, 'wood', 36);
    b.post(1700, G, 230, 'wood', 36);
    const bridge = b.slab(1500, G - 230, 440, 'wood', 28);
    b.t(1450, G, S.a); b.t(1590, G, S.g);
    b.t(1520, bridge, S.n);
  }, { dx: 320 }),

  level('spicy-bounce', '辣味彈跳', ['jiangpian', 'jiangpian', 'poker', 'jiangpian', 'caideng'], (b) => {
    b.t(1360, G, S.e);
    b.t(1500, G, S.o);
    b.hut(1640, G, 160, 100, { post: 26, roofH: 22 });
    b.t(1640, G, S.j);
  }),

  // 7–9: wood and glass, taller, more 四十塊; the two new partners join.
  level('glasshouse', '玻璃溫室', ['jian', 'poker', 'caideng', 'zhusun', 'zhaxidele'], (b) => {
    b.post(1180, G, 170, 'wood', 34);
    b.post(1230, G, 170, 'wood', 34);
    b.post(1300, G, 140); b.post(1700, G, 140);
    b.post(1433, G, 140, 'glass', 24); b.post(1567, G, 140, 'glass', 24);
    const roof = b.slab(1500, G - 140, 440);
    b.t(1366, G, S.f); b.t(1634, G, S.d);
    const top = b.hut(1500, roof, 190, 110, { material: 'glass', post: 24, roof: 'glass', roofH: 22 });
    b.t(1500, roof, S.k);
    b.t(1500, top, S.n);
  }, { dx: 340 }),

  level('longhouse', '長屋', ['zhaxidele', 'zhaxidele', 'jiangpian', 'poker', 'jian'], (b) => {
    // One long low house: a single roof over three 四十塊; knock out a wall and it all comes down.
    b.post(1300, G, 110, 'glass', 26); b.post(1660, G, 110, 'glass', 26);
    b.slab(1480, G - 110, 400);
    b.t(1360, G, S.c); b.t(1480, G, S.g); b.t(1600, G, S.l);
  }, { dx: -60 }),

  level('twin-towers', '雙塔', ['caideng', 'poker', 'zhusun', 'jian', 'youfan3d'], (b) => {
    b.post(1270, G, 160, 'glass', 24);
    const a1 = b.hut(1380, G, 170, 120);
    b.t(1380, G, S.e);
    b.hut(1380, a1, 170, 110, { roof: 'glass', roofH: 22 });
    b.t(1380, a1, S.h);
    b.post(1690, G, 200, 'wood', 30);
    const t1 = b.hut(1800, G, 170, 120, { material: 'glass', post: 24 });
    const t2 = b.hut(1800, t1, 170, 110);
    b.t(1800, t1, S.m);
    b.hut(1800, t2, 150, 100, { material: 'glass', post: 24, roof: 'glass', roofH: 22 });
    b.t(1800, t2, S.b);
  }, { dx: 260 }),

  // 10: the very first stone tower (user's pick), crystals swapped for 四十塊.
  {
    id: 'stone-front', name: '石頭擋路', shots: ['jian', 'youfan3d', 'jian', 'youfan3d', 'caideng'],
    blocks: [
      { material: 'stone', x: 1950, y: 860, w: 100, h: 160 },
      { material: 'stone', x: 2350, y: 860, w: 100, h: 160 },
      { material: 'glass', x: 2090, y: 880, w: 24, h: 120 },
      { material: 'glass', x: 2210, y: 880, w: 24, h: 120 },
      { material: 'glass', x: 2150, y: 808, w: 160, h: 24 },
      { material: 'target', x: 2150, y: 895, shape: 'serpentela-w50-03' },
      { material: 'wood', x: 2150, y: 765, w: 520, h: 30 },
      { material: 'wood', x: 1960, y: 650, w: 30, h: 200 },
      { material: 'wood', x: 2340, y: 650, w: 30, h: 200 },
      { material: 'wood', x: 2080, y: 690, w: 28, h: 120 },
      { material: 'wood', x: 2220, y: 690, w: 28, h: 120 },
      { material: 'target', x: 2150, y: 710, shape: 'serpentela-w20-03' },
      { material: 'wood', x: 2150, y: 617, w: 200, h: 28 },
      { material: 'wood', x: 2150, y: 536, w: 440, h: 28 },
      { material: 'stone', x: 2150, y: 487, w: 70, h: 70 },
      { material: 'target', x: 2150, y: 410, shape: 'serpentela-w1-01' },
    ],
  },

  // 11–15: stone forts; stone stops the dash and the water, so abilities have to be picked well.
  level('stone-wall', '石牆小屋', ['youfan3d', 'caideng', 'zhusun', 'jian', 'zhaxidele'], (b) => {
    b.box('stone', 1330, G, 60, 220);
    const roof = b.hut(1520, G, 220, 130);
    b.t(1520, G, S.j);
    b.t(1520, roof, S.f);
    b.post(1690, G, 110);
    b.t(1770, G, S.k);
  }, { dx: 220 }),

  level('stone-base', '石基高塔', ['caideng', 'youfan3d', 'jian', 'poker', 'zhusun'], (b) => {
    const f1 = b.hut(1510, G, 230, 120, { material: 'wood', post: 36 });
    b.t(1510, G, S.i);
    const f2 = b.hut(1510, f1, 200, 120);
    b.t(1510, f1, S.e);
    b.t(1510, f2, S.n);
    b.box('stone', 1720, G, 60, 60);
    b.t(1800, G, S.c);
  }, { dx: 300 }),

  level('bunker', '碉堡', ['caideng', 'youfan3d', 'jiangpian', 'caideng', 'jian'], (b) => {
    b.box('stone', 1300, G, 60, 180);
    b.box('stone', 1640, G, 60, 180);
    const roof = b.slab(1470, G - 180, 420, 'stone', 36);
    b.t(1420, G, S.g); b.t(1540, G, S.d);
    b.hut(1470, roof, 180, 110);
    b.t(1470, roof, S.m);
    const stand = b.hut(1820, G, 130, 200);
    b.t(1820, stand, S.a);
  }, { dx: 40 }),

  level('stair-town', '階梯城', ['zhusun', 'caideng', 'youfan3d', 'jian', 'zhaxidele'], (b) => {
    const s1 = b.box('stone', 1300, G, 120, 100);
    b.t(1300, s1, S.b);
    const s2 = b.hut(1470, G, 170, 150, { material: 'stone', post: 36 });
    b.t(1470, s2, S.h);
    b.box('glass', 1470, G, 80, 40);
    const s3 = b.hut(1680, G, 170, 220, { material: 'stone', post: 44 });
    b.t(1680, G, S.l);
    b.t(1680, s3, S.o);
  }, { dx: 250 }),

  level('stone-gate', '石門', ['caideng', 'zhusun', 'youfan3d', 'jiangpian', 'jian'], (b) => {
    b.box('stone', 1350, G, 50, 160);
    b.box('stone', 1530, G, 50, 160);
    const lintel = b.slab(1440, G - 160, 260, 'wood', 30);
    b.t(1440, G, S.k);
    b.t(1440, lintel, S.c);
    const t1 = b.hut(1730, G, 150, 130);
    b.t(1730, G, S.f);
    b.t(1730, t1, S.j);
  }, { dx: -40 }),

  // 16–20: tall mixed towers, fewer partners, more 四十塊 hidden deeper.
  level('twin-spires', '雙子高塔', ['poker', 'caideng', 'zhusun', 'jiangpian'], (b) => {
    const a1 = b.hut(1450, G, 170, 120, { material: 'stone', post: 40 });
    b.t(1450, G, S.d);
    const a2 = b.hut(1450, a1, 170, 110, { material: 'glass', post: 24 });
    b.t(1450, a1, S.m);
    const c1 = b.hut(1800, G, 170, 120);
    b.t(1800, G, S.i);
    const c2 = b.hut(1800, c1, 170, 110, { material: 'stone', post: 40 });
    b.t(1800, c1, S.a);
    b.slab(1800, c2, 90);
  }, { dx: -80 }),

  level('glass-spire', '玻璃尖塔', ['zhusun', 'jiangpian', 'caideng', 'jian'], (b) => {
    b.box('stone', 1500, G, 60, 120);
    const f1 = b.hut(1680, G, 200, 120, { material: 'stone', post: 44 });
    b.t(1680, G, S.e);
    const f2 = b.hut(1680, f1, 180, 110, { material: 'glass', post: 24 });
    b.t(1680, f1, S.g);
    const f3 = b.hut(1680, f2, 170, 110);
    b.t(1680, f2, S.l);
    b.hut(1680, f3, 150, 100, { material: 'glass', post: 24, roof: 'glass', roofH: 22 });
    b.t(1680, f3, S.n);
  }),

  level('stone-heart', '石心塔', ['youfan3d', 'caideng', 'zhaxidele', 'jian'], (b) => {
    const core = b.box('stone', 1700, G, 70, 260);
    b.box('stone', 1700, core, 110, 40);
    b.t(1700, core - 40, S.c);
    const l1 = b.hut(1550, G, 150, 120);
    b.t(1550, G, S.f);
    b.hut(1550, l1, 150, 100, { material: 'glass', post: 24 });
    b.t(1550, l1, S.k);
    const r1 = b.hut(1840, G, 150, 120, { material: 'glass', post: 24 });
    b.t(1840, G, S.h);
    b.slab(1840, r1, 120);
    b.t(1840, r1 - 26, S.b);
  }, { dx: 80 }),

  level('castle', '四十塊城堡', ['caideng', 'jian', 'youfan3d', 'zhusun'], (b) => {
    const left = b.hut(1450, G, 180, 240, { material: 'wood', post: 40 });
    b.t(1450, G, S.j);
    b.t(1450, left, S.a);
    const mid = b.hut(1670, G, 220, 130, { material: 'wood', post: 30 });
    b.t(1640, G, S.d); b.t(1720, G, S.o);
    b.slab(1670, mid, 140);
    const right = b.hut(1900, G, 180, 240, { material: 'stone', post: 44 });
    b.t(1900, right, S.m);
  }, { dx: 100 }),

  level('headquarters', '四十塊總部', ['youfan3d', 'caideng', 'jian'], (b) => {
    b.box('stone', 1640, G, 60, 220);
    const f1 = b.hut(1900, G, 300, 130, { material: 'stone', post: 50, roof: 'wood', roofH: 30 });
    b.t(1840, G, S.e); b.t(1960, G, S.i);
    const f2 = b.hut(1900, f1, 240, 120, { material: 'wood' });
    b.box('glass', 1900, f1, 24, 120);
    b.t(1835, f1, S.k); b.t(1965, f1, S.g);
    const f3 = b.hut(1900, f2, 160, 100, { material: 'stone', post: 40, roof: 'stone', roofH: 30 });
    b.t(1900, f2, S.n);
    b.box('stone', 1900, f3, 60, 60);
  }, { dx: 200 }),
];

/**
 * Play order, easiest first (checked with tools/tl004-balance.mjs). Ids are save keys: never rename a
 * released level's id; reordering is safe.
 */
const ORDER = [
  'm1-wood-hut',
  // 2–6: one partner each (彩燈, 竹筍, 撲克, 3D油飯, 薑片).
  'firework-shed', 'bamboo-gate', 'card-tower', 'rice-press', 'spicy-bounce',
  // 7–9: wood and glass; 澗 and 札西德勒 join.
  'glasshouse', 'twin-towers', 'longhouse',
  // 10: the first stone tower.
  'stone-front',
  // 11–15: stone forts.
  'stone-base', 'stone-wall', 'bunker', 'stair-town', 'stone-gate',
  // 16–20: tall mixed towers.
  'glass-spire', 'castle', 'stone-heart', 'twin-spires', 'headquarters',
];

const byId = new Map(DEFINED.map((level) => [level.id, level]));
if (ORDER.length !== DEFINED.length || ORDER.some((id) => !byId.has(id))) throw new Error('ORDER must list every level exactly once');
export const LEVELS = ORDER.map((id) => byId.get(id));
