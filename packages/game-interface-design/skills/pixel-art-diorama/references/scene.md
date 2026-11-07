# Scene

## Building rules

- Boxes first. People are box dolls (thighs, shins, shoes, torso, trim, head, two hair pieces, arms)
  hung on joint groups; poses are joint rotations layered on a neutral reset each frame (walk, run,
  kick, celebrate, wave, sit, dive, clap, crouch, throw, handshake).
- Crowds and dolls are instanced (see [draw calls](draw-calls.md)); a crowd's jump height follows its
  team's excitement and stops updating once it has settled.
- Small things are drawn larger than life: the 0.1 m ball is drawn at 1.6× so it never shrinks to a
  single pixel; its centre is raised by the extra radius so it still touches the floor.
- Floors sit above whatever they cover (`FLOOR_Y = 0.03` m over the grass), and every person, the
  ball and the pass marker add the same constant. At 0.005 m the court and the grass cap's triangle
  fan z-fought into green star patches.
- Text and boards are textures: a 64×32 `DataTexture` scoreboard drawn from a 3×5 pixel font and
  redrawn only when its state key changes (rows flipped: a `DataTexture` starts at the bottom), a
  sign on a canvas texture, clock hands as pivots.
- A floating island needs a deep underside to read at 31°: the worked example's rock layers drop about 28 m in
  total, and the wide view aims 6 m below the grass so the underside is in frame.

## Light

- Hemisphere fill, one shadow-casting directional light, four floodlight spot lights with `decay: 0`
  (physical falloff over 25 m would need intensities in the hundreds) and a point light for the
  photographer's flash.
- Day, dusk and night are rows of values. Floodlights and the flash switch with `intensity = 0`,
  never `visible = false`: changing the number of lights recompiles every material's shader, which
  shows as a hitch.
- Lamp faces share one dedicated unlit material that is recoloured per time of day. Using the shared
  `kit.flat(colour)` material there recoloured every other mesh of that colour.
- Shadow map: size it to the screen. With a 270 px tall frame, 1024² over ±40 m (7.8 cm a texel) is
  already finer than what is shown; 2048² cost four times the fill for nothing visible.

```ts
// src/widgets/diorama-stage/lib/lights.ts
import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
  PCFShadowMap,
  PointLight,
  SpotLight,
  type WebGLRenderer,
} from 'three'

import { LIGHTING, type TimeOfDay } from '../model/lighting'

export interface LightRig {
  group: Group
  background: Color
  setTime(t: TimeOfDay): void
  /** Fires the photographer's flash; it decays over the next frames. */
  flash(): void
  update(dt: number): void
  dispose(): void
}

const SHADOW_HALF = 40

export function buildLights(
  renderer: WebGLRenderer,
  pylonHeads: readonly { x: number; y: number; z: number }[],
  lampFaces: readonly Mesh[],
  photographer: { x: number; z: number },
): LightRig {
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  const group = new Group()
  const background = new Color()

  const hemi = new HemisphereLight()
  group.add(hemi)

  const sun = new DirectionalLight()
  sun.castShadow = true
  // ±40 m over 1024 texels ≈ 7.8 cm a texel, finer than the ~270 px tall frame shows
  sun.shadow.mapSize.set(1024, 1024)
  const cam = sun.shadow.camera
  cam.left = cam.bottom = -SHADOW_HALF
  cam.right = cam.top = SHADOW_HALF
  cam.near = 1
  cam.far = 160
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.03
  const sunTarget = new Object3D()
  sunTarget.position.set(0, 0, -3)
  sun.target = sunTarget
  group.add(sun, sunTarget)

  const spots = pylonHeads.map((p) => {
    const s = new SpotLight('#fff1d6', 0, 0, 0.78, 0.45, 0)
    s.position.set(p.x, p.y, p.z)
    // aim each lamp at the far half of the court from its corner
    s.target.position.set(-p.x * 0.15, 0, -p.z * 0.1)
    group.add(s, s.target)
    return s
  })

  const flashLight = new PointLight('#fffaf0', 0, 16, 0)
  flashLight.position.set(photographer.x, 2.2, photographer.z - 0.6)
  group.add(flashLight)
  let flashLevel = 0

  return {
    group,
    background,
    setTime(t) {
      const L = LIGHTING[t]
      background.set(L.background)
      hemi.color.set(L.hemiSky)
      hemi.groundColor.set(L.hemiGround)
      hemi.intensity = L.hemiIntensity
      sun.color.set(L.sunColor)
      sun.intensity = L.sunIntensity
      sun.position.set(L.sunDir.x * 70, L.sunDir.y * 70, L.sunDir.z * 70 - 3)
      for (const s of spots) {
        s.intensity = L.floodlights
        // intensity only: toggling visibility would change the light count and recompile shaders
        if (!L.floodlightsOn) s.intensity = 0
      }
      for (const f of lampFaces) (f.material as MeshBasicMaterial).color.set(L.floodlightsOn ? '#fff1d6' : '#6b6b70')
    },
    flash() {
      flashLevel = 1
    },
    update(dt) {
      flashLevel = Math.max(0, flashLevel - dt * 6)
      flashLight.intensity = flashLevel * 4
    },
    dispose() {
      sun.shadow.map?.dispose()
    },
  }
}
```

## The world class

Builds everything, bakes the static groups once the lights have read their anchors, reads the
simulation into meshes every frame, eases and snaps the camera, toggles the cutaway, renders through
the pipeline and picks court points for clicks.

```ts
// src/widgets/diorama-stage/lib/world.ts
import {
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Plane,
  Raycaster,
  RingGeometry,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'

import type { MatchSim } from '../../../features/match-sim'
import { BALL_RADIUS, COURT, type SurfaceId } from '../../../shared/config'
import type { Vec2 } from '../../../shared/lib'
import {
  azimuthForStep,
  type CameraMode,
  cameraDirection,
  easeAngle,
  followTarget,
  nearSides,
  snapToTexel,
  type Vec3,
  VIEW_HALF_HEIGHT,
} from '../model/camera'
import { LIGHTING, type TimeOfDay } from '../model/lighting'
import { bakeStatic } from './bake'
import { buildCourt, type CourtParts, FLOOR_Y } from './court'
import { buildCrowd, type CrowdParts } from './crowd'
import { buildIsland, type IslandParts } from './island'
import { buildLights, type LightRig } from './lights'
import { MaterialKit } from './materials'
import { buildPeople, type PeopleParts } from './people'
import { PixelPipeline } from './pipeline'
import { boardInk, buildSchool, type SchoolParts } from './school'

export interface WorldView {
  surface: SurfaceId
  time: TimeOfDay
  mode: CameraMode
  /** Rotation step; the azimuth is 45° + step·90°. */
  rotation: number
  reducedMotion: boolean
}

export interface WorldInfo {
  width: number
  height: number
  calls: number
  triangles: number
  azimuth: number
  nearSides: string[]
}

const CAMERA_DISTANCE = 90
/** Drawn ball radius; larger than the real 0.1 m so it never shrinks to one pixel. */
const BALL_DRAW_SCALE = 1.6

/** The whole three.js diorama for one canvas. */
export class DioramaWorld {
  private readonly renderer: WebGLRenderer
  private readonly pipeline = new PixelPipeline()
  private readonly scene = new Scene()
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 1, 190)
  private readonly kit = new MaterialKit()
  private readonly court: CourtParts
  private readonly island: IslandParts
  private readonly school: SchoolParts
  private readonly crowd: CrowdParts
  private readonly lights: LightRig
  private people: PeopleParts
  private readonly ball: Mesh
  private readonly ring: Mesh
  private readonly owned: { dispose(): void }[] = []
  private sim: MatchSim
  private view: WorldView
  private azimuth: number
  private halfHeight: number
  private target: Vec3 = { x: 0, y: 0, z: 0 }
  private flashesSeen = 0
  private elapsed = 0
  private raycaster = new Raycaster()
  private ground = new Plane(new Vector3(0, 1, 0), 0)

  constructor(canvas: HTMLCanvasElement, sim: MatchSim, view: WorldView) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(1)
    // two passes per frame: reset the counters by hand so info() covers both
    this.renderer.info.autoReset = false
    this.sim = sim
    this.view = view
    this.azimuth = azimuthForStep(view.rotation)
    this.halfHeight = VIEW_HALF_HEIGHT[view.mode]
    this.target = followTarget(view.mode, { x: sim.ball.x, z: sim.ball.z })

    this.island = buildIsland(this.kit)
    this.court = buildCourt(this.kit, view.surface)
    this.school = buildSchool(this.kit)
    this.crowd = buildCrowd(this.kit)
    this.lights = buildLights(this.renderer, this.island.pylonHeads, this.island.lampFaces, sim.staff.photographer.pos)
    this.people = buildPeople(this.kit, sim.agents)
    this.scene.add(
      this.island.group,
      this.court.group,
      this.school.group,
      this.crowd.group,
      this.lights.group,
      this.people.group,
    )
    this.scene.background = this.lights.background
    // after the lights read the pylon heads: merge everything static per material
    for (const g of [this.island.group, this.court.group, this.school.group, this.crowd.group])
      this.owned.push(...bakeStatic(g))

    const ballGeo = new IcosahedronGeometry(BALL_RADIUS * BALL_DRAW_SCALE, 1)
    this.owned.push(ballGeo)
    this.ball = new Mesh(ballGeo, this.kit.mat('#fffaf0'))
    this.ball.castShadow = true
    this.ball.name = 'ball'
    this.scene.add(this.ball)

    const ringGeo = new RingGeometry(0.42, 0.62, 12)
    ringGeo.rotateX(-Math.PI / 2)
    const ringMat = new MeshBasicMaterial({ color: '#fff04a' })
    this.owned.push(ringGeo, ringMat)
    this.ring = new Mesh(ringGeo, ringMat)
    this.ring.position.y = FLOOR_Y + 0.03
    this.ring.visible = false
    this.scene.add(this.ring)

    this.lights.setTime(view.time)
    this.school.setGlow(LIGHTING[view.time].glow)
  }

  setSim(sim: MatchSim): void {
    if (sim === this.sim) return
    this.sim = sim
    this.scene.remove(this.people.group)
    this.people.dispose()
    this.people = buildPeople(this.kit, sim.agents)
    this.scene.add(this.people.group)
    this.flashesSeen = sim.flashes
  }

  setView(next: Partial<WorldView>): void {
    const prev = this.view
    this.view = { ...prev, ...next }
    if (next.surface && next.surface !== prev.surface) this.court.setSurface(next.surface)
    if (next.time && next.time !== prev.time) {
      this.lights.setTime(next.time)
      this.school.setGlow(LIGHTING[next.time].glow)
    }
    if (this.view.reducedMotion) {
      this.azimuth = azimuthForStep(this.view.rotation)
      this.halfHeight = VIEW_HALF_HEIGHT[this.view.mode]
    }
  }

  /** Size in CSS pixels plus the device pixel ratio; the canvas buffer becomes the low-res size. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const { w, h } = PixelPipeline.lowResSize(cssW * dpr, cssH * dpr)
    this.renderer.setSize(w, h, false)
    this.pipeline.setSize(w, h)
  }

  render(dt: number): void {
    this.renderer.info.reset()
    this.elapsed += dt
    const t = this.elapsed
    const sim = this.sim
    const reduced = this.view.reducedMotion

    // ---- read the sim into the meshes
    this.people.update(dt, t)
    const b = sim.ball
    this.ball.position.set(b.x, FLOOR_Y + b.y + BALL_RADIUS * (BALL_DRAW_SCALE - 1), b.z)
    this.ball.rotation.x += b.vz * dt * 4
    this.ball.rotation.z -= b.vx * dt * 4
    if (sim.mark) {
      this.ring.visible = true
      this.ring.position.x = sim.mark.x
      this.ring.position.z = sim.mark.z
      this.ring.scale.setScalar(reduced ? 1 : 1 + Math.sin(t * 6) * 0.12)
    } else this.ring.visible = false

    this.school.setDoor(sim.doorOpen)
    this.school.setClock(sim.time)
    this.school.waveFlag(t)
    const snap = sim.store.get()
    const kitOf = (side: 'home' | 'away') => sim.teams[side].club.kit
    this.school.setBoard(
      {
        home: snap.home.short,
        away: snap.away.short,
        scoreHome: snap.score.home,
        scoreAway: snap.score.away,
        clockText: snap.clockText,
        foulsHome: snap.fouls.home,
        foulsAway: snap.fouls.away,
        half: snap.half,
      },
      boardInk(kitOf('home').shirt, kitOf('home').trim),
      boardInk(kitOf('away').shirt, kitOf('away').trim),
    )
    this.crowd.update(t, sim.excitement, reduced)
    if (sim.flashes !== this.flashesSeen) {
      this.flashesSeen = sim.flashes
      if (!reduced) this.lights.flash()
    }
    this.lights.update(dt)
    this.island.swings.forEach((s, i) => {
      s.rotation.x = reduced ? 0 : Math.sin(t * 1.7 + i * 1.3) * 0.22
    })

    // ---- camera
    const goalAz = azimuthForStep(this.view.rotation)
    this.azimuth = easeAngle(this.azimuth, goalAz, dt, reduced)
    const goalH = VIEW_HALF_HEIGHT[this.view.mode]
    this.halfHeight = reduced ? goalH : this.halfHeight + (goalH - this.halfHeight) * (1 - Math.exp(-dt * 5))
    const aim = followTarget(this.view.mode, { x: b.x, z: b.z })
    const k = 1 - Math.exp(-dt * (this.view.mode === 'close' ? 5 : 2.6))
    this.target = {
      x: this.target.x + (aim.x - this.target.x) * k,
      y: 0,
      z: this.target.z + (aim.z - this.target.z) * k,
    }

    const lowW = this.pipeline.width
    const lowH = this.pipeline.height
    const aspect = lowW / lowH
    const hh = this.halfHeight
    const cam = this.camera
    cam.left = -hh * aspect
    cam.right = hh * aspect
    cam.top = hh
    cam.bottom = -hh
    cam.updateProjectionMatrix()
    const dir = cameraDirection(this.azimuth)
    const place = (p: Vec3) => {
      cam.position.set(p.x + dir.x * CAMERA_DISTANCE, p.y + dir.y * CAMERA_DISTANCE, p.z + dir.z * CAMERA_DISTANCE)
      cam.lookAt(p.x, p.y, p.z)
      cam.updateMatrixWorld()
    }
    place(this.target)
    const e = cam.matrixWorld.elements
    const right = { x: e[0]!, y: e[1]!, z: e[2]! }
    const up = { x: e[4]!, y: e[5]!, z: e[6]! }
    place(snapToTexel(this.target, right, up, (2 * hh) / lowH))

    const near = nearSides(this.azimuth)
    this.court.setCut(near)
    this.school.setCut(near.includes('north'))

    this.pipeline.render(this.renderer, this.scene, cam, cam.far - cam.near, (2 * hh) / lowH)
  }

  /** Court point under a client-space pointer, or null off the court. */
  pick(clientX: number, clientY: number, rect: DOMRect): Vec2 | null {
    const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = new Vector3()
    if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return null
    if (Math.abs(hit.x) > COURT.halfWidth || Math.abs(hit.z) > COURT.halfLength) return null
    return { x: hit.x, z: hit.z }
  }

  info(): WorldInfo {
    return {
      width: this.pipeline.width,
      height: this.pipeline.height,
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      azimuth: this.azimuth,
      nearSides: nearSides(this.azimuth),
    }
  }

  dispose(): void {
    this.people.dispose()
    this.court.dispose()
    this.island.dispose()
    this.school.dispose()
    this.crowd.dispose()
    this.lights.dispose()
    for (const o of this.owned) o.dispose()
    this.kit.dispose()
    this.pipeline.dispose()
    this.renderer.dispose()
  }
}
```

## People

```ts
// src/widgets/diorama-stage/lib/people.ts
import { Color, Group, InstancedMesh, Matrix4, Object3D } from 'three'

import type { Agent } from '../../../features/match-sim'
import { FLOOR_Y } from './court'
import type { MaterialKit } from './materials'

/** One box of a doll: an empty node posed by the rig, drawn as one instance. */
interface Part {
  node: Object3D
  hex: string
}

interface Rig {
  agent: Agent
  parts: Part[]
  root: Group
  hips: Group
  body: Group
  thighL: Group
  thighR: Group
  kneeL: Group
  kneeR: Group
  armL: Group
  armR: Group
  legLen: number
  stride: number
}

export interface PeopleParts {
  group: Group
  update(dt: number, t: number): void
  dispose(): void
}

const HIDDEN = new Matrix4().makeScale(0, 0, 0)

/**
 * One box doll per agent, posed every frame from the agent's pose and velocity.
 * The rigs live outside the scene; every box of every doll is one instance of a
 * single instanced mesh, so all people cost one draw call (plus one for shadows).
 */
export function buildPeople(kit: MaterialKit, agents: readonly Agent[]): PeopleParts {
  const group = new Group()
  const rigHolder = new Object3D()
  const rigs: Rig[] = agents.map((a) => buildRig(a))
  for (const r of rigs) rigHolder.add(r.root)

  const total = rigs.reduce((n, r) => n + r.parts.length, 0)
  // white toon material: the instance colour carries each part's colour
  const dolls = new InstancedMesh(kit.box, kit.mat('#ffffff'), total)
  dolls.castShadow = true
  // instances move every frame; a bounding sphere computed once would go stale
  dolls.frustumCulled = false
  dolls.name = 'people'
  const color = new Color()
  let i = 0
  for (const r of rigs) for (const p of r.parts) dolls.setColorAt(i++, color.set(p.hex))
  group.add(dolls)

  return {
    group,
    update(dt, t) {
      for (const r of rigs) pose(r, dt, t)
      rigHolder.updateMatrixWorld(true)
      let k = 0
      for (const r of rigs) {
        const shown = r.agent.visible
        for (const p of r.parts) dolls.setMatrixAt(k++, shown ? p.node.matrixWorld : HIDDEN)
      }
      dolls.instanceMatrix.needsUpdate = true
    },
    dispose() {
      dolls.dispose()
      group.clear()
    },
  }
}

function buildRig(a: Agent): Rig {
  const parts: Part[] = []
  const part = (parent: Group, hex: string, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const node = new Object3D()
    node.scale.set(w, h, d)
    node.position.set(x, y, z)
    parent.add(node)
    parts.push({ node, hex })
  }
  const H = a.look.height
  const legLen = H * 0.46
  const torso = H * 0.32
  const head = H * 0.15
  const root = new Group()
  root.name = `agent-${a.id}`
  const hips = new Group()
  hips.position.y = legLen
  root.add(hips)

  const leg = (side: number) => {
    const thigh = new Group()
    thigh.position.set(side * H * 0.065, 0, 0)
    hips.add(thigh)
    part(thigh, a.look.shorts, H * 0.09, legLen * 0.5, H * 0.1, 0, -legLen * 0.25, 0)
    const knee = new Group()
    knee.position.y = -legLen * 0.5
    thigh.add(knee)
    part(knee, a.look.socks, H * 0.075, legLen * 0.42, H * 0.085, 0, -legLen * 0.21, 0)
    part(knee, '#2b2730', H * 0.085, legLen * 0.08, H * 0.13, 0, -legLen * 0.46, H * 0.02)
    return [thigh, knee] as const
  }
  const [thighL, kneeL] = leg(-1)
  const [thighR, kneeR] = leg(1)

  const body = new Group()
  hips.add(body)
  part(body, a.look.shirt, H * 0.28, torso, H * 0.15, 0, torso / 2, 0)
  part(body, a.look.trim, H * 0.29, torso * 0.12, H * 0.16, 0, torso * 0.94, 0)
  part(body, a.look.skin, head, head, head, 0, torso + head / 2 + H * 0.01, 0)
  part(body, a.look.hair, head * 1.04, head * 0.35, head * 1.04, 0, torso + head * 0.92, -head * 0.04)
  part(body, a.look.hair, head * 1.04, head * 0.6, head * 0.25, 0, torso + head * 0.65, -head * 0.42)

  const arm = (side: number) => {
    const g = new Group()
    g.position.set(side * H * 0.18, torso * 0.9, 0)
    body.add(g)
    part(g, a.look.shirt, H * 0.075, H * 0.11, H * 0.08, 0, -H * 0.05, 0)
    part(g, a.look.skin, H * 0.06, H * 0.22, H * 0.065, 0, -H * 0.2, 0)
    return g
  }
  const armL = arm(-1)
  const armR = arm(1)

  return {
    agent: a,
    parts,
    root,
    hips,
    body,
    thighL,
    thighR,
    kneeL,
    kneeR,
    armL,
    armR,
    legLen,
    stride: 0,
  }
}

function pose(r: Rig, dt: number, t: number): void {
  const a = r.agent
  // hidden dolls are drawn as zero-scale instances by the caller
  if (!a.visible) return
  r.root.position.set(a.pos.x, FLOOR_Y + Math.max(0, a.lift), a.pos.z)
  r.root.rotation.y = a.facing

  const speed = Math.hypot(a.vel.x, a.vel.z)
  r.stride += speed * dt * 3.4
  const s = Math.sin(r.stride)
  const amp = Math.min(0.95, speed * 0.17)

  // reset to neutral, then layer the pose
  r.hips.position.y = r.legLen
  r.hips.rotation.set(0, 0, 0)
  r.body.rotation.set(0, 0, 0)
  for (const g of [r.thighL, r.thighR, r.kneeL, r.kneeR, r.armL, r.armR]) g.rotation.set(0, 0, 0)
  r.armL.rotation.z = -0.08
  r.armR.rotation.z = 0.08

  const moving = () => {
    // forward is +z, so a leg swings forward with a negative x rotation
    r.thighL.rotation.x = -s * amp
    r.thighR.rotation.x = s * amp
    r.kneeL.rotation.x = Math.max(0, s) * amp * 1.3
    r.kneeR.rotation.x = Math.max(0, -s) * amp * 1.3
    r.armL.rotation.x = s * amp * 0.9
    r.armR.rotation.x = -s * amp * 0.9
    r.body.rotation.x = amp * 0.18
    r.hips.position.y = r.legLen + Math.abs(Math.cos(r.stride)) * amp * 0.05
  }

  switch (a.pose) {
    case 'walk':
    case 'run':
    case 'idle':
      if (speed > 0.15) moving()
      else r.body.rotation.x = Math.sin(t * 2 + a.pos.x) * 0.02
      break
    case 'kick':
      r.thighR.rotation.x = -1.15
      r.kneeR.rotation.x = 0.2
      r.thighL.rotation.x = 0.15
      r.armL.rotation.z = -0.9
      r.armR.rotation.z = 0.6
      r.body.rotation.x = -0.12
      break
    case 'celebrate':
      if (speed > 0.15) moving()
      r.armL.rotation.z = -2.6 + Math.sin(t * 9) * 0.2
      r.armR.rotation.z = 2.6 - Math.sin(t * 9) * 0.2
      break
    case 'wave':
      r.armR.rotation.z = 2.5 + Math.sin(t * 10) * 0.35
      break
    case 'sit':
      r.hips.position.y = 0.48
      r.thighL.rotation.x = r.thighR.rotation.x = -1.5
      r.kneeL.rotation.x = r.kneeR.rotation.x = 1.5
      r.armL.rotation.x = r.armR.rotation.x = -0.5
      break
    case 'crouch':
      r.hips.position.y = r.legLen * 0.62
      r.thighL.rotation.x = r.thighR.rotation.x = -1.1
      r.kneeL.rotation.x = r.kneeR.rotation.x = 1.75
      r.body.rotation.x = 0.35
      r.armL.rotation.x = r.armR.rotation.x = -0.9
      break
    case 'dive': {
      // fall toward the side the keeper is moving to (local x)
      const lateral = a.vel.x * Math.cos(a.facing) - a.vel.z * Math.sin(a.facing)
      const side = lateral >= 0 ? 1 : -1
      r.hips.position.y = r.legLen * 0.55
      // a positive z rotation tips +y toward -x, so falling toward +x is negative
      r.hips.rotation.z = -side * 1.3
      r.armL.rotation.z = -2.9
      r.armR.rotation.z = 2.9
      break
    }
    case 'clap': {
      const c = Math.sin(t * 16) * 0.25
      r.armL.rotation.set(-1.25, 0, 0.35 + c)
      r.armR.rotation.set(-1.25, 0, -0.35 - c)
      break
    }
    case 'throw':
      r.armL.rotation.x = r.armR.rotation.x = -2.9
      r.body.rotation.x = -0.15
      break
    case 'handshake':
      if (speed > 0.15) moving()
      r.armR.rotation.x = -1.15 + Math.sin(t * 12) * 0.12
      break
  }
}
```
