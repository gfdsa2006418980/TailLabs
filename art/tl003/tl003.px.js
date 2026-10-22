// TL003《無盡防線》pixel art source. Build: npm run art:tl003
// 1 sprite pixel = 1 pixel of the 240-wide battlefield buffer (= 2 logical field units).

// ---------- Palette ----------
use([]);
pal({
  k: "#121619",                                   // outline
  d: "#1d2722", D: "#2b3a31", e: "#3b4d3f", E: "#516650", f: "#6d8160", F: "#93a27a", // field greens
  q: "#3f3a2c", Q: "#5f5640", t: "#8a7b5a", T: "#bfae84", w: "#eadfbd",               // khaki / wood / bone
  a: "#c08e6a", A: "#8f644c",                                                          // human skin
  g: "#2f3b2b", z: "#4f6140", Z: "#74895a", y: "#a3b47a",                              // zombie skin
  s: "#3b2533", S: "#5e3846", I: "#8a5160",                                            // boss flesh
  X: "#ffe36b", W: "#ff5a3c",                                                          // glowing eyes
  r: "#4d2324", R: "#87372f", o: "#c8613a", O: "#ee9d4f", Y: "#ffd884",                // blood / fire
  c: "#2b6470", C: "#56aebb", L: "#bff1ea",                                            // electric
  m: "#343c44", M: "#56626d", n: "#87949c", N: "#b9c3c4",                              // steel
  // role keys, recolored per sprite with swap
  H: "T", h: "t", U: "E", u: "e", B: "Q", b: "q", G: "q", P: "D", p: "d", x: "m",
  V: "t", v: "Q", J: "M", j: "m",
});
ramps("kdDeEfF", "kqQtTw", "kAa", "kgzZy", "krRoOY", "kcCL", "kmMnN", "ksSI");

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
const mercLight = [light([2, 8, 6, 6], 1, 0.5), shade([12, 15, 6, 12], 1, 0.5), shade([7, 25, 3, 6])];
sprite("merc_rifle", MERC, stamp("_merc_body", 1, 8, { swap: { H: "T", h: "t" } }), rifle, ...mercLight);
// Firing: a bright flash, a smaller one, then a curl of smoke (three 50 ms frames).
const fire3 = (big, small, smoke) => [frame(...big), frame(...small), frame(...smoke)];
anim("merc_rifle_fire", { base: "merc_rifle", fps: 20, loop: false }, ...fire3(
  [px(21, 0, "w"), px(20, 0, "Y"), px(22, 0, "Y"), px(21, 1, "O"), px(22, 1, "o"), px(23, 1, "O")],
  [px(21, 0, "Y"), px(21, 1, "O")], [px(21, 0, "n"), px(22, 0, "M")]));

// Flamethrower: twin fuel tanks, hose to a wide nozzle, pilot flame lit.
const flamer = (c) => {
  c.rect(7, 15, 2, 8, "o"); c.rect(10, 15, 2, 8, "o"); c.vline(7, 15, 8, "O"); c.vline(10, 15, 8, "O");
  c.hline(7, 17, 5, "m"); c.hline(7, 21, 5, "m"); c.px(8, 14, "M"); c.px(11, 14, "M");
  c.line(12, 22, 14, 19, "m");
  c.line(13, 17, 19, 4, "M", 2); c.line(14, 16, 19, 5, "n");
  c.rect(18, 1, 3, 3, "m"); c.px(19, 2, "M"); c.px(20, 0, "O"); c.px(19, 0, "Y");
  arm(c);
};
sprite("merc_flame", MERC, stamp("_merc_body", 1, 8, { swap: { H: "o", h: "R", B: "m", b: "m" } }), flamer, ...mercLight);
anim("merc_flame_fire", { base: "merc_flame", fps: 20, loop: false }, ...fire3(
  [(c) => { c.poly([17, 1, 20, -3, 24, -2, 22, 3], "O"); c.px(20, 0, "Y"); c.px(21, 0, "w"); c.px(22, 1, "o"); }],
  [px(20, 0, "Y"), px(21, 0, "O"), px(21, 1, "o")], [px(20, 0, "n"), px(21, 0, "M")]));

// Tesla rifle: glowing coil pack, cable to a heavy emitter with copper coils.
const tesla = (c) => {
  c.rect(7, 15, 5, 8, "m"); c.hline(7, 16, 5, "C"); c.hline(7, 19, 5, "c"); c.hline(7, 22, 5, "C"); c.rect(8, 14, 3, 1, "L");
  c.line(12, 22, 14, 19, "c");
  c.line(13, 17, 20, 3, "M", 2); c.line(14, 16, 20, 4, "n");
  c.px(16, 10, "o"); c.px(17, 9, "O"); c.px(18, 7, "o"); c.px(19, 6, "O");
  c.rect(19, 0, 3, 3, "c"); c.px(20, 1, "L");
  arm(c);
};
sprite("merc_tesla", MERC, stamp("_merc_body", 1, 8, { swap: { H: "C", h: "c", B: "m", b: "m" } }), tesla, ...mercLight);
anim("merc_tesla_fire", { base: "merc_tesla", fps: 20, loop: false }, ...fire3(
  [px(20, 0, "L"), px(21, 0, "w"), px(22, 1, "L"), px(19, 0, "C"), px(22, 2, "C"), px(21, 1, "L")],
  [px(21, 0, "L"), px(20, 1, "C")], [px(21, 0, "c")]));

sprite("merc_slot", { w: 14, h: 6 }, (c) => {
  for (let x = 0; x < 14; x += 2) { c.px(x, 0, "F"); c.px(x + 1, 5, "F"); }
  c.px(0, 2, "F"); c.px(0, 4, "F"); c.px(13, 1, "F"); c.px(13, 3, "F");
  c.rect(6, 1, 2, 4, "T"); c.rect(5, 2, 4, 2, "T");
});

// ---------- Zombies (front view, walking towards the camera) ----------
// One rig draws every zombie: proportions, colours and extras come from a spec, the pose from the
// animation phase. Light falls from the upper left; eyes are drawn again on their own "_eyes"
// anims (same size and timing) so the game can paint them into the glow layer at night.
const TAU = Math.PI * 2, rnd = Math.round;
/** Draws one zombie. `o.eyes` = only the glowing pixels, offset by the outline (+1) so frames line up. */
function zombieRig(c, s, pose, o = {}) {
  const ox = o.eyes ? 1 : 0, eyes = !!o.eyes, ground = s.h - 1;
  const R = (x, y, w, h, k) => { if (!eyes && w > 0 && h > 0) c.rect(x + ox, y + ox, w, h, k); };
  const P = (x, y, k) => { if (!eyes) c.px(x + ox, y + ox, k); };
  const L = (x0, y0, x1, y1, k, w) => { if (!eyes) c.line(x0 + ox, y0 + ox, x1 + ox, y1 + ox, k, w); };
  const G = (x, y, k) => c.px(x + ox, y + ox, k);            // glow pixels draw in both modes
  const [sk0, sk1, sk2, sk3] = s.skin, [sh0, sh1, sh2] = s.shirt, [pa0, pa1] = s.pants;
  const dy = pose.bob ?? 0, dx = pose.sway ?? 0, cx = s.cx;
  const legTop = ground - s.legH + 1 + (pose.crouch ?? 0), torsoTop = legTop - s.torsoH + dy, headTop = torsoTop - s.headH + s.neck;
  // legs: planted legs reach the ground, a lifted leg ends higher with its knee lit (closer to us)
  for (const [side, lift] of [[-1, pose.liftL ?? 0], [1, pose.liftR ?? 0]]) {
    const x = side < 0 ? cx - s.hip : cx + s.hip - s.legW, top = legTop + dy, bottom = ground - lift - 1;
    R(x, top, s.legW, bottom - top + 1, pa1); R(side < 0 ? x + s.legW - 1 : x, top, 1, bottom - top + 1, pa0);
    if (lift) P(x + (side < 0 ? 0 : s.legW - 1), bottom - 2, pa0);
    R(x - (side < 0 ? 1 : 0), bottom + 1, s.legW + 1, 1, s.foot);
  }
  // torso: shoulders, then a narrower waist; shirt shaded on the right, lit on the upper left
  for (let row = 0; row < s.torsoH; row++) {
    // rounded shoulders, then a taper down to the waist
    const k = (row - s.shoulderRows) / Math.max(1, s.torsoH - 1 - s.shoulderRows);
    const width = row === 0 ? s.shoulders - 4 : row === 1 ? s.shoulders - 2 : row <= s.shoulderRows ? s.shoulders : rnd(s.shoulders + (s.waist - s.shoulders) * k), x = cx - Math.floor(width / 2) + dx, y = torsoTop + row;
    R(x, y, width, 1, sh1); R(x + width - Math.max(2, Math.floor(width / 3)), y, Math.max(2, Math.floor(width / 3)), 1, sh0);
    if (row < 2) R(x + 1, y, Math.max(1, Math.floor(width / 3)), 1, sh2);
  }
  const hemY = torsoTop + s.torsoH - 1;
  for (const t of s.tears ?? []) P(cx - Math.floor(s.waist / 2) + dx + t, hemY, '_');
  for (const [x, y, k] of s.stains ?? []) P(cx + x + dx, torsoTop + y, k ?? 'r');
  // head: rounded block, lit top-left, shaded right; jaw slack; eyes glow
  const hx = cx - Math.floor(s.headW / 2) + dx + (pose.headDx ?? 0) + (s.tilt ?? 0), hy = headTop + (pose.headDy ?? 0);
  R(hx + 1, hy, s.headW - 2, 1, sk2); R(hx, hy + 1, s.headW, s.headH - 2, sk2); R(hx + 1, hy + s.headH - 1, s.headW - 2, 1, sk1);
  R(hx + s.headW - 1, hy + 1, 1, s.headH - 2, sk1); R(hx + 1, hy + 1, 2, 1, sk3); P(hx + 1, hy + 2, sk3);
  R(cx - 1 + dx, hy + s.headH, 2, Math.max(0, torsoTop - hy - s.headH), sk1);          // neck
  const ey = hy + s.eyeRow;
  G(hx + 1, ey, s.eye); if ((s.eyes ?? 2) > 1) G(hx + s.headW - 2, ey, s.eye); else P(hx + s.headW - 2, ey, 'k');
  const mouth = pose.mouth ?? 0, my = hy + s.headH - 2;
  R(hx + 2, my, s.headW - 4, 1, 'r'); if (mouth) { R(hx + 2, my + 1, s.headW - 4, mouth, 'k'); P(hx + 2, my, 'w'); P(hx + s.headW - 3, my, 'w'); }
  // arms: sleeve from the shoulder to the elbow, bare forearm to the hand
  const shoulderY = torsoTop + 1, half = Math.floor(s.shoulders / 2);
  pose.hands.forEach((h, i) => {
    const side = i === 0 ? -1 : 1, sx = cx + dx + (side < 0 ? -half : half - 1), sy = shoulderY;
    const hx2 = sx + side * h.out, hy2 = sy + h.down, ex = rnd((sx + hx2) / 2), ey2 = rnd((sy + hy2) / 2);
    L(sx, sy, ex, ey2, s.sleeve ?? sh1, s.armW); L(ex, ey2, hx2, hy2, sk1, s.armW);
    R(hx2 - (side < 0 ? s.fist - 1 : 0), hy2, s.fist, s.fist, sk2); P(hx2, hy2 + s.fist, sk1);
  });
  s.extras?.(c, { ox, eyes, R, P, L, G, cx: cx + dx, hx, hy, torsoTop, shoulderY, half, legTop: legTop + dy, pose });
}
/** Eight-frame shamble: two steps per loop, body highest when a leg passes, weight swaying over the planted foot. */
const walkPose = (s) => (p) => {
  const a = Math.sin(p * TAU), b = Math.cos(p * TAU), lift = s.lift ?? 2;
  return { bob: Math.abs(a) > 0.7 ? 0 : 1, sway: rnd(-a * 0.8), liftL: a > 0.3 ? (a > 0.8 ? lift : 1) : 0, liftR: -a > 0.3 ? (-a > 0.8 ? lift : 1) : 0,
    headDx: rnd(a * 0.6), hands: s.walkHands(a, b), mouth: s.mouthWalk ? (b > 0.5 ? 1 : 0) : 0 };
};
/** Four frames clawing and chewing at the barricade. */
const attackPose = (s) => (p) => {
  const f = Math.floor(p * 4) % 4, up = [-1, -2, 1, 0][f], low = s.torsoH - 2;
  return { bob: f === 2 ? 1 : 0, sway: 0, headDy: f === 2 ? 1 : 0, mouth: f === 1 || f === 2 ? 1 : 0,
    hands: [{ out: f === 2 ? -2 : 0, down: f === 2 ? low - 2 : up - s.headH + 1 }, { out: f === 2 ? -2 : 0, down: f === 2 ? low - 3 : up - s.headH + 2 }] };
};
/** Six frames, played once: recoil, knees buckle, kneel, slump into a heap, blood spreads. */
function deathFrame(c, s, f) {
  if (f < 3) {
    const pose = [
      { bob: 0, headDy: -1, headDx: 1, mouth: 1, hands: [{ out: 2, down: -3 }, { out: 2, down: -2 }] },
      { crouch: 3, bob: 0, headDx: 1, mouth: 1, hands: [{ out: 3, down: 2 }, { out: 2, down: 3 }] },
      { crouch: Math.floor(s.legH * 0.8), bob: 0, headDy: 1, hands: [{ out: 1, down: s.torsoH - 2 }, { out: 1, down: s.torsoH - 1 }] },
    ][f];
    zombieRig(c, s, pose);
    return;
  }
  // The heap: shoulders and the back of the head towards us, arms splayed, blood pooling under it.
  const ground = s.h - 1, cx = s.cx, w = s.shoulders, pool = [0, 3, 5][f - 3];
  if (pool) c.ellipse(cx, ground - 1, Math.floor(w / 2) + pool, 1 + Math.floor(pool / 2), 'r'), c.ellipse(cx, ground - 1, Math.floor(w / 2) + pool - 2, Math.floor(pool / 3), 'R');
  c.ellipse(cx, ground - 2, Math.floor(w / 2), 2, s.shirt[1]); c.hline(cx - Math.floor(w / 2) + 1, ground - 4, w - 2, s.shirt[2]);
  c.rect(cx - Math.floor(s.headW / 2), ground - 3, s.headW, 2, s.skin[1]); c.hline(cx - Math.floor(s.headW / 2) + 1, ground - 4, s.headW - 2, s.skin[2]);
  c.line(cx - Math.floor(w / 2), ground - 2, cx - Math.floor(w / 2) - 3, ground, s.skin[1], 2); c.line(cx + Math.floor(w / 2), ground - 2, cx + Math.floor(w / 2) + 3, ground - 1, s.skin[1], 2);
}
/** Registers walk, attack, death and the matching glow-only eye anims for one zombie kind. */
function zombie(name, s) {
  const size = { w: s.w, h: s.h }, eyeSize = { w: s.w + 2, h: s.h + 2 };
  const walk = walkPose(s), attack = attackPose(s);
  anim(name, { ...size, frames: 8, fps: s.fps, outline: 'k' }, (c) => zombieRig(c, s, walk(c.phase)));
  anim(name + '_eyes', { ...eyeSize, frames: 8, fps: s.fps }, (c) => zombieRig(c, s, walk(c.phase), { eyes: true }));
  anim(name + '_attack', { ...size, frames: 4, fps: 7, outline: 'k' }, (c) => zombieRig(c, s, attack(c.phase)));
  anim(name + '_attack_eyes', { ...eyeSize, frames: 4, fps: 7 }, (c) => zombieRig(c, s, attack(c.phase), { eyes: true }));
  const wide = { ...s, w: s.w + 6, cx: s.cx + 3 };
  anim(name + '_death', { w: wide.w, h: s.h, frames: 6, fps: 12, loop: false, outline: 'k' }, (c) => deathFrame(c, wide, c.frame));
}

const SKIN = ['g', 'z', 'Z', 'y'];
// Walker: the classic. One eye glows, the other is a dead socket; one arm reaches, one drags.
const WALKER = {
  w: 16, h: 21, cx: 8, fps: 8, headW: 6, headH: 6, eyeRow: 2, neck: 1, tilt: -1, eyes: 1, eye: 'X',
  shoulders: 11, waist: 9, shoulderRows: 2, torsoH: 7, hip: 5, legW: 3, legH: 8, armW: 2, fist: 2,
  skin: SKIN, shirt: ['q', 'Q', 't'], pants: ['m', 'M'], foot: 'g',
  tears: [1, 4, 7], stains: [[-2, 3, 'r'], [1, 5, 'R'], [3, 2, 'r']], mouthWalk: true,
  walkHands: (a, b) => [{ out: -1, down: -1 + rnd(b) }, { out: 1, down: 6 + rnd(a * 0.6) }],
};
zombie('zombie_walker', WALKER);
// Runner: lean, red tracksuit, both arms thrown forward, high knees.
zombie('zombie_runner', { ...WALKER, fps: 13, lift: 3, eyes: 2, shoulders: 10, waist: 8, shirt: ['r', 'R', 'o'], pants: ['q', 'Q'], tears: [2, 6], stains: [[0, 3, 'k']],
  walkHands: (a, b) => [{ out: -2, down: -2 + rnd(a) }, { out: -2, down: -2 - rnd(a) }] });
// Armored: riot helmet and a stab vest; slower, heavier.
zombie('zombie_armored', { ...WALKER, fps: 6, eyes: 2, shirt: ['m', 'M', 'n'], pants: ['m', 'M'],
  extras: (c, k) => {
    k.R(k.hx - 1, k.hy - 1, WALKER.headW + 2, 2, 'M'); k.R(k.hx, k.hy - 1, WALKER.headW, 1, 'n'); k.R(k.hx - 1, k.hy + 1, WALKER.headW + 2, 1, 'm');
    k.P(k.hx + 1, k.hy - 1, 'N'); k.R(k.cx - 3, k.torsoTop + 2, 6, 3, 'm'); k.R(k.cx - 2, k.torsoTop + 2, 2, 1, 'n'); k.P(k.cx + 1, k.torsoTop + 3, 'Y');
  } });
// Brute: bloated, shirtless, fists the size of its head, dragging its knuckles.
zombie('zombie_brute', {
  w: 22, h: 22, cx: 11, fps: 5, headW: 6, headH: 5, eyeRow: 2, neck: 3, tilt: 0, eyes: 2, eye: 'X',
  shoulders: 18, waist: 14, shoulderRows: 3, torsoH: 9, hip: 7, legW: 4, legH: 7, armW: 3, fist: 3, lift: 1,
  skin: SKIN, shirt: ['z', 'Z', 'y'], sleeve: 'z', pants: ['q', 'Q'], foot: 'g', tears: [], stains: [[-3, 5, 'r'], [2, 4, 'R'], [-1, 7, 'r']],
  walkHands: (a) => [{ out: 2, down: 9 + rnd(a) }, { out: 2, down: 9 - rnd(a) }],
  extras: (c, k) => { if (k.eyes) return; k.R(k.cx - 3, k.torsoTop + 4, 6, 3, 'y'); k.R(k.cx - 2, k.torsoTop + 7, 4, 1, 'Z'); k.P(k.cx, k.torsoTop + 5, 'z'); k.R(k.cx - 7, k.legTop - 1, 14, 1, 'q'); k.P(k.cx - 1, k.legTop - 1, 'n'); k.R(k.cx - 6, k.torsoTop + 2, 3, 1, 'y'); k.R(k.cx + 2, k.torsoTop + 2, 3, 1, 'Z'); },
});
// Elite: flayed and tall, ribs showing, bone spurs on the shoulders, long claws.
zombie('zombie_elite', {
  w: 24, h: 24, cx: 12, fps: 6, headW: 6, headH: 7, eyeRow: 3, neck: 1, tilt: 0, eyes: 2, eye: 'W',
  shoulders: 16, waist: 10, shoulderRows: 3, torsoH: 9, hip: 6, legW: 3, legH: 9, armW: 2, fist: 2,
  skin: ['r', 'R', 'o', 'O'], shirt: ['r', 'R', 'o'], pants: ['k', 'q'], foot: 'r', tears: [0, 9],
  walkHands: (a, b) => [{ out: 2, down: 3 + rnd(b) }, { out: -1, down: -1 + rnd(a) }],
  extras: (c, k) => {
    if (k.eyes) return;
    for (let i = 0; i < 3; i++) k.R(k.cx - 4, k.torsoTop + 3 + i * 2, 8, 1, 'w');
    k.R(k.cx, k.torsoTop + 3, 1, 5, 'R');
    for (const s of [-1, 1]) { const x = k.cx + s * (k.half - 1); k.L(x, k.shoulderY, x + s * 2, k.shoulderY - 4, 'w'); k.P(x + s * 2, k.shoulderY - 5, 'T'); }
    k.R(k.hx, k.hy, 6, 2, 'w'); k.R(k.hx + 1, k.hy + 2, 1, 1, 'k'); k.R(k.hx + 4, k.hy + 2, 1, 1, 'k');
  },
});
// Boss: a hunched mountain of diseased flesh; spine spikes, a glowing maw, one giant clawed arm.
const BOSS = {
  w: 34, h: 36, cx: 17, fps: 5, headW: 10, headH: 8, eyeRow: 4, neck: 2, tilt: 0, eyes: 2, eye: 'W',
  shoulders: 28, waist: 20, shoulderRows: 5, torsoH: 15, hip: 10, legW: 6, legH: 9, armW: 4, fist: 4, lift: 1,
  skin: ['s', 'S', 'I', 'I'], shirt: ['s', 'S', 'I'], pants: ['k', 's'], foot: 'k', tears: [],
  stains: [[-8, 6, 'r'], [6, 9, 'R'], [-3, 11, 'r']], mouthWalk: true,
  walkHands: (a, b) => [{ out: 2, down: 11 + rnd(a) }, { out: 1, down: 5 + rnd(b) }],
  extras: (c, k) => {
    // pustules glow along with the eyes
    for (const [x, y] of [[-7, 4], [5, 6], [-2, 9], [8, 11]]) k.G(k.cx + x, k.torsoTop + y, 'X');
    const maw = (k.pose.mouth ?? 0) > 0;
    if (maw) for (let x = 3; x <= 6; x++) k.G(k.hx + x, k.hy + 7, 'W');
    if (k.eyes) return;
    // bone skull plate over the brow, horn stubs
    k.R(k.hx + 1, k.hy, 8, 2, 'w'); k.R(k.hx + 2, k.hy + 2, 6, 1, 'T'); k.P(k.hx, k.hy + 1, 'T'); k.P(k.hx + 9, k.hy + 1, 'T');
    k.L(k.hx + 1, k.hy, k.hx - 1, k.hy - 3, 'w'); k.L(k.hx + 8, k.hy, k.hx + 10, k.hy - 3, 'w');
    for (let x = 2; x <= 7; x += 2) k.P(k.hx + x, k.hy + 6, 'w');
    for (const [dx, lean] of [[-13, -2], [-9, -1], [8, 1], [12, 2]]) { const x = k.cx + dx; k.L(x, k.torsoTop + 2, x + lean, k.torsoTop - 4, 'w'); k.P(x + lean, k.torsoTop - 5, 'T'); }
    k.R(k.cx - 6, k.torsoTop + 7, 12, 1, 'S'); k.R(k.cx - 5, k.torsoTop + 10, 10, 1, 'S');
    const [, right] = k.pose.hands; const hx = k.cx + k.half - 1 + right.out, hy = k.shoulderY + right.down;
    for (let i = 0; i < 3; i++) k.L(hx + i, hy + 4, hx + i + 1, hy + 6, 'w');
  },
};
zombie('zombie_boss', BOSS);
// The boss's entrance: rears up, arms wide, maw open.
const roarPose = (f) => { const up = [0, -1, -2, -2, -2, -1][f]; return { bob: up, headDy: Math.round(up / 2), mouth: f >= 2 ? 2 : 1, hands: [{ out: 4, down: -2 + up }, { out: 4, down: -3 + up }] }; };
anim('zombie_boss_roar', { w: BOSS.w, h: BOSS.h, frames: 6, fps: 8, loop: false, outline: 'k' }, (c) => zombieRig(c, BOSS, roarPose(c.frame)));
anim('zombie_boss_roar_eyes', { w: BOSS.w + 2, h: BOSS.h + 2, frames: 6, fps: 8, loop: false }, (c) => zombieRig(c, BOSS, roarPose(c.frame), { eyes: true }));

// ---------- Barricade ----------
const beam = (c, x0, y0, x1, y1) => { c.line(x0, y0, x1, y1, "t"); c.line(x0 + 1, y0, x1 + 1, y1, "Q"); };
sprite("barricade", { w: 18, h: 13, outline: "k" }, (c) => {
  c.rect(0, 7, 18, 3, "q"); c.hline(0, 7, 18, "Q");
  beam(c, 1, 0, 14, 12); beam(c, 14, 0, 1, 12);
  c.px(2, 0, "T"); c.px(15, 0, "T");
  for (const x of [0, 4, 8, 12, 16]) c.px(x, 5, "n");
  for (const x of [2, 6, 10, 14]) c.px(x, 4, "N");
}, bump("bevel", { w: 1, depth: 1.5 }));
sprite("barricade_broken", { base: "barricade", swap: { t: "Q", T: "t" } },
  rect(5, 2, 3, 3, "_"), px(6, 5, "k"), px(11, 8, "R"), px(12, 9, "r"));

// ---------- Effects ----------
// Explosion (drawn as light): white flash, fireball with a dithered rim, flying sparks, embers.
anim("explosion", { w: 29, h: 29, frames: 8, fps: 16, loop: false }, (c) => {
  const f = c.frame, cx = 14, cy = 14, r = [3, 7, 10, 12, 13, 13, 12, 10][f];
  if (f === 0) { c.circ(cx, cy, 4, "w"); c.circ(cx, cy, 2, "Y"); return; }
  if (f <= 4) {
    c.circ(cx, cy, r, "R");
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = Math.hypot(x, y); if (d <= r && d > r - 2.5 && (x + y) % 2 === 0) c.px(cx + x, cy + y, "o"); }
    c.circ(cx, cy - 1, r - 2, "o"); c.circ(cx - 1, cy - 2, Math.max(1, r - 4), "O"); c.circ(cx - 2, cy - 3, Math.max(1, r - 7), f < 3 ? "w" : "Y");
  } else {
    c.ring(cx, cy, r, "r");
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + f; c.px(cx + Math.round(Math.cos(a) * (r - 2)), cy + Math.round(Math.sin(a) * (r - 2)), f < 7 ? "O" : "o"); }
  }
  // sparks thrown outward
  for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.3, d = 4 + f * 1.6; c.px(cx + Math.round(Math.cos(a) * d), cy + Math.round(Math.sin(a) * d * 0.8) - (f > 4 ? f - 4 : 0), f < 5 ? "Y" : "O"); }
});
// Smoke (lit by the scene): grey puffs that swell, rise and thin out.
anim("smoke", { w: 27, h: 27, frames: 8, fps: 10, loop: false }, (c) => {
  const f = c.frame, rise = f * 2;
  for (const [x, y, r0] of [[9, 17, 4], [17, 16, 4], [13, 12, 5], [8, 11, 3], [19, 10, 3]]) {
    const r = Math.min(6, r0 + Math.floor(f / 2)), yy = y - rise;
    if (yy + r < 0) continue;
    c.circ(x, yy, r, "m"); c.circ(x - 1, yy - 1, Math.max(1, r - 2), "M"); c.px(x - 2, yy - 2, "n");
  }
  if (f >= 4) c.dither(0, 0, 27, 27, ".", "_", (f - 3) * 0.18);
});
// Blood spray on flesh hits (lit): a burst of droplets.
anim("blood", { w: 9, h: 9, frames: 4, fps: 18, loop: false }, (c) => {
  const f = c.frame;
  for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.5, d = 1 + f * 1.3; c.px(4 + Math.round(Math.cos(a) * d), 4 + Math.round(Math.sin(a) * d) + f, i % 2 ? "R" : "r"); }
  if (f === 0) c.rect(3, 3, 3, 3, "R");
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
sprite("icon_star", { w: 9, h: 9, outline: "k" }, (c) => { c.poly([4, 0, 5, 3, 8, 3, 6, 5, 7, 8, 4, 6, 1, 8, 2, 5, 0, 3, 3, 3], "O"); c.poly([4, 1, 5, 4, 4, 5, 3, 4], "Y"); c.px(4, 2, "w"); });
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
}, light([1, 2, 12, 6], 1, 0.5), shade([17, 7, 13, 9], 1, 0.5), bump("bevel", { w: 2 }));
sprite("barrel", { w: 6, h: 8, outline: "k" }, `
  RRRRRR
  oOooRR
  RRRRRR
  oOooRr
  oOooRr
  RRRRRR
  oOooRr
  rrrrrr`, bump("dome", { depth: 1.5 }));
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
  QQttQQQQttQQQttQ`, bump("dome", { on: "tT", depth: 1.4 }));
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

sheet("tl003", ["icon_*", "merc_*", "zombie_*", "barricade*", "explosion", "smoke", "blood", "fire", "muzzle", "hit", "death", "zap",
  "car_wreck", "barrel*", "sandbags", "tire", "lamp_post", "fence_post", "debris_*", "crater", "skyline"], { pad: 1 });
