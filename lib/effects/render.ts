// Draws effect layers in the browser with WebGL2: the picture goes in as a texture, each effect runs as a shader pass
// (bloom, halation and star glow with their own blur passes), its result is blended back with the effect's blend mode
// and opacity, and each layer is mixed in by its own strength. One renderer per canvas; renderTo() shares one hidden
// renderer for small previews, as browsers allow only so many WebGL canvases at once. Browser only.

import { allParams, defOf, val, type Effect, type EffectLayer, BLENDS } from '@/lib/effects/model';

type Target = { tex: WebGLTexture; fb: WebGLFramebuffer; w: number; h: number };
type Uniform = number | number[] | WebGLTexture;

const VERT = `#version 300 es
out vec2 v; void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); v = p; gl_Position = vec4(p * 2. - 1., 0., 1.); }`;
const HEAD = `#version 300 es
precision highp float; in vec2 v; out vec4 o; uniform vec2 u_res; uniform float u_time;
const vec3 LUM = vec3(.2126, .7152, .0722);
vec3 hue(float h){ return clamp(abs(mod(h / 60. + vec3(0., 4., 2.), 6.) - 3.) - 1., 0., 1.); }
vec3 wheel(vec2 w){ return (hue(w.x) - .5) * w.y * .5; }
vec3 sat(vec3 c, float s){ return mix(vec3(dot(c, LUM)), c, s); }
`;

const FRAG: Record<string, string> = {
  copy: `uniform sampler2D s; void main(){ o = texture(s, v); }`,
  blend: `uniform sampler2D b, t; uniform float mode, op;
vec3 bl(vec3 a, vec3 c){ int m = int(mode + .5);
  if (m == 1) return a * c; if (m == 2) return 1. - (1. - a) * (1. - c);
  if (m == 3) return mix(2. * a * c, 1. - 2. * (1. - a) * (1. - c), step(.5, a));
  if (m == 4) return mix(2. * a * c + a * a * (1. - 2. * c), sqrt(max(a, 0.)) * (2. * c - 1.) + 2. * a * (1. - c), step(.5, c));
  if (m == 5) return a + c; if (m == 6) return max(a, c); if (m == 7) return min(a, c);
  if (m == 8) return a / max(1. - c, 1e-3); if (m == 9) return abs(a - c); return c; }
void main(){ vec4 A = texture(b, v), C = texture(t, v); o = vec4(mix(A.rgb, bl(A.rgb, C.rgb), op), A.a); }`,
  noise: `uniform sampler2D s; uniform float p_amount, p_size, p_floor, p_chroma, p_shadow, p_midtone, p_highlight, p_speed;
float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){ vec4 c = texture(s, v); vec2 px = floor(v * u_res / max(p_size, .5)); float sd = p_speed > 0. ? floor(u_time * p_speed) : 0.;
  vec3 n = vec3(h(px + sd * 1.73), h(px + vec2(17., 5.) + sd * 2.31), h(px + vec2(3., 29.) + sd * 3.17)) - .5;
  n = mix(vec3(h(px + vec2(7., 11.) + sd * .91) - .5), n, p_chroma);
  float L = dot(c.rgb, LUM);
  float w = p_shadow * (1. - smoothstep(0., .45, L)) + p_midtone * (1. - abs(L - .5) * 2.) + p_highlight * smoothstep(.55, 1., L);
  o = vec4(c.rgb + n * p_amount * max(w, p_floor) * .35, c.a); }`,
  rgbShift: `uniform sampler2D s; uniform float p_red, p_blue, p_stretch; uniform vec2 p_centre;
void main(){ vec2 d = v - (p_centre * .5 + .5); d.x *= p_stretch; vec4 g = texture(s, v);
  o = vec4(texture(s, v - d * p_red).r, g.g, texture(s, v + d * p_blue).b, g.a); }`,
  frameDrop: `uniform sampler2D s, held; uniform float p_ghost; void main(){ o = mix(texture(held, v), texture(s, v), p_ghost); }`,
  vignette: `uniform sampler2D s; uniform float p_shape, p_size, p_anamorphism, p_rotation, p_softness, p_transparency; uniform vec2 p_centre; uniform vec3 p_colour;
void main(){ vec4 c = texture(s, v); vec2 a = u_res / max(u_res.x, u_res.y); vec2 p = (v - .5 - p_centre * .5) * a * 2.;
  float r = radians(p_rotation); p = mat2(cos(r), -sin(r), sin(r), cos(r)) * p; p.x /= max(p_anamorphism, .01);
  float e = p_shape < .5 ? 2. : p_shape < 1.5 ? 4. : 14.;
  float d = pow(pow(abs(p.x), e) + pow(abs(p.y), e), 1. / e);
  float k = smoothstep(p_size, p_size + max(p_softness, .002) * 1.1, d);
  o = vec4(mix(c.rgb, p_colour, k * p_transparency), c.a); }`,
  levels: `uniform sampler2D s; uniform float p_inBlack, p_inWhite, p_gamma, p_outBlack, p_outWhite;
void main(){ vec4 c = texture(s, v); vec3 x = clamp((c.rgb - p_inBlack) / max(p_inWhite - p_inBlack, 1e-3), 0., 1.);
  x = pow(x, vec3(1. / max(p_gamma, .01))); o = vec4(mix(vec3(p_outBlack), vec3(p_outWhite), x), c.a); }`,
  exposure: `uniform sampler2D s; uniform float p_exposure, p_gamma, p_gamut, p_reinhard, p_clipping;
void main(){ vec4 c = texture(s, v); vec3 l = pow(max(c.rgb, 0.), vec3(p_gamma)) * exp2(p_exposure);
  if (p_reinhard > .5) l = l * (1. + l / 4.) / (1. + l);
  float m = max(l.r, max(l.g, l.b)); l = mix(l, l / max(m, 1.), p_gamut);
  vec3 x = pow(max(l, 0.), vec3(1. / p_gamma));
  if (p_clipping > .5) { if (max(x.r, max(x.g, x.b)) >= .999) x = vec3(1., 0., .3); else if (max(x.r, max(x.g, x.b)) <= .002) x = vec3(0., .3, 1.); }
  o = vec4(x, c.a); }`,
  contrast: `uniform sampler2D s; uniform float p_strength, p_pivot, p_output, p_gamma;
vec3 curve(vec3 x, float pv, float e){ pv = clamp(pv, .01, .99);
  vec3 lo = pv * pow(clamp(x / pv, 0., 1.), vec3(e)); vec3 hi = 1. - (1. - pv) * pow(clamp((1. - x) / (1. - pv), 0., 1.), vec3(e));
  return mix(lo, hi, step(pv, x)); }
void main(){ vec4 c = texture(s, v); vec3 x = pow(max(c.rgb, 0.), vec3(p_gamma / 2.2));
  x = curve(x, p_pivot, pow(3., p_strength)); x = p_pivot + (x - p_pivot) * p_output;
  o = vec4(pow(max(x, 0.), vec3(2.2 / p_gamma)), c.a); }`,
  grade: `uniform sampler2D s; uniform vec2 p_tint; uniform float p_exposure, p_saturation, p_zones_width, p_zones_balance, p_strength;
uniform vec2 p_black_tint, p_shadow_tint, p_light_tint, p_highlight_tint, p_specular_tint;
uniform float p_black_exposure, p_shadow_exposure, p_light_exposure, p_highlight_exposure, p_specular_exposure;
uniform float p_black_saturation, p_shadow_saturation, p_light_saturation, p_highlight_saturation, p_specular_saturation;
vec3 zone(vec3 x, float L, float ctr, vec2 t, float e, float s){ float w = exp(-pow((L - ctr) / max(p_zones_width, .01), 2.)); return mix(x, sat(x * exp2(e) + wheel(t), s), w); }
void main(){ vec4 c = texture(s, v); vec3 x = c.rgb * exp2(p_exposure) + wheel(p_tint); x = sat(x, p_saturation);
  float L = clamp(dot(clamp(x, 0., 1.), LUM) - p_zones_balance, 0., 1.);
  x = zone(x, L, .02, p_black_tint, p_black_exposure, p_black_saturation);
  x = zone(x, L, .25, p_shadow_tint, p_shadow_exposure, p_shadow_saturation);
  x = zone(x, L, .5, p_light_tint, p_light_exposure, p_light_saturation);
  x = zone(x, L, .75, p_highlight_tint, p_highlight_exposure, p_highlight_saturation);
  x = zone(x, L, .98, p_specular_tint, p_specular_exposure, p_specular_saturation);
  o = vec4(mix(c.rgb, x, p_strength), c.a); }`,
  // Glow: the bright parts, blurred down and back up (dual Kawase), then laid back over the picture
  bright: `uniform sampler2D s; uniform float th, kn, boost;
void main(){ vec3 c = pow(max(texture(s, v).rgb, 0.), vec3(2.2)); float br = max(c.r, max(c.g, c.b));
  float k = max(kn, 1e-4); float soft = clamp(br - th + k, 0., 2. * k); soft = soft * soft / (4. * k);
  o = vec4(c * max(soft, br - th) / max(br, 1e-4) * (1. + boost), 1.); }`,
  down: `uniform sampler2D s; uniform vec2 px;
void main(){ vec4 a = texture(s, v) * 4. + texture(s, v - px) + texture(s, v + px) + texture(s, v + vec2(px.x, -px.y)) + texture(s, v - vec2(px.x, -px.y)); o = a / 8.; }`,
  up: `uniform sampler2D s, cur; uniform vec2 px; uniform float f;
void main(){ vec4 a = texture(s, v + vec2(-px.x * 2., 0.)) + texture(s, v + vec2(-px.x, px.y)) * 2. + texture(s, v + vec2(0., px.y * 2.)) + texture(s, v + vec2(px.x, px.y)) * 2.
  + texture(s, v + vec2(px.x * 2., 0.)) + texture(s, v + vec2(px.x, -px.y)) * 2. + texture(s, v + vec2(0., -px.y * 2.)) + texture(s, v + vec2(-px.x, -px.y)) * 2.;
  o = texture(cur, v) + a / 12. * f; }`,
  streak: `uniform sampler2D s; uniform vec2 dir; uniform float n, fall;
void main(){ vec3 a = vec3(0.); int N = int(n);
  for (int i = 0; i < 64; i++) { if (i >= N) break; float t = float(i) / float(max(N - 1, 1)); float w = pow(1. - t, 1. + fall * 8.);
    a += (texture(s, v + dir * t).rgb + texture(s, v - dir * t).rgb) * w; }
  o = vec4(a / max(n, 1.) * 16., 1.); }`,
  bloomMix: `uniform sampler2D s, g; uniform float p_intensity, p_mode, p_tonemapper;
void main(){ vec4 c0 = texture(s, v); vec3 c = pow(max(c0.rgb, 0.), vec3(2.2)); vec3 gl = texture(g, v).rgb * p_intensity * .6;
  vec3 r = p_mode < .5 ? c + gl : 1. - (1. - min(c, 1.)) * (1. - min(gl, 1.));
  if (p_tonemapper > .5 && p_tonemapper < 1.5) r = r * (1. + r / 4.) / (1. + r);
  if (p_tonemapper > 1.5) r = clamp((r * (2.51 * r + .03)) / (r * (2.43 * r + .59) + .14), 0., 1.);
  o = vec4(pow(max(r, 0.), vec3(1. / 2.2)), c0.a); }`,
  halMix: `uniform sampler2D s, g; uniform float p_intensity, p_saturation; uniform vec3 p_tint;
void main(){ vec4 c0 = texture(s, v); vec3 c = pow(max(c0.rgb, 0.), vec3(2.2)); vec3 gl = texture(g, v).rgb;
  vec3 h = mix(vec3(dot(gl, LUM)), dot(gl, LUM) * pow(p_tint, vec3(2.2)) * 2., p_saturation);
  o = vec4(pow(max(c + h * p_intensity * .5, 0.), vec3(1. / 2.2)), c0.a); }`,
  addMix: `uniform sampler2D s, g; uniform float p_intensity;
void main(){ vec4 c0 = texture(s, v); vec3 c = pow(max(c0.rgb, 0.), vec3(2.2)) + texture(g, v).rgb * p_intensity; o = vec4(pow(max(c, 0.), vec3(1. / 2.2)), c0.a); }`
};

const hex3 = (h: string) => { const n = parseInt((h || '#000').replace('#', '').slice(0, 6).padEnd(6, '0'), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
/** An effect's settings as shader uniforms: p_<key>, with dots as underscores */
function uniformsOf(e: Effect): Record<string, Uniform> {
  const u: Record<string, Uniform> = {};
  for (const p of allParams(defOf(e.kind))) {
    const x = val(e, p.key); const k = 'p_' + p.key.replace(/\./g, '_');
    u[k] = typeof x === 'boolean' ? (x ? 1 : 0) : typeof x === 'string' ? hex3(x) : Array.isArray(x) ? [Number(x[0]) || 0, Number(x[1]) || 0] : Number(x) || 0;
  }
  return u;
}
const rand = (n: number) => { const x = Math.sin(n * 12.9898) * 43758.5453; return x - Math.floor(x); };

export class FxRenderer {
  readonly gl: WebGL2RenderingContext;
  private progs = new Map<string, { p: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }>();
  private free: Target[] = [];
  private named = new Map<string, Target>();
  private src: WebGLTexture;
  private held = new Map<string, { t: Target; next: number; last: number }>();
  private float: boolean;
  private W = 1; private H = 1; private time = 0;
  constructor(readonly canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('This browser can’t draw effects (it needs WebGL2).');
    this.gl = gl;
    this.float = !!gl.getExtension('EXT_color_buffer_float');
    gl.bindVertexArray(gl.createVertexArray());
    this.src = this.texture();
  }
  private texture() { const gl = this.gl, t = gl.createTexture()!; gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; }
  private target(w: number, h: number): Target {
    const i = this.free.findIndex((x) => x.w === w && x.h === h); if (i >= 0) return this.free.splice(i, 1)[0];
    const gl = this.gl, tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, this.float ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, this.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer()!; gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { tex, fb, w, h };
  }
  private release(t: Target) { this.free.push(t); }
  private prog(name: string) {
    let x = this.progs.get(name); if (x) return x;
    const gl = this.gl;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Effect ${name}: ${gl.getShaderInfoLog(s)}`); return s; };
    const p = gl.createProgram()!; gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + FRAG[name])); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Effect ${name}: ${gl.getProgramInfoLog(p)}`);
    x = { p, loc: new Map() }; this.progs.set(name, x); return x;
  }
  /** One full-frame pass into a target (or the canvas) */
  private pass(name: string, out: Target | null, u: Record<string, Uniform>, additive = false) {
    const gl = this.gl, P = this.prog(name);
    gl.useProgram(P.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fb : null);
    const w = out ? out.w : this.W, h = out ? out.h : this.H;
    gl.viewport(0, 0, w, h);
    const at = (k: string) => { if (!P.loc.has(k)) P.loc.set(k, gl.getUniformLocation(P.p, k)); return P.loc.get(k)!; };
    let unit = 0;
    const all: Record<string, Uniform> = { u_res: [w, h], u_time: this.time, ...u };
    for (const [k, v] of Object.entries(all)) {
      const l = at(k); if (!l) continue;
      if (v instanceof WebGLTexture) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v); gl.uniform1i(l, unit++); }
      else if (typeof v === 'number') gl.uniform1f(l, v);
      else if (v.length === 2) gl.uniform2f(l, v[0], v[1]);
      else if (v.length === 3) gl.uniform3f(l, v[0], v[1], v[2]);
      else gl.uniform4f(l, v[0], v[1], v[2], v[3]);
    }
    if (additive) { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); } else gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }
  /** The bright parts of a picture, blurred: `levels` steps down and back up */
  private glow(src: WebGLTexture, th: number, kn: number, boost: number, levels: number, factor: number) {
    const W = Math.max(1, this.W >> 1), H = Math.max(1, this.H >> 1);
    const b = this.target(W, H); this.pass('bright', b, { s: src, th, kn, boost });
    const chain: Target[] = [b];
    for (let i = 1; i <= levels; i++) { const p = chain[i - 1]; const w = Math.max(1, p.w >> 1), h = Math.max(1, p.h >> 1); const t = this.target(w, h); this.pass('down', t, { s: p.tex, px: [1 / p.w, 1 / p.h] }); chain.push(t); }
    let up = chain[levels];
    for (let i = levels - 1; i >= 0; i--) { const c = chain[i]; const t = this.target(c.w, c.h); this.pass('up', t, { s: up.tex, cur: c.tex, px: [1 / up.w, 1 / up.h], f: factor }); if (up !== chain[levels]) this.release(up); up = t; }
    chain.forEach((t) => this.release(t));
    return up;
  }
  /** One effect: reads `cur`, writes into `out` */
  private effect(e: Effect, cur: Target, out: Target) {
    const u = uniformsOf(e);
    const n = (k: string) => Number(val(e, k)) || 0;
    switch (e.kind) {
      case 'bloom': { const g = this.glow(cur.tex, n('threshold'), n('knee'), 0, 6, 0.4 + n('factor') * 1.2); this.pass('bloomMix', out, { s: cur.tex, g: g.tex, ...u }); this.release(g); return; }
      case 'halation': { const g = this.glow(cur.tex, n('threshold'), n('knee'), 0, 2 + Math.round(n('radius') * 4), 1); this.pass('halMix', out, { s: cur.tex, g: g.tex, ...u }); this.release(g); return; }
      case 'starGlow': {
        const W = Math.max(1, this.W >> 1), H = Math.max(1, this.H >> 1);
        const b = this.target(W, H); this.pass('bright', b, { s: cur.tex, th: n('threshold'), kn: n('knee'), boost: n('boost') });
        const acc = this.target(W, H); const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fb); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        const k = Math.max(1, Math.round(n('streaks'))), len = n('length') * (Math.min(this.W, this.H) / 1000);
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI + Math.PI / 4; const L = len * (i % 2 ? n('alternate') : 1);
          this.pass('streak', acc, { s: b.tex, dir: [Math.cos(a) * L / this.W, Math.sin(a) * L / this.H], n: n('samples'), fall: n('falloff') }, true);
        }
        this.pass('addMix', out, { s: cur.tex, g: acc.tex, p_intensity: n('intensity') });
        this.release(b); this.release(acc); return;
      }
      case 'frameDrop': {
        // Holds a frame, and takes a new one at the frame rate, a little irregularly
        let h = this.held.get(e.id);
        if (!h || h.t.w !== cur.w || h.t.h !== cur.h) { h = { t: this.target(cur.w, cur.h), next: -1, last: -1 }; this.held.set(e.id, h); }
        if (this.time >= h.next || this.time < h.last) {
          this.pass('copy', h.t, { s: cur.tex });
          const step = 1 / Math.max(1, n('fps'));
          h.next = this.time + step * (1 + (rand(Math.floor(this.time / step) + 1) - 0.5) * 2 * n('irregularity'));
        }
        h.last = this.time;
        this.pass('frameDrop', out, { s: cur.tex, held: h.t.tex, ...u }); return;
      }
      default: this.pass(e.kind, out, { s: cur.tex, ...u });
    }
  }
  /** Draws a picture (an image, a video frame or a canvas) through the layers, at W × H. time is in seconds. */
  render(source: TexImageSource, W: number, H: number, layers: EffectLayer[], time = 0) {
    const gl = this.gl;
    W = Math.max(1, Math.round(W)); H = Math.max(1, Math.round(H));
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    if (this.W !== W || this.H !== H) { this.free.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }); this.free = []; this.held.clear(); }
    this.W = W; this.H = H; this.time = time;
    gl.bindTexture(gl.TEXTURE_2D, this.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    let cur = this.target(W, H); this.pass('copy', cur, { s: this.src });
    for (const L of layers) {
      if (!L.on || L.opacity <= 0) continue;
      const fx = L.effects.filter((e) => e.on && e.opacity > 0); if (!fx.length) continue;
      const base = cur; let c = this.target(W, H); this.pass('copy', c, { s: base.tex });
      for (const e of fx) {
        const out = this.target(W, H); this.effect(e, c, out);
        const mixed = this.target(W, H); this.pass('blend', mixed, { b: c.tex, t: out.tex, mode: BLENDS.indexOf(e.blend), op: e.opacity / 100 });
        this.release(out); this.release(c); c = mixed;
      }
      if (L.opacity < 1) { const m = this.target(W, H); this.pass('blend', m, { b: base.tex, t: c.tex, mode: 0, op: L.opacity }); this.release(c); c = m; }
      this.release(base); cur = c;
    }
    this.pass('copy', null, { s: cur.tex });
    this.release(cur);
  }
  dispose() { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}

let shared: FxRenderer | null = null;
/** Draws a picture through layers into a 2D canvas, with one hidden renderer shared by every small preview */
export function renderTo(target: HTMLCanvasElement, source: TexImageSource, layers: EffectLayer[], time = 0) {
  if (!shared) shared = new FxRenderer(typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2) : document.createElement('canvas'));
  shared.render(source, target.width, target.height, layers, time);
  const x = target.getContext('2d')!; x.clearRect(0, 0, target.width, target.height); x.drawImage(shared.canvas as CanvasImageSource, 0, 0);
}

/** A picture through layers at full size, as a file (for saving an edited image) */
export async function renderFile(source: TexImageSource, W: number, H: number, layers: EffectLayer[], type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  const c = document.createElement('canvas'); const r = new FxRenderer(c);
  try { r.render(source, W, H, layers, 0); return await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('Couldn’t save the image.'))), type, quality)); }
  finally { r.dispose(); }
}
