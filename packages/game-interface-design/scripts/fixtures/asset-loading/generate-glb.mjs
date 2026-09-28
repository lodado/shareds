import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

// Generated coordinates and pixels; no downloaded model, image or decoder.
function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data])
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, body, checksum])
}

function glb(id) {
  const coordinates = [-0.4, -0.4, 0, 0.4, -0.4, 0, 0, 0.4, 0, 0, 0, 1, 0, 0.5, 1]
  const binary = Buffer.alloc(coordinates.length * 4)
  coordinates.forEach((value, i) => binary.writeFloatLE(value, i * 4))
  const document = {
    asset: { version: '2.0', generator: 'local GLB regression fixture', extras: { fixtureId: id } },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: id, mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 }, doubleSided: true }],
    textures: [{ source: 0 }], images: [{ uri: '../models/pixel.png' }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-0.4, -0.4, 0], max: [0.4, 0.4, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' },
    ],
  }
  const json = Buffer.from(JSON.stringify(document))
  const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)])
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(28 + padded.length + binary.length, 8)
  header.writeUInt32LE(padded.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const binaryHeader = Buffer.alloc(8)
  binaryHeader.writeUInt32LE(binary.length, 0)
  binaryHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, padded, binaryHeader, binary])
}

await mkdir(new URL('./src/assets/', import.meta.url), { recursive: true })
await mkdir(new URL('./public/models/', import.meta.url), { recursive: true })
for (const [file, id] of Object.entries({ 'character-a': 'characterA', 'character-b': 'characterB', map: 'map', skin: 'skin' })) {
  await writeFile(new URL(`./src/assets/${file}.glb`, import.meta.url), glb(id))
}
const dimensions = Buffer.alloc(13)
dimensions.writeUInt32BE(1, 0)
dimensions.writeUInt32BE(1, 4)
dimensions[8] = 8
dimensions[9] = 6
await writeFile(new URL('./public/models/pixel.png', import.meta.url), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  pngChunk('IHDR', dimensions),
  pngChunk('IDAT', deflateSync(Buffer.from([0, 255, 255, 255, 255]))),
  pngChunk('IEND', Buffer.alloc(0)),
]))
