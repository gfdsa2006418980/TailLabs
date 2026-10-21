// TL003《無盡防線》pixel art source. Build: npm run art:tl003
// 1 sprite pixel = 1 pixel of the 240-wide battlefield buffer (= 2 logical field units).

// ---------- Palette ----------
use([]);
pal({
  k: "#121619",                                   // outline
  d: "#1d2722", D: "#2b3a31", e: "#3b4d3f", E: "#516650", f: "#6d8160", F: "#93a27a", // field greens
  q: "#3f3a2c", Q: "#5f5640", t: "#8a7b5a", T: "#bfae84", w: "#eadfbd",               // khaki / wood / bone
  a: "#c08e6a", A: "#8f644c",                                                          // human skin
  z: "#4f6140", Z: "#74895a", y: "#a3b47a",                                            // zombie skin
  r: "#4d2324", R: "#87372f", o: "#c8613a", O: "#ee9d4f", Y: "#ffd884",                // blood / fire
  c: "#2b6470", C: "#56aebb", L: "#bff1ea",                                            // electric
  m: "#343c44", M: "#56626d", n: "#87949c", N: "#b9c3c4",                              // steel
  // role keys, recolored per sprite with swap
  H: "T", h: "t", U: "E", u: "e", B: "Q", b: "q", G: "q", P: "D", p: "d", x: "m",
  V: "t", v: "Q", J: "M", j: "m",
});
ramps("kdDeEfF", "kqQtTw", "kAa", "kzZy", "krRoOY", "kcCL", "kmMnN");

// ---------- Mercenaries (seen from behind, facing up the road) ----------
sprite("_merc_body", { mx: true }, `
  ......HH
  ....HHHH
  ...HHHHH
  ...HHHHH
  ...hhhhh
  .....aaa
  ..UUUUBB
  .UUUUBBB
  .UUuBBBB
  uUUuBbBB
  uUUuBBBB
  uUUuBbBB
  aUUuBBBB
  ..GGGGGG
  ..PPPPPP
  ..PPPPpP
  ..PPPPp.
  ..PPPPp.
  ..PPPPp.
  ..xxxxx.`);

const MERC = { w: 20, h: 25, outline: "k" };
sprite("merc_rifle", MERC,
  stamp("_merc_body", 1, 5, { swap: { H: "T", h: "t" } }),
  line(18, 20, 18, 2, "m"), line(17, 21, 17, 15, "Q"), px(18, 1, "M"), px(17, 18, "a"));
sprite("merc_rifle_fire", { base: "merc_rifle" },
  px(19, 1, "Y"), px(19, 0, "O"), px(18, 0, "Y"), px(20, 1, "O"), px(20, 0, "w"));

sprite("merc_flame", MERC,
  stamp("_merc_body", 1, 5, { swap: { H: "o", h: "R" } }),
  rect(7, 10, 3, 8, "o"), rect(10, 10, 3, 8, "o"), vline(9, 10, 8, "R"), vline(12, 10, 8, "R"),
  hline(7, 10, 2, "O"), hline(10, 10, 2, "O"), rect(7, 12, 6, 1, "m"),
  line(18, 21, 18, 7, "M"), line(17, 21, 17, 17, "m"), px(18, 6, "O"), px(17, 18, "a"));
sprite("merc_flame_fire", { base: "merc_flame" },
  px(19, 6, "O"), px(19, 5, "Y"), px(18, 4, "O"), px(19, 4, "Y"), px(20, 3, "o"), px(20, 5, "O"), px(19, 3, "O"));

sprite("merc_tesla", MERC,
  stamp("_merc_body", 1, 5, { swap: { H: "C", h: "c" } }),
  rect(7, 10, 6, 8, "m"), hline(7, 11, 6, "C"), hline(7, 13, 6, "c"), hline(7, 15, 6, "C"), rect(9, 9, 2, 1, "L"),
  line(18, 21, 18, 4, "M"), hline(17, 8, 3, "c"), hline(17, 11, 3, "c"), px(18, 3, "L"), px(17, 18, "a"));
sprite("merc_tesla_fire", { base: "merc_tesla" },
  px(18, 2, "L"), px(17, 1, "C"), px(19, 1, "C"), px(18, 0, "L"), px(16, 2, "c"), px(20, 2, "c"));

sprite("merc_slot", { w: 14, h: 6 }, (c) => {
  for (let x = 0; x < 14; x += 2) { c.px(x, 0, "F"); c.px(x + 1, 5, "F"); }
  c.px(0, 2, "F"); c.px(0, 4, "F"); c.px(13, 1, "F"); c.px(13, 3, "F");
  c.rect(6, 1, 2, 4, "T"); c.rect(5, 2, 4, 2, "T");
});

// ---------- Zombies (front view, walking towards the camera) ----------
// Hand-drawn, asymmetric: tilted head, one dead socket, left arm reaching, torn hem.
sprite("_walker_still", `
  .....zzzz.....
  ....zZZZZz....
  ....ZyZZZZz...
  ....ZkZZYZz...
  ....zZrkrZ....
  .....zZrZz....
  ..vVVVvVVVv...
  .yVVVVvVVVVV..
  yZVrVVvVVVVVZ.
  .ZVVVrvVVVVVZ.
  ..VVVVvVVVVVZ.
  ..VVvVVvVVrVZz
  ..VJVJJJVJJ.Zy
  ...JJJJJJJJ...
  ...JJJj.JJJ...
  ...JJJj.JJj...
  ...JJJj.JJj...
  ...zzz..zzz...`);

// Two-step shamble: each leg lifts once; the arm on that side drags.
const walk = (w, legL, legR, foot) => [
  frame(),
  frame(rect(legL, foot, 3, 1, "_"), rect(legL, foot - 1, 3, 1, "z")),
  frame(),
  frame(rect(legR, foot, 3, 1, "_"), rect(legR, foot - 1, 3, 1, "z")),
];
anim("zombie_walker", { base: "_walker_still", outline: "k", fps: 6 }, ...walk(14, 3, 8, 17));
anim("zombie_runner", { base: "_walker_still", outline: "k", fps: 10, swap: { V: "R", v: "r", Z: "y", z: "Z", J: "q", j: "k" } }, ...walk(14, 3, 8, 17));

sprite("_armored_still", { base: "_walker_still" },
  rect(4, 0, 7, 3, "M"), hline(5, 0, 5, "n"), rect(3, 2, 9, 1, "m"), hline(4, 3, 7, "m"), px(8, 3, "Y"), px(5, 3, "r"),
  rect(2, 6, 10, 6, "M"), hline(2, 6, 10, "n"), rect(3, 8, 3, 2, "m"), rect(8, 8, 3, 2, "m"), vline(6, 7, 5, "n"), vline(7, 7, 5, "m"), px(10, 10, "R"));
anim("zombie_armored", { base: "_armored_still", outline: "k", fps: 5 }, ...walk(14, 3, 8, 17));

sprite("_brute_still", { mx: true }, `
  .......zzz
  ......zZZZ
  ......ZYZZ
  ......zrrr
  ...VVVVVVV
  ..ZVVVVVVV
  .ZZVVVVyyy
  .ZZVVVyZZZ
  ZZzVVyZZZZ
  ZZzVVZZZrZ
  ZZ.VVZZZZZ
  Z..VVVZZZz
  ...JJJJJJJ
  ...JJJJJjJ
  ...JJJJj..
  ...JJJJj..
  ...JJJJj..
  ...zzzz...`);
anim("zombie_brute", { base: "_brute_still", outline: "k", fps: 4 }, ...walk(20, 3, 13, 17).map((f, i) =>
  i === 1 ? frame(rect(3, 17, 4, 1, "_"), rect(3, 16, 4, 1, "z")) : i === 3 ? frame(rect(13, 17, 4, 1, "_"), rect(13, 16, 4, 1, "z")) : f));

sprite("_elite_still", { mx: true }, `
  ..w........
  ..w.....zzz
  ..ww...zZZZ
  ...w...ZOZZ
  ...ZZ..zZrr
  ..ZZZZRRRZZ
  .ZZZZRwwwww
  .ZZzZRRRRRR
  ZZZzZRwwwww
  ZZzzZRRRRRR
  ZZ.zZZRwwww
  Zy.zZZZZZZr
  y..zZZZZZZZ
  ...JJJJJJJJ
  ...JJJJJJjJ
  ...JJJJJj..
  ...JJJJJj..
  ...JJJJJj..
  ...JJJJJj..
  ...zzzzz...`);
anim("zombie_elite", { base: "_elite_still", outline: "k", fps: 4 },
  frame(), frame(rect(3, 19, 5, 1, "_"), rect(3, 18, 5, 1, "z")), frame(), frame(rect(14, 19, 5, 1, "_"), rect(14, 18, 5, 1, "z")));

// Boss: a hulking, spiked abomination that charges down the middle of the road.
sprite("_boss_still", { mx: true }, `
  ...w..........
  ...ww.....zzzz
  ....w....zZZZZ
  ....ww..zZZZZZ
  .....w..ZZOOZZ
  ...ZZZ..zZZZrr
  ..ZZZZZZZzZrRr
  .ZZZZZZRRRRRRR
  .ZZZZZRRRwwwRw
  ZZZZzZRRRRRRRR
  ZZZzzZRRwwwRRw
  ZZZzZZRRRRRRRR
  ZZyzZZZRRwwRRw
  ZZyzZZZRRRRRRR
  Zy.zZZZZZZZZZZ
  Zy.zZZZZZZZZZz
  yy.zzZZZZZZZZZ
  ...JJJJJJJJJJJ
  ...JJJJJJJJJjJ
  ...JJJJJJJj...
  ...JJJJJJJj...
  ...JJJJJJJj...
  ...JJJJJJJj...
  ...zzzzzzz....`);
anim("zombie_boss", { base: "_boss_still", outline: "k", fps: 3 },
  frame(), frame(rect(3, 23, 7, 1, "_"), rect(3, 22, 7, 1, "z")), frame(), frame(rect(18, 23, 7, 1, "_"), rect(18, 22, 7, 1, "z")));

// ---------- Barricade ----------
const beam = (c, x0, y0, x1, y1) => { c.line(x0, y0, x1, y1, "t"); c.line(x0 + 1, y0, x1 + 1, y1, "Q"); };
sprite("barricade", { w: 18, h: 13, outline: "k" }, (c) => {
  c.rect(0, 7, 18, 3, "q"); c.hline(0, 7, 18, "Q");
  beam(c, 1, 0, 14, 12); beam(c, 14, 0, 1, 12);
  c.px(2, 0, "T"); c.px(15, 0, "T");
  for (const x of [0, 4, 8, 12, 16]) c.px(x, 5, "n");
  for (const x of [2, 6, 10, 14]) c.px(x, 4, "N");
});
sprite("barricade_broken", { base: "barricade", swap: { t: "Q", T: "t" } },
  rect(5, 2, 3, 3, "_"), px(6, 5, "k"), px(11, 8, "R"), px(12, 9, "r"));

// ---------- Effects ----------
anim("explosion", { w: 25, h: 25, frames: 6, fps: 12, loop: false }, (c) => {
  const f = c.frame, cx = 12, cy = 12;
  if (f === 0) { c.circ(cx, cy, 3, "w"); c.circ(cx, cy, 2, "Y"); }
  if (f === 1) { c.circ(cx, cy, 7, "O"); c.circ(cx, cy, 5, "Y"); c.circ(cx, cy, 2, "w"); }
  if (f === 2) { c.circ(cx, cy, 10, "o"); c.circ(cx, cy, 8, "O"); c.circ(cx, cy, 4, "Y"); }
  if (f === 3) { c.circ(cx, cy, 11, "R"); c.circ(cx, cy, 9, "o"); c.circ(cx - 2, cy - 2, 4, "e"); c.circ(cx + 3, cy - 1, 3, "e"); }
  if (f === 4) { c.ring(cx, cy, 11, "r"); for (const [x, y, r] of [[8, 9, 4], [15, 10, 4], [12, 15, 3], [11, 6, 3]]) c.circ(x, y, r, "E"); }
  if (f === 5) { for (const [x, y, r] of [[7, 8, 3], [16, 9, 3], [12, 15, 2], [11, 5, 2]]) c.circ(x, y, r, "F"); }
});
anim("fire", { w: 9, h: 13, frames: 4, fps: 10 }, (c) => {
  const k = c.phase * Math.PI * 2, top = Math.round(1 + Math.sin(k) * 1.5), lean = Math.round(Math.cos(k));
  c.poly([0, 13, 4 + lean, top, 9, 13], "R");
  c.poly([1, 13, 4 + lean, top + 3, 8, 13], "o");
  c.poly([2, 13, 4 - lean, top + 6, 7, 13], "O");
  c.poly([3, 13, 4, top + 9, 6, 13], "Y");
});
sprite("muzzle", { w: 5, h: 5 }, `
  ..Y..
  .YOY.
  YOwOY
  .YOY.
  ..Y..`);
anim("hit", { w: 7, h: 7, frames: 3, fps: 16, loop: false }, (c) => {
  if (c.frame === 0) { c.px(3, 3, "w"); c.px(3, 1, "Y"); c.px(3, 5, "Y"); c.px(1, 3, "Y"); c.px(5, 3, "Y"); }
  if (c.frame === 1) { c.px(3, 0, "Y"); c.px(3, 6, "Y"); c.px(0, 3, "Y"); c.px(6, 3, "Y"); c.px(1, 1, "O"); c.px(5, 5, "O"); c.px(5, 1, "O"); c.px(1, 5, "O"); }
  if (c.frame === 2) { c.px(0, 0, "o"); c.px(6, 6, "o"); c.px(6, 0, "o"); c.px(0, 6, "o"); }
});
anim("death", { w: 15, h: 9, frames: 4, fps: 10, loop: false }, (c) => {
  const r = [2, 4, 5, 5][c.frame], col = ["R", "F", "f", "E"][c.frame];
  c.ellipse(7, 5, r + 2, Math.max(1, r - 2), col);
  if (c.frame < 2) { c.px(3, 2, "r"); c.px(11, 3, "r"); c.px(7, 1, "R"); }
});
anim("zap", { w: 7, h: 9, frames: 3, fps: 14 }, (c) => {
  const pts = [[[3, 0], [2, 2], [4, 4], [2, 6], [3, 8]], [[4, 0], [5, 2], [3, 4], [4, 6], [2, 8]], [[2, 0], [4, 3], [2, 5], [4, 8], [4, 8]]][c.frame];
  for (let i = 0; i < pts.length - 1; i++) c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i % 2 ? "C" : "L");
});

// ---------- Field props ----------
sprite("car_wreck", { w: 30, h: 18, outline: "k" }, (c) => {
  c.rect(1, 6, 28, 9, "e"); c.rect(5, 2, 18, 6, "E"); c.rect(7, 3, 6, 4, "D"); c.rect(15, 3, 6, 4, "D");
  c.hline(1, 6, 28, "f"); c.hline(5, 2, 18, "f");
  c.rect(0, 9, 3, 3, "R"); c.rect(27, 9, 3, 3, "o");
  c.rect(4, 14, 5, 3, "k"); c.rect(21, 14, 5, 3, "k"); c.rect(5, 15, 3, 1, "m"); c.rect(22, 15, 3, 1, "m");
  c.px(9, 9, "r"); c.px(10, 10, "R"); c.px(18, 8, "r"); c.px(24, 11, "R"); c.px(12, 12, "D"); c.px(16, 13, "D");
  c.px(8, 4, "n"); c.px(16, 4, "n");
});
sprite("barrel", { w: 6, h: 8, outline: "k" }, `
  RRRRRR
  oOooRR
  RRRRRR
  oOooRr
  oOooRr
  RRRRRR
  oOooRr
  rrrrrr`);
sprite("barrel_tipped", { w: 8, h: 6, outline: "k" }, `
  RoRooRoR
  RORoORoR
  RoRooRoR
  RORoORoR
  rrrrrrrr`);
sprite("sandbags", { w: 16, h: 7, outline: "k" }, `
  .tTTt.tTTt.tTTt.
  tTTTTttTTTTtTTTT
  QttttQQttttQtttQ
  .ttTTt.tTTtttTt.
  tTTTTTtTTTTTTTTt
  QQttQQQQttQQQttQ`);
sprite("tire", { w: 7, h: 4, outline: "k" }, `
  .mmmmm.
  mM...Mm
  mM...Mm
  .mmmmm.`);
sprite("lamp_post", { w: 7, h: 30 }, (c) => {
  c.vline(1, 2, 28, "m"); c.vline(2, 2, 28, "M"); c.hline(1, 1, 6, "m"); c.rect(4, 2, 3, 2, "M"); c.px(5, 3, "T");
});
sprite("fence_post", { w: 3, h: 12 }, (c) => { c.vline(1, 0, 12, "q"); c.vline(0, 0, 12, "Q"); c.px(2, 4, "n"); c.px(2, 8, "n"); });
sprite("debris_a", `
  .t.
  tQq`);
sprite("debris_b", `
  Mn
  mM`);
sprite("debris_c", `
  ..E.
  EfEe`);
sprite("crater", { w: 13, h: 5 }, (c) => { c.ellipse(6, 2, 6, 2, "q"); c.ellipse(6, 2, 4, 1, "k"); c.hline(3, 0, 7, "t"); });

// ---------- Distant city (painted once behind the road) ----------
scene("skyline", { w: 240, h: 60 }, (c) => {
  const rng = c.rng(7);
  // far layer
  for (let x = -4; x < 240;) {
    const w = 10 + Math.floor(rng() * 14), h = 14 + Math.floor(rng() * 22);
    c.rect(x, 60 - h, w, h, "f");
    if (rng() < 0.4) c.rect(x + 2, 60 - h - 3, 3, 3, "f");
    x += w + Math.floor(rng() * 3);
  }
  // near layer with broken tops and a few lit windows
  for (let x = -6; x < 240;) {
    const w = 14 + Math.floor(rng() * 18), h = 18 + Math.floor(rng() * 26);
    c.rect(x, 60 - h, w, h, "E");
    for (let i = 0; i < 3; i++) if (rng() < 0.6) c.rect(x + Math.floor(rng() * w), 60 - h - 1, 2 + Math.floor(rng() * 3), 2, "_");
    for (let wy = 60 - h + 3; wy < 56; wy += 4) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      const v = rng();
      if (v < 0.07) c.px(wx, wy, "T"); else if (v < 0.5) c.px(wx, wy, "e");
    }
    if (rng() < 0.25) c.vline(x + Math.floor(w / 2), 60 - h - 8, 8, "e");
    x += w + Math.floor(rng() * 6);
  }
  // smoke columns
  for (const sx of [52, 171]) for (let i = 0; i < 10; i++) c.circ(sx + Math.round(Math.sin(i * 0.9) * 3) + i, 36 - i * 4, 2 + Math.floor(i / 3), i < 4 ? "e" : "f");
});

sheet("tl003", ["merc_*", "zombie_*", "barricade*", "explosion", "fire", "muzzle", "hit", "death", "zap",
  "car_wreck", "barrel*", "sandbags", "tire", "lamp_post", "fence_post", "debris_*", "crater", "skyline"], { pad: 1 });
