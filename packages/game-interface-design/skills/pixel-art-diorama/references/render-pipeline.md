# Render pipeline

Half of the pixel look comes from drawing small and enlarging without smoothing; the other half
from one post shader that outlines, dithers and snaps to a palette. The code below is the complete
working implementation, unabridged.

## Draw small, enlarge by whole pixels

- Render into a `WebGLRenderTarget` about 270 px tall (`LOW_RES_HEIGHT`) with a `DepthTexture`,
  `NearestFilter` for min and mag, no mipmaps, `SRGBColorSpace` (SRGB8_ALPHA8 keeps more steps in
  the darks than a linear 8-bit target).
- `lowResSize` picks the integer scale from the canvas height in device pixels
  (`round(deviceH / 270)`, at least 1) and divides both sides by it, so the low-res image maps to
  whole screen pixels. The canvas buffer itself is the low-res size; CSS stretches it.
- Renderer: `antialias: false`, `setPixelRatio(1)`, and on the canvas
  `image-rendering: pixelated` so the browser enlarges without filtering.
- `renderer.info.autoReset = false` with `info.reset()` at the start of each frame: two passes run
  per frame (scene into the target, then the quad), and the counters should cover both.

## The post shader, step by step

1. **Linear → sRGB.** three keeps lighting in linear space; the shader converts before comparing
   against a palette written in sRGB. `colorspace_fragment` is not included: the result is already
   sRGB and is written as is.
2. **Depth outline.** Orthographic depth is linear between near and far, so `depth × (far − near)`
   is metres. A pixel whose neighbour is farther by more than the threshold is a silhouette pixel
   and is multiplied by a dark warm tint of its own fill (`vec3(0.42, 0.33, 0.36)`), not painted
   black; that reads like a hand-drawn outline. The threshold is `0.2 + texelWorld × 2.5`: at 31°
   even a flat floor changes depth by `texel × cot 31°` per pixel, so a fixed threshold draws lines
   across the floor on wide views.
3. **Ordered dither, dark midtones only.** A Bayer 4×4 offset of ±0.035 is added only where luminance
   is between 0.08 and 0.42. Lit flat areas stay clean; shadows get the stipple that pixel artists
   put there by hand.
4. **Nearest palette colour.** Plain RGB distance over `PAL_N` uniforms; `PAL_N` is a define so the
   loop has a constant bound. This step is what turns a 3D render into pixel art.

The GLSL lives in `.glsl` files imported with Vite's `?raw`. Keeping it inside a TypeScript string
made a lint guard read `void main()` as a `void` expression.

```glsl
// src/widgets/diorama-stage/lib/pixel.vert.glsl
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
```

```glsl
// src/widgets/diorama-stage/lib/pixel.frag.glsl
// PAL_N comes in as a define from pipeline.ts
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform vec3 palette[PAL_N];
uniform float depthRange;
uniform float edgeThreshold;
varying vec2 vUv;

vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// orthographic depth is linear in [0, 1] between near and far
float depthAt(vec2 uv) {
  return texture2D(tDepth, uv).x * depthRange;
}

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16];
  m[0] = 0.0;  m[1] = 8.0;  m[2] = 2.0;  m[3] = 10.0;
  m[4] = 12.0; m[5] = 4.0;  m[6] = 14.0; m[7] = 6.0;
  m[8] = 3.0;  m[9] = 11.0; m[10] = 1.0; m[11] = 9.0;
  m[12] = 15.0; m[13] = 7.0; m[14] = 13.0; m[15] = 5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) { if (k == i) v = m[k]; }
  return (v + 0.5) / 16.0;
}

void main() {
  vec2 px = 1.0 / resolution;
  vec3 c = toSRGB(texture2D(tColor, vUv).rgb);
  float d = depthAt(vUv);
  float edge = max(
    max(depthAt(vUv - vec2(px.x, 0.0)) - d, depthAt(vUv + vec2(px.x, 0.0)) - d),
    max(depthAt(vUv - vec2(0.0, px.y)) - d, depthAt(vUv + vec2(0.0, px.y)) - d)
  );
  // silhouette pixels: a dark warm tint of their own fill
  if (edge > edgeThreshold) c *= vec3(0.42, 0.33, 0.36);
  // ordered dither only in the dark midtones, so flat lit areas stay clean
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  if (lum > 0.08 && lum < 0.42) c += (bayer4(gl_FragCoord.xy) - 0.5) * 0.07;
  vec3 best = palette[0];
  float bestD = 1e9;
  for (int i = 0; i < PAL_N; i++) {
    vec3 e = c - palette[i];
    float dd = dot(e, e);
    if (dd < bestD) { bestD = dd; best = palette[i]; }
  }
  gl_FragColor = vec4(best, 1.0);
}
```

```ts
// src/widgets/diorama-stage/lib/pipeline.ts
import {
  type Camera,
  DepthTexture,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  type Scene,
  Scene as ThreeScene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedIntType,
  Vector2,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'

import { hexToRgb } from '../../../shared/lib'
import { PALETTE } from '../model/palette'
import fragmentShader from './pixel.frag.glsl?raw'
import vertexShader from './pixel.vert.glsl?raw'

/** Target height of the low-res buffer in pixels. */
export const LOW_RES_HEIGHT = 270

/** Renders the scene into a low-res target, then outlines and quantizes it onto the canvas. */
export class PixelPipeline {
  readonly target: WebGLRenderTarget
  private readonly post = new ThreeScene()
  private readonly postCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly material: ShaderMaterial
  private readonly quad: Mesh
  width = 1
  height = 1

  constructor() {
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      depthTexture: new DepthTexture(1, 1, UnsignedIntType),
      colorSpace: SRGBColorSpace,
    })
    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      defines: { PAL_N: PALETTE.length },
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: this.target.depthTexture },
        resolution: { value: new Vector2(1, 1) },
        palette: {
          value: PALETTE.map((hex) => {
            const [r, g, b] = hexToRgb(hex)
            return new Vector3(r / 255, g / 255, b / 255)
          }),
        },
        depthRange: { value: 1 },
        edgeThreshold: { value: 0.3 },
      },
    })
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.post.add(this.quad)
  }

  /** Low-res size for a canvas of `deviceW × deviceH` device pixels. */
  static lowResSize(deviceW: number, deviceH: number): { w: number; h: number; scale: number } {
    const scale = Math.max(1, Math.round(deviceH / LOW_RES_HEIGHT))
    return {
      w: Math.max(1, Math.round(deviceW / scale)),
      h: Math.max(1, Math.round(deviceH / scale)),
      scale,
    }
  }

  setSize(w: number, h: number): void {
    this.width = w
    this.height = h
    this.target.setSize(w, h)
    ;(this.material.uniforms.resolution!.value as Vector2).set(w, h)
  }

  /**
   * @param depthRange far − near of the orthographic camera (depth is linear).
   * @param texelWorld world metres per low-res pixel; the outline threshold scales with it.
   */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera, depthRange: number, texelWorld: number): void {
    this.material.uniforms.depthRange!.value = depthRange
    this.material.uniforms.edgeThreshold!.value = 0.2 + texelWorld * 2.5
    renderer.setRenderTarget(this.target)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(this.post, this.postCamera)
  }

  dispose(): void {
    this.target.depthTexture?.dispose()
    this.target.dispose()
    this.material.dispose()
    this.quad.geometry.dispose()
  }
}
```

## Palette

Ramps of three or four per material family, plus one entry for every colour that must stay apart
after quantizing: each team kit, each floor surface, each sky. A unit test checks that every kit
colour lands on a palette colour of its own and stays close to it; without it two teams can collapse
into one colour.

```ts
// src/widgets/diorama-stage/model/palette.ts
import { hexToRgb } from '../../../shared/lib'

/**
 * Colours the post shader snaps every pixel to (sRGB). Ramps of three or four per
 * material family; the club kits, the four court surfaces and the sky for each time
 * of day each have an entry of their own so quantizing keeps them apart.
 */
export const PALETTE: readonly string[] = [
  // warm darks and browns (outlines, hair, wood)
  '#1f1b24',
  '#2b2730',
  '#4a2f33',
  '#6b4443',
  '#8c5a46',
  '#b07a52',
  // skin and parquet
  '#d29c66',
  '#e9c08a',
  '#f6dcac',
  '#a87a48',
  '#c89a5e',
  // whites and greys (lines, asphalt, concrete)
  '#fffaf0',
  '#fbf7ee',
  '#cdbdb4',
  '#9a9aa0',
  '#7a7a7e',
  '#6b6b70',
  '#45434a',
  // blues (court, sky, windows)
  '#1d2f55',
  '#2f5a95',
  '#3a6fb6',
  '#6f9fd8',
  '#a8cdf0',
  '#d6ecfa',
  // greens (grass, turf, trees, mint keeper)
  '#24452a',
  '#2f5a2a',
  '#4c8a3c',
  '#6aa84f',
  '#9cd06a',
  '#8ee6c8',
  // yellows and oranges (kits, hi-vis, lamps)
  '#fff04a',
  '#f9d268',
  '#d8f04a',
  '#f5a64f',
  '#c96f2f',
  // reds and pinks (kits, goals, roof)
  '#7a1f2b',
  '#b8282f',
  '#e8323c',
  '#c9505a',
  '#f08cc0',
  '#f9c4dc',
  // dusk and night skies
  '#2a2347',
  '#3d3466',
  '#6a4f8a',
  '#e98a6a',
  '#f2b38a',
]

const RGB = PALETTE.map(hexToRgb)

/** Index of the nearest palette colour (plain RGB distance, as in the shader). */
export function nearestPaletteIndex(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  let best = 0
  let bestD = Infinity
  RGB.forEach(([pr, pg, pb], i) => {
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}
```

## Toon ramp and the material kit

A three-step gradient map (128, 200, 255) splits light into lit, mid and shadow with hard steps, like
cel shading. The kit shares one unit box and caches one material per colour, so building the scene
creates few materials; anything that changes per instance (emissive windows, a recoloured lamp, a
swapped floor) takes an owned material instead of a cached one, or every mesh of that colour changes
with it.

```ts
// src/widgets/diorama-stage/lib/materials.ts
import {
  BoxGeometry,
  DataTexture,
  type Material,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  type Side,
  FrontSide,
} from 'three'

/** Three-step toon ramp; the floor (0.5) keeps shadowed faces readable. */
function toonRamp(): DataTexture {
  const tex = new DataTexture(new Uint8Array([128, 200, 255]), 3, 1, RedFormat)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/** Shared per world: geometries and materials are reused across meshes. */
export class MaterialKit {
  readonly ramp = toonRamp()
  /** Unit cube, scaled per mesh. */
  readonly box = new BoxGeometry(1, 1, 1)
  private toon = new Map<string, MeshToonMaterial>()
  private basic = new Map<string, MeshBasicMaterial>()

  /** Lit toon material for an sRGB hex colour. */
  mat(hex: string, side: Side = FrontSide): MeshToonMaterial {
    const key = `${hex}|${side}`
    let m = this.toon.get(key)
    if (!m) {
      m = new MeshToonMaterial({ color: hex, gradientMap: this.ramp, side })
      this.toon.set(key, m)
    }
    return m
  }

  /** Unlit colour (lamp faces, marker). */
  flat(hex: string): MeshBasicMaterial {
    let m = this.basic.get(hex)
    if (!m) {
      m = new MeshBasicMaterial({ color: hex })
      this.basic.set(hex, m)
    }
    return m
  }

  /** A fresh toon material that is not shared (emissive windows, door, flag). */
  own(hex: string, extra: ConstructorParameters<typeof MeshToonMaterial>[0] = {}): MeshToonMaterial {
    return new MeshToonMaterial({
      color: hex,
      gradientMap: this.ramp,
      ...extra,
    })
  }

  dispose(): void {
    const all: Material[] = [...this.toon.values(), ...this.basic.values()]
    for (const m of all) m.dispose()
    this.box.dispose()
    this.ramp.dispose()
  }
}
```
