import type { HudSnapshot, SessionCommand } from '../../model/game-session.ts'

interface ControlTarget {
  dispatch: (command: SessionCommand) => void
  getSnapshot: () => HudSnapshot
}

// Canvas taps and Space drive the field. HUD buttons live outside the canvas, so their taps never reach here.
export function bindPointerControls(canvas: HTMLCanvasElement, target: ControlTarget): () => void {
  const act = (): void => {
    const { status, runId } = target.getSnapshot()
    if (status === 'ready') target.dispatch({ type: 'start', runId })
    if (status === 'playing') target.dispatch({ type: 'drop', runId })
  }
  const onPointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    act()
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Space' || event.repeat) return
    // A focused button handles Space itself; acting here too would double the input.
    if (event.target instanceof HTMLButtonElement) return
    event.preventDefault()
    act()
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('keydown', onKeyDown)
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    window.removeEventListener('keydown', onKeyDown)
  }
}
