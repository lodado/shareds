import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from 'three'

import type { PauseReason, RenderBlock } from '../../model/game-session.ts'

export interface GameView {
  render: (blocks: readonly RenderBlock[]) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

interface ViewHost {
  pause: (reason: PauseReason) => void
  resume: (reason: PauseReason) => void
}

const VIEW_HEIGHT = 12
const CAMERA_FOLLOW = 0.1

const colorFor = (block: RenderBlock): Color =>
  new Color().setHSL(((block.tint * 0.07) % 1 + 0.55) % 1, 0.55, block.kind === 'falling' ? 0.45 : 0.6)

// Reads interpolated poses only; never writes simulation state.
export function createGameView(canvas: HTMLCanvasElement, host: ViewHost): GameView {
  const renderer = new WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  const scene = new Scene()
  scene.background = new Color('#1d2230')
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
  scene.add(new AmbientLight('#ffffff', 1.2), new DirectionalLight('#ffffff', 2.2))
  scene.children[1]?.position.set(4, 10, 6)

  // One unit cube shared by every mesh; freed once in dispose, never per block.
  const geometry = new BoxGeometry(1, 1, 1)
  const meshes = new Map<number, Mesh<BoxGeometry, MeshStandardMaterial>>()
  let cameraY = 0
  let disposed = false

  const onContextLost = (event: Event): void => {
    event.preventDefault()
    host.pause('context-lost')
  }
  const onContextRestored = (): void => host.resume('context-lost')
  canvas.addEventListener('webglcontextlost', onContextLost)
  canvas.addEventListener('webglcontextrestored', onContextRestored)

  function removeMesh(id: number): void {
    const mesh = meshes.get(id)
    if (!mesh) return
    scene.remove(mesh)
    mesh.material.dispose()
    meshes.delete(id)
  }

  function sync(blocks: readonly RenderBlock[]): number {
    const seen = new Set<number>()
    let top = 0
    for (const block of blocks) {
      seen.add(block.id)
      let mesh = meshes.get(block.id)
      if (!mesh) {
        mesh = new Mesh(geometry, new MeshStandardMaterial({ color: colorFor(block) }))
        meshes.set(block.id, mesh)
        scene.add(mesh)
      }
      if (block.kind === 'falling') mesh.material.color.copy(colorFor(block))
      mesh.position.set(block.x, block.y, block.z)
      mesh.scale.set(block.w, block.h, block.d)
      if (block.kind !== 'falling') top = Math.max(top, block.y)
    }
    for (const id of meshes.keys()) if (!seen.has(id)) removeMesh(id)
    return top
  }

  return {
    render(blocks) {
      if (disposed) return
      const top = sync(blocks)
      // Presentation-only easing; the rules never read cameraY.
      cameraY += (top - cameraY) * CAMERA_FOLLOW
      camera.position.set(8, cameraY + 8, 8)
      camera.lookAt(0, cameraY, 0)
      renderer.render(scene, camera)
    },
    resize(width, height) {
      if (disposed || width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      const aspect = width / height
      camera.left = (-VIEW_HEIGHT * aspect) / 2
      camera.right = (VIEW_HEIGHT * aspect) / 2
      camera.top = VIEW_HEIGHT / 2
      camera.bottom = -VIEW_HEIGHT / 2
      camera.updateProjectionMatrix()
    },
    dispose() {
      if (disposed) return
      disposed = true
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      for (const id of [...meshes.keys()]) removeMesh(id)
      geometry.dispose()
      renderer.dispose()
    },
  }
}
