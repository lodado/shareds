import { AmbientLight, Mesh, PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { registry, requiredAssets } from './registry.mjs'

const loader = new GLTFLoader()
const scene = new Scene()
const camera = new PerspectiveCamera(50, 2, 0.1, 10)
camera.position.z = 4
const renderer = new WebGLRenderer()
renderer.setSize(480, 240)
document.querySelector('#canvas').append(renderer.domElement)
scene.add(new AmbientLight(0xffffff, 3))

const cache = new Map()
const instances = new Set()
const parses = {}
const completedLoads = {}
const disposed = { geometries: 0, materials: 0, textures: 0 }
const observed = new WeakSet()
let clock = 0
let generation = 0
let settled = 0
let screen = 'home'
let character = 'A'
let leases = []
let disposedHost = false

// Test probe at the actual parse boundary; loadAsync in installed three 0.186 calls parse.
const parse = loader.parse.bind(loader)
loader.parse = (data, path, onLoad, onError) => {
  const length = new DataView(data).getUint32(12, true)
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, length)))
  const id = json.asset.extras.fixtureId
  parses[id] = (parses[id] ?? 0) + 1
  return parse(data, path, onLoad, onError)
}

function resources(groups) {
  const found = { geometries: new Set(), materials: new Set(), textures: new Set() }
  for (const group of groups) {
    group.traverse((object) => {
      if (!(object instanceof Mesh)) return
      found.geometries.add(object.geometry)
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        found.materials.add(material)
        if (material.map) found.textures.add(material.map)
      }
    })
  }
  return found
}

function liveResources() {
  return resources([...cache.values()].flatMap((entry) => entry.source ? [entry.source] : []).concat([...instances]))
}

function observe(group) {
  for (const [kind, values] of Object.entries(resources([group]))) {
    for (const value of values) {
      if (observed.has(value)) continue
      observed.add(value)
      value.addEventListener('dispose', () => { disposed[kind]++ })
    }
  }
}

function disposeSource(source) {
  const retained = liveResources()
  const releasedImages = new Set()
  const retainedImages = new Set([...retained.textures].map((texture) => texture.image))
  for (const [kind, values] of Object.entries(resources([source]))) {
    for (const value of values) {
      if (retained[kind].has(value)) continue
      value.dispose()
      if (kind === 'textures' && !retainedImages.has(value.image) && !releasedImages.has(value.image)) {
        value.image?.close?.()
        releasedImages.add(value.image)
      }
    }
  }
}

function trim(limit = disposedHost ? 0 : 2) {
  // ponytail: two idle models, count budget; use measured byte budgeting only if model sizes demand it.
  const idle = [...cache.values()].filter((entry) => entry.users === 0 && entry.source)
    .sort((a, b) => a.touched - b.touched)
  for (const entry of idle.slice(0, Math.max(0, idle.length - limit))) {
    cache.delete(entry.id)
    disposeSource(entry.source)
  }
}

function acquire(id) {
  let entry = cache.get(id)
  if (!entry) {
    const asset = registry[id]
    if (!asset) throw new Error(`Unknown fixture asset: ${id}`)
    clock++
    entry = { id, users: 0, source: null, touched: clock }
    cache.set(id, entry)
    const ownedEntry = entry
    entry.promise = loader.loadAsync(asset.url).then((gltf) => {
      observe(gltf.scene)
      // GLTFLoader can resolve despite a failed texture; this fixture requires its one declared texture.
      if (resources([gltf.scene]).textures.size !== 1) {
        disposeSource(gltf.scene)
        throw new Error('Required texture unavailable')
      }
      ownedEntry.source = gltf.scene
      completedLoads[id] = (completedLoads[id] ?? 0) + 1
      trim()
      return gltf.scene
    }).catch((error) => {
      if (cache.get(id) === ownedEntry) cache.delete(id)
      throw error
    })
  }
  entry.users++
  clock++
  entry.touched = clock
  let released = false
  let instance = null
  const ownedMaterials = new Set()
  const ready = entry.promise.then((source) => {
    if (released) return null
    instance = source.clone(true)
    instance.userData.assetId = id
    instance.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const clone = (material) => {
        const copy = material.clone()
        ownedMaterials.add(copy)
        return copy
      }
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material)
    })
    observe(instance)
    instances.add(instance)
    return instance
  })
  return {
    ready,
    release() {
      if (released) return
      released = true
      if (instance) {
        instance.removeFromParent()
        instances.delete(instance)
        for (const material of ownedMaterials) material.dispose()
      }
      entry.users--
      clock++
      entry.touched = clock
      trim()
    },
  }
}

function draw() { renderer.render(scene, camera) }

function setStatus(status, error = '') {
  document.querySelector('[role="status"]').textContent = status
  document.querySelector('[role="alert"]').textContent = error
  document.querySelector('#retry').hidden = !error
  draw()
}

async function enter(next) {
  generation++
  const current = generation
  for (const lease of leases) lease.release()
  screen = next
  const owned = requiredAssets(screen, character).map(acquire)
  leases = owned
  setStatus(next === 'home' ? 'home' : `loading ${next}`)
  try {
    const models = await Promise.all(owned.map((lease) => lease.ready))
    if (current !== generation) return
    models.forEach((model, index) => {
      if (!model) return
      model.position.x = index - (models.length - 1) / 2
      scene.add(model)
    })
    setStatus(next === 'home' ? 'home' : `ready ${next}`)
  } catch (error) {
    for (const lease of owned) lease.release()
    if (current === generation) setStatus(`error ${next}`, `Load failed: ${error.message}. Retry or go Home.`)
  } finally {
    settled++
  }
}

function select(next) { character = next; return enter(screen) }
function releaseOne() {
  if (screen !== 'pair') return
  leases.shift()?.release()
  draw()
}
function tintOne() {
  scene.children.find((child) => child.userData.assetId)?.traverse((object) => {
    if (object instanceof Mesh) object.material.color.set(0xff0000)
  })
  draw()
}
const actions = {
  home: () => enter('home'), play: () => enter('play'), detail: () => enter('detail'),
  a: () => select('A'), b: () => select('B'), pair: () => enter('pair'),
  release: releaseOne, evict: () => { trim(0); draw() }, tint: tintOne, retry: () => enter(screen),
}
for (const [id, action] of Object.entries(actions)) {
  document.getElementById(id).addEventListener('click', () => {
    Promise.resolve().then(action).catch((error) => setStatus(`error ${screen}`, error.message))
  })
}

window.assetFixture = {
  registry,
  inspect() {
    const attached = scene.children.filter((child) => child.userData.assetId)
    return {
      screen, status: document.querySelector('[role="status"]').textContent,
      activeIds: attached.map((child) => child.userData.assetId),
      instanceColors: attached.map((group) => {
        let color = null
        group.traverse((object) => { if (object instanceof Mesh) color = object.material.color.getHexString() })
        return color
      }),
      parses: { ...parses }, completedLoads: { ...completedLoads }, settled,
      cacheSize: cache.size,
      idleCount: [...cache.values()].filter((entry) => entry.users === 0 && entry.source).length,
      leaseCount: [...cache.values()].reduce((sum, entry) => sum + entry.users, 0),
      resources: Object.fromEntries(Object.entries(liveResources()).map(([kind, values]) => [kind, values.size])),
      disposed: { ...disposed }, gpu: { ...renderer.info.memory },
    }
  },
}
setStatus('home')
window.addEventListener('pagehide', () => {
  disposedHost = true
  generation++
  for (const lease of leases) lease.release()
  trim(0)
  renderer.dispose()
}, { once: true })
