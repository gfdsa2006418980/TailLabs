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

// ---------- Mercenaries (seen from behind, weapon shouldered, facing up the road) ----------
// Body: broad shoulders, small pack, belt pouches, wide stance. Role colors come in through swap.
sprite("_merc_body", `
  ......hHHh......
  .....hHHTHh.....
  ....hHHHHHHh....
  ....hHHHHHHh....
  ....qqqqqqqq....
  .....aAAAAa.....
  ...uUUUUUUUUu...
  ..uUUUBBBBUUUu..
  ..uUUBBbbBBUUu..
  ..uUUBBBBBBUUu..
  .uUuUBBbbBBUu...
  .uUuUBBBBBBUu...
  .aUuUUBBBBUUu...
  ...uUUUUUUUu....
  ...GqGGGGGqG....
  ...PPPPPPPPP....
  ...PPPPpPPPP....
  ...PPPp.pPPP....
  ..PPPPp.pPPPP...
  ..PPPp...pPPP...
  ..PPPp...pPPP...
  ..xxxx...xxxx...
  ..xxxx...xxxx...`);

const MERC = { w: 24, h: 31, outline: "k" };
// Right arm raised from the shoulder to the grip; the weapon sits in the shoulder pocket.
const arm = (c) => { c.line(14, 17, 15, 14, "U", 2); c.px(15, 18, "u"); c.rect(15, 12, 2, 2, "a"); };
// Assault rifle: stock in the right shoulder, barrel raised towards the road.
const rifle = (c) => {
  c.line(13, 17, 20, 1, "m", 2); c.line(14, 16, 20, 2, "M");
  c.rect(15, 9, 3, 3, "m"); c.px(16, 10, "n"); c.line(17, 11, 19, 14, "m"); c.px(19, 14, "M");
  c.line(12, 19, 13, 16, "Q", 2); c.px(20, 0, "n");
  arm(c);
};
sprite("merc_rifle", MERC, stamp("_merc_body", 1, 8, { swap: { H: "T", h: "t" } }), rifle);
sprite("merc_rifle_fire", { base: "merc_rifle" }, px(21, 0, "Y"), px(22, 0, "O"), px(21, 1, "O"), px(20, 0, "w"), px(22, 1, "o"));

// Flamethrower: twin fuel tanks, hose to a wide nozzle, pilot flame lit.
const flamer = (c) => {
  c.rect(7, 15, 2, 8, "o"); c.rect(10, 15, 2, 8, "o"); c.vline(7, 15, 8, "O"); c.vline(10, 15, 8, "O");
  c.hline(7, 17, 5, "m"); c.hline(7, 21, 5, "m"); c.px(8, 14, "M"); c.px(11, 14, "M");
  c.line(12, 22, 14, 19, "m");
  c.line(13, 17, 19, 4, "M", 2); c.line(14, 16, 19, 5, "n");
  c.rect(18, 1, 3, 3, "m"); c.px(19, 2, "M"); c.px(20, 0, "O"); c.px(19, 0, "Y");
  arm(c);
};
sprite("merc_flame", MERC, stamp("_merc_body", 1, 8, { swap: { H: "o", h: "R", B: "m", b: "m" } }), flamer);
sprite("merc_flame_fire", { base: "merc_flame" }, (c) => { c.poly([17, 1, 20, -3, 24, -2, 22, 3], "O"); c.px(20, -1, "Y"); c.px(21, 0, "Y"); c.px(22, -1, "o"); });

// Tesla rifle: glowing coil pack, cable to a heavy emitter with copper coils.
const tesla = (c) => {
  c.rect(7, 15, 5, 8, "m"); c.hline(7, 16, 5, "C"); c.hline(7, 19, 5, "c"); c.hline(7, 22, 5, "C"); c.rect(8, 14, 3, 1, "L");
  c.line(12, 22, 14, 19, "c");
  c.line(13, 17, 20, 3, "M", 2); c.line(14, 16, 20, 4, "n");
  c.px(16, 10, "o"); c.px(17, 9, "O"); c.px(18, 7, "o"); c.px(19, 6, "O");
  c.rect(19, 0, 3, 3, "c"); c.px(20, 1, "L");
  arm(c);
};
sprite("merc_tesla", MERC, stamp("_merc_body", 1, 8, { swap: { H: "C", h: "c", B: "m", b: "m" } }), tesla);
sprite("merc_tesla_fire", { base: "merc_tesla" }, px(20, 0, "L"), px(21, 0, "C"), px(22, 1, "L"), px(19, 0, "C"), px(22, 2, "C"), px(21, 1, "w"));

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

// ---------- UI icons (14×14 + outline = 16×16; shown at 2–3× in the HUD) ----------
const IC = { w: 14, h: 14, outline: "k" };
// Cards
sprite("icon_card_kinetic", IC, (c) => { c.rect(5, 1, 4, 2, "T"); c.rect(4, 3, 6, 4, "T"); c.vline(5, 2, 5, "w"); c.rect(4, 7, 6, 1, "q"); c.rect(4, 8, 6, 5, "O"); c.vline(5, 8, 5, "Y"); c.vline(9, 8, 5, "o"); c.rect(4, 13, 6, 1, "q"); });
sprite("icon_card_burn", IC, (c) => { c.poly([1, 13, 4, 4, 6, 8, 8, 2, 11, 9, 13, 13], "R"); c.poly([3, 13, 5, 7, 7, 10, 9, 5, 11, 13], "o"); c.poly([5, 13, 7, 9, 9, 13], "Y"); c.rect(9, 1, 3, 4, "T"); c.px(10, 0, "T"); c.vline(10, 1, 3, "w"); });
sprite("icon_card_bio", IC, (c) => { c.poly([7, 0, 12, 8, 11, 12, 7, 14, 3, 12, 2, 8], "Z"); c.poly([7, 2, 10, 8, 7, 12, 4, 8], "y"); c.px(5, 7, "w"); c.px(6, 6, "w"); c.circ(9, 10, 1, "z"); });
sprite("icon_card_shock", IC, (c) => { c.poly([8, 0, 2, 8, 6, 8, 5, 14, 12, 5, 8, 5, 10, 0], "C"); c.poly([8, 1, 4, 7, 7, 7, 6, 11, 10, 6, 7, 6], "L"); });
sprite("icon_card_fire", IC, (c) => { c.rect(2, 3, 10, 11, "R"); c.rect(3, 4, 8, 9, "o"); c.line(3, 5, 10, 12, "R"); c.line(10, 5, 3, 12, "R"); c.rect(3, 0, 5, 2, "m"); c.rect(9, 1, 2, 2, "M"); c.vline(4, 4, 9, "O"); });
sprite("icon_card_speed", IC, (c) => { for (const x of [1, 6]) { c.line(x, 2, x + 5, 7, "T", 2); c.line(x + 5, 7, x, 12, "T", 2); } c.line(1, 2, 6, 7, "w"); });
sprite("icon_card_active", IC, (c) => { for (const x of [2, 6, 10]) { c.rect(x, 5, 3, 9, "R"); c.vline(x, 5, 9, "o"); } c.hline(2, 9, 11, "q"); c.line(7, 5, 9, 1, "t"); c.px(10, 0, "Y"); c.px(11, 1, "O"); c.px(9, 0, "O"); });
sprite("icon_card_haste", IC, (c) => { c.circ(7, 8, 6, "M"); c.circ(7, 8, 5, "N"); c.rect(6, 0, 3, 2, "M"); c.line(7, 8, 7, 4, "k"); c.line(7, 8, 10, 9, "k"); c.poly([10, 1, 7, 6, 9, 6, 8, 10, 12, 4, 10, 4, 12, 1], "C"); });
sprite("icon_card_radius", IC, (c) => { c.ring(7, 7, 6, "R"); c.ring(7, 7, 4, "o"); c.circ(7, 7, 2, "Y"); c.px(7, 0, "O"); c.px(7, 14, "O"); c.px(0, 7, "O"); c.px(14, 7, "O"); });
sprite("icon_card_income", IC, (c) => { for (const [y, col] of [[10, "o"], [7, "O"], [4, "Y"]]) { c.ellipse(7, y, 6, 2, col); c.hline(2, y + 2, 11, "R"); } c.px(5, 3, "w"); c.px(6, 3, "w"); c.text(6, 2, "", "k"); });
sprite("icon_card_wall", IC, (c) => { c.rect(0, 8, 14, 3, "Q"); c.hline(0, 8, 14, "t"); c.line(1, 1, 12, 13, "t", 2); c.line(12, 1, 1, 13, "t", 2); c.px(1, 1, "T"); c.px(12, 1, "T"); c.rect(9, 0, 5, 5, "y"); c.rect(11, 0, 1, 5, "k"); c.rect(9, 2, 5, 1, "k"); });
sprite("icon_card_repair", IC, (c) => { c.line(3, 11, 9, 5, "n", 2); c.circ(10, 4, 3, "N"); c.rect(10, 1, 3, 3, "_"); c.px(11, 4, "_"); c.circ(3, 11, 2, "M"); c.px(3, 11, "k"); });
// Skills
sprite("icon_skill_rifle", IC, (c) => { c.circ(7, 8, 5, "f"); c.circ(6, 7, 3, "F"); c.hline(2, 8, 11, "e"); c.vline(7, 3, 11, "e"); c.rect(6, 1, 3, 2, "M"); c.line(9, 2, 12, 0, "n"); c.px(5, 6, "w"); });
sprite("icon_skill_flame", IC, (c) => { c.rect(4, 6, 6, 8, "e"); c.rect(5, 7, 4, 6, "f"); c.rect(5, 4, 4, 2, "T"); c.rect(6, 3, 2, 1, "w"); c.poly([5, 3, 7, -1, 9, 3], "O"); c.px(7, 1, "Y"); c.rect(5, 9, 4, 2, "R"); });
sprite("icon_skill_tesla", IC, (c) => { c.line(0, 13, 13, 0, "c", 3); c.line(0, 13, 13, 0, "C", 2); c.line(0, 13, 13, 0, "L"); c.px(12, 3, "L"); c.px(3, 12, "L"); c.px(10, 2, "C"); });
// Mercenary portraits (helmet + face, three-quarter)
const bust = (H, h, extra) => (c) => { c.rect(2, 9, 10, 5, "E"); c.hline(2, 9, 10, "f"); c.rect(4, 4, 6, 6, "a"); c.vline(9, 5, 5, "A"); c.px(5, 7, "k"); c.px(8, 7, "k"); c.rect(3, 1, 8, 4, H); c.hline(2, 4, 10, h); c.hline(4, 1, 5, "w"); extra(c); };
sprite("icon_merc_rifle", IC, bust("T", "t", (c) => { c.hline(4, 5, 6, "m"); c.px(5, 5, "C"); c.px(8, 5, "C"); }));
sprite("icon_merc_flame", IC, bust("o", "R", (c) => { c.rect(4, 7, 6, 3, "m"); c.px(6, 8, "M"); c.px(7, 8, "M"); c.px(10, 9, "m"); c.px(11, 10, "m"); }));
sprite("icon_merc_tesla", IC, bust("C", "c", (c) => { c.vline(10, 0, 2, "M"); c.px(10, 0, "L"); c.hline(4, 6, 6, "L"); }));
// Elements (small)
const EL = { w: 9, h: 9, outline: "k" };
sprite("icon_el_kinetic", EL, (c) => { c.rect(3, 0, 3, 3, "T"); c.rect(2, 3, 5, 5, "O"); c.vline(3, 3, 5, "Y"); });
sprite("icon_el_fire", EL, (c) => { c.poly([0, 9, 4, 0, 9, 9], "o"); c.poly([2, 9, 4, 4, 7, 9], "Y"); });
sprite("icon_el_bio", EL, (c) => { c.poly([4, 0, 8, 5, 4, 9, 0, 5], "Z"); c.px(3, 4, "w"); });
sprite("icon_el_electric", EL, (c) => { c.poly([5, 0, 1, 5, 4, 5, 3, 9, 8, 3, 5, 3, 6, 0], "L"); });
// HUD actions
sprite("icon_repair", IC, (c) => { c.rect(5, 1, 4, 12, "R"); c.rect(1, 5, 12, 4, "R"); c.rect(6, 2, 2, 10, "w"); c.rect(2, 6, 10, 2, "w"); });
sprite("icon_fortify", IC, (c) => { c.poly([7, 0, 13, 2, 12, 9, 7, 14, 2, 9, 1, 2], "t"); c.poly([7, 2, 11, 3, 10, 8, 7, 12, 4, 8, 3, 3], "T"); c.rect(6, 4, 2, 6, "Q"); c.rect(4, 6, 6, 2, "Q"); });
sprite("icon_money", { w: 9, h: 9, outline: "k" }, (c) => { c.circ(4, 4, 4, "O"); c.circ(4, 4, 3, "Y"); c.vline(4, 2, 5, "o"); });
sprite("icon_wave", IC, (c) => { c.circ(7, 6, 6, "w"); c.rect(4, 10, 7, 4, "w"); c.rect(3, 5, 3, 3, "k"); c.rect(8, 5, 3, 3, "k"); c.px(4, 6, "R"); c.px(9, 6, "R"); c.rect(5, 12, 1, 2, "k"); c.rect(7, 12, 1, 2, "k"); c.rect(9, 12, 1, 2, "k"); });
sprite("icon_time", IC, (c) => { c.hline(2, 0, 10, "Q"); c.hline(2, 13, 10, "Q"); c.poly([3, 1, 11, 1, 7, 7], "N"); c.poly([3, 13, 11, 13, 7, 7], "N"); c.poly([5, 2, 9, 2, 7, 5], "T"); c.poly([4, 12, 10, 12, 7, 9], "T"); });

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

sheet("tl003", ["icon_*", "merc_*", "zombie_*", "barricade*", "explosion", "fire", "muzzle", "hit", "death", "zap",
  "car_wreck", "barrel*", "sandbags", "tire", "lamp_post", "fence_post", "debris_*", "crater", "skyline"], { pad: 1 });
