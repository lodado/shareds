import { GAME_RULES } from '../config/game-rules.ts'
import { createGameSession } from '../model/game-session.ts'
import { createGameHud } from './game-hud.ts'
import { bindPointerControls } from './input/pointer-controls.ts'
import { createGameView } from './three/game-view.ts'

/** Mounts one play page and returns an idempotent teardown for unmount, HMR and tests. */
export function mountPlayPage(root: HTMLElement): () => void {
  root.innerHTML = '<canvas class="play-canvas" aria-label="Stack field"></canvas><div class="play-hud"></div>'
  const canvas = root.querySelector<HTMLCanvasElement>('.play-canvas')
  const hudRoot = root.querySelector<HTMLDivElement>('.play-hud')
  if (!canvas || !hudRoot) throw new Error('play page template is incomplete')

  const session = createGameSession(GAME_RULES)
  const view = createGameView(canvas, session)
  const hud = createGameHud(hudRoot, {
    dispatch: session.dispatch,
    togglePause: () => (session.getSnapshot().userPaused ? session.resume('user') : session.pause('user')),
  })
  const unbindControls = bindPointerControls(canvas, session)
  const unsubscribe = session.subscribe(() => hud.render(session.getSnapshot()))
  hud.render(session.getSnapshot())

  const onVisibility = (): void => {
    if (document.hidden) session.pause('hidden')
    else session.resume('hidden')
  }
  document.addEventListener('visibilitychange', onVisibility)
  onVisibility()

  const observer = new ResizeObserver(([entry]) => {
    if (entry) view.resize(entry.contentRect.width, entry.contentRect.height)
  })
  observer.observe(canvas)

  let last = performance.now()
  let frame = requestAnimationFrame(function loop(now) {
    session.advance(now - last)
    last = now
    view.render(session.renderFrame())
    frame = requestAnimationFrame(loop)
  })

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    unbindControls()
    unsubscribe()
    hud.dispose()
    view.dispose()
    session.dispose()
    root.replaceChildren()
  }
}
