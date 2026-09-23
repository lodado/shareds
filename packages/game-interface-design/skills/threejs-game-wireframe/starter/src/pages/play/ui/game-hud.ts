import type { HudSnapshot, SessionCommand } from '../model/game-session.ts'

export interface GameHud {
  render: (snapshot: HudSnapshot) => void
  dispose: () => void
}

interface HudActions {
  dispatch: (command: SessionCommand) => void
  togglePause: () => void
}

const STATUS_TEXT: Record<HudSnapshot['status'], string> = {
  ready: 'Tap to start',
  playing: 'Tap to drop',
  failed: 'Missed',
}

const EVENT_TEXT = { placed: '', perfect: 'Perfect!', failed: '' } as const

// DOM overlay. Reads the snapshot, sends commands; never touches entities or components.
export function createGameHud(root: HTMLElement, actions: HudActions): GameHud {
  root.innerHTML = `
    <div class="hud-top">
      <output class="hud-score" aria-label="Score">0</output>
      <button type="button" class="hud-pause" data-hud-action="pause">Pause</button>
    </div>
    <p class="hud-flash" aria-hidden="true"></p>
    <div class="hud-panel">
      <p class="hud-status" role="status" aria-live="polite"></p>
      <button type="button" class="hud-primary" data-hud-action="primary"></button>
    </div>`
  const score = root.querySelector<HTMLOutputElement>('.hud-score')
  const status = root.querySelector<HTMLParagraphElement>('.hud-status')
  const flash = root.querySelector<HTMLParagraphElement>('.hud-flash')
  const pause = root.querySelector<HTMLButtonElement>('.hud-pause')
  const primary = root.querySelector<HTMLButtonElement>('.hud-primary')
  const panel = root.querySelector<HTMLDivElement>('.hud-panel')
  if (!score || !status || !flash || !pause || !primary || !panel) throw new Error('HUD template is incomplete')

  let current: HudSnapshot | null = null

  const onClick = (event: MouseEvent): void => {
    const action = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-hud-action]')?.dataset.hudAction
    if (!action || !current) return
    if (action === 'pause') actions.togglePause()
    if (action === 'primary') {
      actions.dispatch(current.status === 'failed' ? { type: 'restart' } : { type: 'start', runId: current.runId })
    }
  }
  root.addEventListener('click', onClick)

  return {
    render(snapshot) {
      if (snapshot === current) return
      const previous = current
      current = snapshot
      root.dataset.status = snapshot.status
      root.dataset.paused = String(snapshot.paused)
      root.dataset.runId = String(snapshot.runId)
      score.value = String(snapshot.score)
      status.textContent = snapshot.paused ? (snapshot.userPaused ? 'Paused' : 'Waiting for the game to return') : STATUS_TEXT[snapshot.status]
      pause.textContent = snapshot.userPaused ? 'Resume' : 'Pause'
      // A hidden-tab or context-lost pause has no user action to undo.
      pause.hidden = snapshot.status !== 'playing' || (snapshot.paused && !snapshot.userPaused)
      panel.hidden = snapshot.status === 'playing' && !snapshot.paused
      primary.hidden = snapshot.status === 'playing'
      primary.textContent = snapshot.status === 'failed' ? `Retry · ${snapshot.score}` : 'Start'
      if (snapshot.lastEvent && snapshot.lastEvent !== previous?.lastEvent) {
        flash.textContent = EVENT_TEXT[snapshot.lastEvent.kind]
        flash.dataset.seq = String(snapshot.lastEvent.seq)
      }
    },
    dispose() {
      root.removeEventListener('click', onClick)
      root.replaceChildren()
    },
  }
}
