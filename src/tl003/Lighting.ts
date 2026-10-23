/**
 * Night-battle compositor. The battlefield is painted at buffer resolution into four layers:
 *   albedo   — the lit world (true colours; lighting makes it night)
 *   normals  — per-pixel surface direction (RGB = n * 0.5 + 0.5, green up); alpha 0 = unlit (sky)
 *   emissive — fire, flashes, tracers: added on top and bloomed
 *   overlay  — world-anchored UI (HP bars, numbers, coins, reticle): drawn last, never lit
 * Pass 1 lights them at buffer resolution (cheap: ~125k pixels). Pass 2 applies the camera and
 * upsamples with sharp-bilinear filtering so pixels stay square at any screen size.
 * Without WebGL2 the same layers are combined with Canvas2D blend modes (no normal relief).
 *
 * With WebGL2 the zombies skip Canvas2D (2026-10-24, performance): hundreds of drawImage calls a frame were the cost.
 * They arrive as a SpriteBatch and are drawn in one instanced pass into their own albedo/normal/emissive targets;
 * the albedo and normal layers are split into "under" (the road, decals, shadows) and "over" (barricade, squad,
 * effects) canvases, and pass 1 stacks under → zombies → over. Zombie emissive goes under the emissive canvas.
 */
import type { CameraView } from './Camera.ts';

export interface Light { x: number; y: number; z: number; radius: number; color: readonly [number, number, number]; intensity: number }
export interface Layers {
  albedo: HTMLCanvasElement; normals: HTMLCanvasElement; emissive: HTMLCanvasElement; overlay: HTMLCanvasElement;
  /** WebGL only: what is painted after the batched sprites (left blank on the Canvas2D path). */
  overAlbedo: HTMLCanvasElement; overNormals: HTMLCanvasElement;
}
/** Batched sprite kinds: which targets a sheet frame lands in. */
export const SPRITE = { lit: 0, albedo: 1, glow: 2, flash: 3 } as const;
/** Floats per batched sprite: left, top, width, height (buffer px), frame x, y, w, h (sheet px), kind. */
export const SPRITE_FLOATS = 9;
export interface SpriteBatch { data: Float32Array; count: number }
export interface Atmosphere {
  ambient: readonly [number, number, number];
  fog: readonly [number, number, number];
  /** Buffer rows of the horizon and the barricade: fog fades between them. */
  horizon: number; wall: number;
}

export const MAX_LIGHTS = 48;

const VERTEX = `#version 300 es
in vec2 corner; out vec2 uv;
void main() { uv = corner * 0.5 + 0.5; gl_Position = vec4(corner, 0.0, 1.0); }`;

const LIGHT_PASS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D albedo, normals, emissive, overlay, overAlbedo, overNormals, spriteAlbedo, spriteNormals, spriteEmissive;
uniform vec2 size;
uniform vec4 lightA[${MAX_LIGHTS}]; // x, y, z, radius (buffer px, y down)
uniform vec4 lightB[${MAX_LIGHTS}]; // r, g, b, intensity
uniform int lightCount;
uniform vec3 ambient, fog;
uniform float horizon, wall;
const float BAYER[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
// Canvas layers are straight alpha, sprite targets premultiplied: "over" in premultiplied terms.
vec4 premul(vec4 c) { return vec4(c.rgb * c.a, c.a); }
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
// Emissive, premultiplied: the canvas layer over the zombies' eyes and hit flashes.
vec4 glow(vec2 st) { return over(premul(texture(emissive, st)), texture(spriteEmissive, st)); }
void main() {
  // Framebuffer row 0 holds the top image row, so pass 2 can sample with y-down coordinates.
  vec2 st = uv;
  vec2 px = floor(st * size) + 0.5;
  vec4 a = over(premul(texture(overAlbedo, st)), over(texture(spriteAlbedo, st), premul(texture(albedo, st))));
  vec4 nm = over(premul(texture(overNormals, st)), over(texture(spriteNormals, st), premul(texture(normals, st))));
  nm.rgb /= max(nm.a, 1e-4);
  vec3 rgb = a.rgb / max(a.a, 1e-4);
  if (nm.a > 0.5) {
    vec3 n = normalize(vec3(nm.r * 2.0 - 1.0, -(nm.g * 2.0 - 1.0), max(0.05, nm.b * 2.0 - 1.0)));
    // Moonlight from above: surfaces facing up catch a little more.
    vec3 light = ambient * (0.8 + 0.35 * max(0.0, -n.y));
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= lightCount) break;
      vec4 A = lightA[i], B = lightB[i];
      vec3 L = vec3(A.xy - px, A.z);
      float d = length(L.xy);
      if (d > A.w) continue;
      float fall = 1.0 - d / A.w; fall *= fall;
      float ndl = max(0.0, dot(n, normalize(L)));
      light += B.rgb * B.a * fall * (0.35 + 0.65 * ndl);
    }
    // Ordered-dither the light into steps: banded pools, like hand-shaded pixel art.
    float threshold = BAYER[int(mod(px.y, 4.0)) * 4 + int(mod(px.x, 4.0))] / 16.0;
    light = min(floor(light * 7.0 + threshold) / 7.0, vec3(1.45));
    rgb *= light;
    float depth = clamp((px.y - horizon) / max(1.0, wall - horizon), 0.0, 1.0);
    rgb = mix(rgb, fog, (1.0 - depth) * (1.0 - depth) * 0.4);
  }
  // Emissive layer plus a small bloom (a few taps at buffer resolution).
  vec4 e = glow(st);
  vec3 bloom = vec3(0.0);
  vec2 t = 1.0 / size;
  for (int k = 0; k < 8; k++) {
    float ang = float(k) * 0.785398;
    vec2 o = vec2(cos(ang), sin(ang));
    bloom += glow(st + o * t * 2.0).rgb * 0.09 + glow(st + o * t * 4.5).rgb * 0.05;
  }
  // Screen blend: bright effects glow without clipping everything under them to white.
  vec3 add = min(vec3(1.0), e.rgb * 1.05 + bloom);
  rgb = 1.0 - (1.0 - min(rgb, vec3(1.0))) * (1.0 - add);
  vec4 o = texture(overlay, st);
  rgb = mix(rgb, o.rgb, o.a);
  color = vec4(rgb, 1.0);
}`;

const SCREEN_PASS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D lit;
uniform vec2 size, screen;
uniform vec3 camera; // x, y offset (buffer px), zoom
uniform float angle, letterbox, hurt, flash;
void main() {
  vec2 frag = vec2(uv.x, 1.0 - uv.y) * screen;
  // Screen pixel -> buffer pixel through the camera (rotate and zoom about the centre).
  vec2 c = (frag / screen - 0.5) * size;
  float cs = cos(angle), sn = sin(angle);
  c = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) / camera.z + size * 0.5 + camera.xy;
  // Sharp bilinear: hard texel interiors, one screen pixel of blending at the edges.
  float scale = screen.x / size.x * camera.z;
  vec2 base = floor(c - 0.5) + 0.5, f = c - base;
  f = clamp((f - 0.5) * scale + 0.5, 0.0, 1.0);
  vec3 rgb = texture(lit, (base + f) / size).rgb;
  vec2 q = uv - 0.5;
  float edge = smoothstep(0.25, 0.75, length(q * vec2(1.0, 0.8)));
  rgb *= 1.0 - edge * 0.45;                                   // vignette
  rgb = mix(rgb, vec3(0.62, 0.08, 0.06), edge * hurt * 0.8);   // barricade hit
  rgb += flash * 0.35;
  float bar = letterbox * 0.085;
  if (uv.y < bar || uv.y > 1.0 - bar) rgb = vec3(0.03, 0.035, 0.04);
  color = vec4(rgb, 1.0);
}`;

// Batched sprites: one instanced quad per sheet frame, snapped to whole buffer pixels like Canvas2D drawImage.
const SPRITE_VERTEX = `#version 300 es
layout(location = 0) in vec2 corner;
layout(location = 1) in vec4 dst;  // left, top, width, height (buffer px)
layout(location = 2) in vec4 src;  // frame x, y, w, h (sheet px)
layout(location = 3) in float kind;
uniform vec2 size, sheetSize;
out vec2 tex; flat out int mode;
void main() {
  vec2 c = corner * 0.5 + 0.5;
  tex = (src.xy + c * src.zw) / sheetSize;
  mode = int(kind + 0.5);
  gl_Position = vec4((dst.xy + c * dst.zw) / size * 2.0 - 1.0, 0.0, 1.0);
}`;
const SPRITE_PASS = `#version 300 es
precision highp float;
in vec2 tex; flat in int mode;
uniform sampler2D sheet, sheetNormals;
layout(location = 0) out vec4 outAlbedo;
layout(location = 1) out vec4 outNormals;
layout(location = 2) out vec4 outEmissive;
void main() {
  vec4 a = texture(sheet, tex);
  if (a.a < 0.004) discard;
  vec4 p = vec4(a.rgb * a.a, a.a);
  outAlbedo = vec4(0.0); outNormals = vec4(0.0); outEmissive = vec4(0.0);
  if (mode <= ${SPRITE.albedo}) outAlbedo = p;
  if (mode == ${SPRITE.lit}) { vec4 n = texture(sheetNormals, tex); outNormals = vec4(n.rgb * n.a, n.a); }
  if (mode == ${SPRITE.glow}) outEmissive = p;
  // Hit flash: the silhouette in warm white at 85%.
  if (mode == ${SPRITE.flash}) outEmissive = vec4(1.0, 0.965, 0.863, 1.0) * a.a * 0.85;
}`;

export interface Compositor {
  readonly webgl: boolean;
  /** WebGL only: the sprite sheet and its normal map, for batched sprites. */
  setSheets(sheet: TexImageSource, normals: TexImageSource): void;
  render(layers: Layers, lights: readonly Light[], atmosphere: Atmosphere, view: CameraView, sprites?: SpriteBatch): void;
}

const GL_OPTIONS: WebGLContextAttributes = { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false };
/** Compiles the shaders on a throwaway canvas, so a driver failure never claims the real canvas for WebGL. */
function webglWorks() {
  try {
    const probe = document.createElement('canvas'), gl = probe.getContext('webgl2', GL_OPTIONS);
    if (!gl) return false;
    new GlCompositor(probe, gl); gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch (error) { console.warn('TL003: WebGL2 lighting unavailable, using Canvas2D.', error); return false; }
}
/** WebGL2 when available; `forceCanvas` (URL `?canvas2d`) selects the Canvas2D path for testing or weak devices. */
export function createCompositor(canvas: HTMLCanvasElement, forceCanvas = false): Compositor {
  if (!forceCanvas && webglWorks()) {
    const gl = canvas.getContext('webgl2', GL_OPTIONS);
    if (gl) return new RecoveringGl(canvas, gl);
  }
  return new CanvasCompositor(canvas);
}

/** Mobile browsers drop WebGL contexts when the tab is backgrounded: skip frames while lost, rebuild when restored. */
class RecoveringGl implements Compositor {
  readonly webgl = true;
  private inner?: GlCompositor;
  private sheets?: [TexImageSource, TexImageSource];
  constructor(canvas: HTMLCanvasElement, private gl: WebGL2RenderingContext) {
    this.inner = new GlCompositor(canvas, gl);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.inner = undefined; });
    canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.inner = new GlCompositor(canvas, gl);
        if (this.sheets) this.inner.setSheets(...this.sheets);
      } catch (error) { console.error('TL003: could not restore WebGL lighting.', error); }
    });
  }
  setSheets(sheet: TexImageSource, normals: TexImageSource) {
    this.sheets = [sheet, normals];
    if (this.inner && !this.gl.isContextLost()) this.inner.setSheets(sheet, normals);
  }
  render(layers: Layers, lights: readonly Light[], atmosphere: Atmosphere, view: CameraView, sprites?: SpriteBatch) {
    if (this.inner && !this.gl.isContextLost()) this.inner.render(layers, lights, atmosphere, view, sprites);
  }
}

/** Texture units: canvas layers 0–3 and 5–6, the lit buffer 4, sprite targets 7–9, the sheets 10–11. */
const LAYER_UNITS = [0, 1, 2, 3, 5, 6], LIT_UNIT = 4, TARGET_UNITS = [7, 8, 9], SHEET_UNITS = [10, 11];

class GlCompositor implements Compositor {
  readonly webgl = true;
  private lightProgram: WebGLProgram; private screenProgram: WebGLProgram; private spriteProgram: WebGLProgram;
  private textures: WebGLTexture[]; private litTexture: WebGLTexture; private framebuffer: WebGLFramebuffer;
  private targets: WebGLTexture[]; private spriteFramebuffer: WebGLFramebuffer;
  private sheets: WebGLTexture[]; private sheetSize = { width: 1, height: 1 };
  private spriteVao: WebGLVertexArrayObject; private instances: WebGLBuffer; private instanceCapacity = 0;
  private litSize = { width: 0, height: 0 }; private uploaded = { width: 0, height: 0 };
  private lightA = new Float32Array(MAX_LIGHTS * 4); private lightB = new Float32Array(MAX_LIGHTS * 4);
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  constructor(private canvas: HTMLCanvasElement, private gl: WebGL2RenderingContext) {
    this.lightProgram = this.program(LIGHT_PASS); this.screenProgram = this.program(SCREEN_PASS);
    this.spriteProgram = this.program(SPRITE_PASS, SPRITE_VERTEX);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    for (const p of [this.lightProgram, this.screenProgram]) {
      const at = gl.getAttribLocation(p, 'corner'); gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    }
    // The sprite pass keeps its own vertex array: the shared quad plus one instance record per sprite.
    this.spriteVao = gl.createVertexArray()!; gl.bindVertexArray(this.spriteVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instances = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    const stride = SPRITE_FLOATS * 4;
    for (const [at, count, offset] of [[1, 4, 0], [2, 4, 16], [3, 1, 32]] as const) {
      gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, count, gl.FLOAT, false, stride, offset); gl.vertexAttribDivisor(at, 1);
    }
    gl.bindVertexArray(null);
    this.textures = LAYER_UNITS.map(() => this.texture(gl.NEAREST));
    this.litTexture = this.texture(gl.LINEAR);
    this.framebuffer = gl.createFramebuffer()!;
    this.targets = TARGET_UNITS.map(() => this.texture(gl.NEAREST));
    this.spriteFramebuffer = gl.createFramebuffer()!;
    this.sheets = SHEET_UNITS.map(() => this.texture(gl.NEAREST));
  }
  setSheets(sheet: TexImageSource, normals: TexImageSource) {
    const gl = this.gl;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    [sheet, normals].forEach((source, i) => {
      gl.activeTexture(gl.TEXTURE0 + SHEET_UNITS[i]!); gl.bindTexture(gl.TEXTURE_2D, this.sheets[i]!);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    });
    const s = sheet as { width: number; height: number };
    this.sheetSize = { width: s.width, height: s.height };
  }
  private program(fragment: string, vertex = VERTEX) {
    const gl = this.gl, shader = (type: number, source: string) => {
      const s = gl.createShader(type)!; gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
    gl.bindAttribLocation(p, 0, 'corner'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
    return p;
  }
  private texture(filter: number) {
    const gl = this.gl, t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  private u(program: WebGLProgram, name: string) {
    const key = (program === this.lightProgram ? 'l:' : program === this.spriteProgram ? 'p:' : 's:') + name;
    if (!this.uniforms.has(key)) this.uniforms.set(key, this.gl.getUniformLocation(program, name));
    return this.uniforms.get(key)!;
  }
  render(layers: Layers, lights: readonly Light[], atmosphere: Atmosphere, view: CameraView, sprites?: SpriteBatch) {
    const gl = this.gl, { width, height } = layers.albedo;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const resized = this.uploaded.width !== width || this.uploaded.height !== height;
    [layers.albedo, layers.normals, layers.emissive, layers.overlay, layers.overAlbedo, layers.overNormals].forEach((source, i) => {
      gl.activeTexture(gl.TEXTURE0 + LAYER_UNITS[i]!); gl.bindTexture(gl.TEXTURE_2D, this.textures[i]!);
      if (resized) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    });
    this.uploaded = { width, height };
    if (this.litSize.width !== width || this.litSize.height !== height) {
      gl.activeTexture(gl.TEXTURE0 + LIT_UNIT); gl.bindTexture(gl.TEXTURE_2D, this.litTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.litTexture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.spriteFramebuffer);
      this.targets.forEach((target, i) => {
        gl.activeTexture(gl.TEXTURE0 + TARGET_UNITS[i]!); gl.bindTexture(gl.TEXTURE_2D, target);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, target, 0);
      });
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
      this.litSize = { width, height };
    }
    // Pass 0: the batched sprites, in order (far to near), premultiplied "over" into their own targets.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.spriteFramebuffer); gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (sprites && sprites.count > 0) {
      const sp = this.spriteProgram; gl.useProgram(sp);
      gl.uniform1i(this.u(sp, 'sheet'), SHEET_UNITS[0]!); gl.uniform1i(this.u(sp, 'sheetNormals'), SHEET_UNITS[1]!);
      gl.uniform2f(this.u(sp, 'size'), width, height); gl.uniform2f(this.u(sp, 'sheetSize'), this.sheetSize.width, this.sheetSize.height);
      gl.bindVertexArray(this.spriteVao); gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
      const used = sprites.count * SPRITE_FLOATS;
      if (used > this.instanceCapacity) { this.instanceCapacity = sprites.data.length; gl.bufferData(gl.ARRAY_BUFFER, this.instanceCapacity * 4, gl.DYNAMIC_DRAW); }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sprites.data, 0, used);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, sprites.count);
      gl.disable(gl.BLEND); gl.bindVertexArray(null);
    }
    // Pass 1: light at buffer resolution.
    const p = this.lightProgram; gl.useProgram(p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer); gl.viewport(0, 0, width, height);
    ['albedo', 'normals', 'emissive', 'overlay', 'overAlbedo', 'overNormals'].forEach((name, i) => gl.uniform1i(this.u(p, name), LAYER_UNITS[i]!));
    ['spriteAlbedo', 'spriteNormals', 'spriteEmissive'].forEach((name, i) => gl.uniform1i(this.u(p, name), TARGET_UNITS[i]!));
    gl.uniform2f(this.u(p, 'size'), width, height);
    const count = Math.min(MAX_LIGHTS, lights.length);
    for (let i = 0; i < count; i++) {
      const l = lights[i]!;
      this.lightA.set([l.x, l.y, l.z, l.radius], i * 4); this.lightB.set([l.color[0], l.color[1], l.color[2], l.intensity], i * 4);
    }
    gl.uniform4fv(this.u(p, 'lightA'), this.lightA); gl.uniform4fv(this.u(p, 'lightB'), this.lightB);
    gl.uniform1i(this.u(p, 'lightCount'), count);
    gl.uniform3fv(this.u(p, 'ambient'), atmosphere.ambient); gl.uniform3fv(this.u(p, 'fog'), atmosphere.fog);
    gl.uniform1f(this.u(p, 'horizon'), atmosphere.horizon); gl.uniform1f(this.u(p, 'wall'), atmosphere.wall);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Pass 2: camera + sharp upscale to the screen.
    const s = this.screenProgram; gl.useProgram(s);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.activeTexture(gl.TEXTURE0 + LIT_UNIT); gl.bindTexture(gl.TEXTURE_2D, this.litTexture); gl.uniform1i(this.u(s, 'lit'), LIT_UNIT);
    gl.uniform2f(this.u(s, 'size'), width, height); gl.uniform2f(this.u(s, 'screen'), this.canvas.width, this.canvas.height);
    gl.uniform3f(this.u(s, 'camera'), view.x, view.y, view.zoom);
    gl.uniform1f(this.u(s, 'angle'), view.angle); gl.uniform1f(this.u(s, 'letterbox'), view.letterbox);
    gl.uniform1f(this.u(s, 'hurt'), view.hurt); gl.uniform1f(this.u(s, 'flash'), view.flash);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** Canvas2D fallback: multiply a light map over the albedo, then add emissive and the overlay. */
class CanvasCompositor implements Compositor {
  readonly webgl = false;
  private context: CanvasRenderingContext2D;
  private lit = document.createElement('canvas'); private lightMap = document.createElement('canvas');
  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('TL003: no 2D context on the battlefield canvas');
    this.context = context;
  }
  /** Canvas2D draws every sprite itself; there is nothing to batch. */
  setSheets() {}
  render(layers: Layers, lights: readonly Light[], atmosphere: Atmosphere, view: CameraView) {
    const { width, height } = layers.albedo;
    for (const c of [this.lit, this.lightMap]) if (c.width !== width || c.height !== height) { c.width = width; c.height = height; }
    const rgb = (c: readonly number[], k = 1) => `rgb(${c.map(v => Math.round(Math.min(1, v * k) * 255)).join(',')})`;
    const m = this.lightMap.getContext('2d')!;
    m.globalCompositeOperation = 'source-over'; m.fillStyle = rgb(atmosphere.ambient); m.fillRect(0, 0, width, height);
    m.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const g = m.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.radius);
      g.addColorStop(0, rgb(l.color, l.intensity * 0.5)); g.addColorStop(1, 'rgb(0,0,0)');
      m.fillStyle = g; m.fillRect(l.x - l.radius, l.y - l.radius, l.radius * 2, l.radius * 2);
    }
    // Unlit pixels (sky): punch the light map up to white where the normal layer is empty.
    m.globalCompositeOperation = 'destination-in'; m.drawImage(layers.normals, 0, 0);
    m.globalCompositeOperation = 'destination-over'; m.fillStyle = '#fff'; m.fillRect(0, 0, width, height);
    const c = this.lit.getContext('2d')!;
    c.globalCompositeOperation = 'source-over'; c.drawImage(layers.albedo, 0, 0);
    c.globalCompositeOperation = 'multiply'; c.drawImage(this.lightMap, 0, 0);
    c.globalCompositeOperation = 'lighter'; c.drawImage(layers.emissive, 0, 0);
    c.globalCompositeOperation = 'source-over'; c.drawImage(layers.overlay, 0, 0);
    const d = this.context, w = this.canvas.width, h = this.canvas.height, scale = w / width;
    d.setTransform(1, 0, 0, 1, 0, 0); d.imageSmoothingEnabled = false; d.fillStyle = '#08090a'; d.fillRect(0, 0, w, h);
    d.translate(w / 2, h / 2); d.rotate(-view.angle); d.scale(view.zoom, view.zoom);
    d.drawImage(this.lit, (-width / 2 - view.x) * scale, (-height / 2 - view.y) * scale, w, h);
    d.setTransform(1, 0, 0, 1, 0, 0);
    if (view.letterbox > 0) { const bar = h * 0.085 * view.letterbox; d.fillStyle = '#08090a'; d.fillRect(0, 0, w, bar); d.fillRect(0, h - bar, w, bar); }
    if (view.hurt > 0) { d.fillStyle = `rgba(158,20,15,${view.hurt * 0.25})`; d.fillRect(0, 0, w, h); }
    if (view.flash > 0) { d.fillStyle = `rgba(255,255,255,${view.flash * 0.3})`; d.fillRect(0, 0, w, h); }
  }
}
