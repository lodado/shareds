export type Entity = number
export type Axis = 'x' | 'z'

export interface Pose {
  x: number
  y: number
  z: number
}

export interface Size {
  w: number
  h: number
  d: number
}

export interface Moving {
  axis: Axis
  dir: 1 | -1
  speed: number
}

export interface Falling {
  vy: number
}

export type GameStatus = 'ready' | 'playing' | 'failed'

export type WorldCommand = { type: 'start' } | { type: 'drop' }

export type WorldEvent =
  | { kind: 'placed'; perfect: boolean }
  | { kind: 'failed' }

export interface World {
  nextId: Entity
  pose: Map<Entity, Pose>
  size: Map<Entity, Size>
  tint: Map<Entity, number>
  moving: Map<Entity, Moving>
  placed: Set<Entity>
  falling: Map<Entity, Falling>
  commands: WorldCommand[]
  events: WorldEvent[]
  status: GameStatus
  topId: Entity | null
  score: number
  combo: number
}
