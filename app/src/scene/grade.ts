// Final colour grade (after tone mapping, before the output encode): white balance, saturation, a contrast curve about
// mid-grey and slightly cool, lifted deep shadows. The museum is lit by 2800-3500 K lamps and its baked panoramas are
// warm: without a balance the whole interior reads one orange, silver looks like copper and ivory like caramel - a
// gallery photographer's white balance (and a touch of contrast) is what makes it read as rich rather than flat.
// Values per space are eased by the room (Experience) every frame.
import { Effect } from 'postprocessing'
import { Uniform, Vector3 } from 'three'

const frag = /* glsl */ `
  uniform vec3 uGain;
  uniform float uSat;
  uniform float uContrast;
  uniform float uLift;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 c = max(inputColor.rgb * uGain, 0.0);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSat);
    // contrast as a power curve about scene mid-grey (0.18): deeper shadows, brighter highlights, mid-grey fixed
    c = 0.18 * pow(c / 0.18, vec3(uContrast));
    // the darkest tones lifted a hair toward a cool grey (never crushed to a flat black)
    c += uLift * vec3(0.85, 0.95, 1.12) * (1.0 - smoothstep(0.0, 0.06, l));
    outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
  }`

export class GradeEffect extends Effect {
  constructor() {
    super('JTGrade', frag, {
      uniforms: new Map<string, Uniform>([
        ['uGain', new Uniform(new Vector3(1, 1, 1))],
        ['uSat', new Uniform(1)],
        ['uContrast', new Uniform(1)],
        ['uLift', new Uniform(0)],
      ]),
    })
  }
}

export type GradeLook = { gain: [number, number, number]; sat: number; contrast: number; lift: number }
/** the listening room keeps its own warm evening look; the museum gets a gallery white balance */
export const LOOKS: Record<'room' | 'museum', GradeLook> = {
  room: { gain: [1, 1, 1], sat: 1, contrast: 1.02, lift: 0 },
  museum: { gain: [0.76, 0.95, 1.42], sat: 0.82, contrast: 1.14, lift: 0.005 }, // (look-dev: scripts/grade-shots.mjs)
}

/** ease the effect toward a look (k: 0..1 per frame) */
export function easeGrade(e: GradeEffect, look: GradeLook, k: number) {
  const u = e.uniforms
  const g = u.get('uGain')!.value as Vector3
  g.set(g.x + (look.gain[0] - g.x) * k, g.y + (look.gain[1] - g.y) * k, g.z + (look.gain[2] - g.z) * k)
  for (const [name, v] of [['uSat', look.sat], ['uContrast', look.contrast], ['uLift', look.lift]] as const) {
    const un = u.get(name)!
    un.value = (un.value as number) + (v - (un.value as number)) * k
  }
}

if (import.meta.env.DEV) Object.assign(window, { __jazzLooks: LOOKS }) // test hook: tune the looks live (scripts/grade-shots.mjs)
