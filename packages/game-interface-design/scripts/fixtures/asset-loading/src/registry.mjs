import characterA from './assets/character-a.glb?url'
import characterB from './assets/character-b.glb?url'
import map from './assets/map.glb?url'
import skin from './assets/skin.glb?url'

// URL metadata only: importing this module does not start a loader.
export const registry = { characterA: { url: characterA }, characterB: { url: characterB }, map: { url: map }, skin: { url: skin } }

export function requiredAssets(screen, character) {
  if (screen === 'play') return ['map', character === 'A' ? 'characterA' : 'characterB']
  if (screen === 'detail') return ['skin']
  if (screen === 'pair') return ['characterA', 'characterA']
  return []
}
