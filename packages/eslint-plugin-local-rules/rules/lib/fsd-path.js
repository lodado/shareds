/** Shared path parsing for the fsd-* boundary rules. */
const SLICED_LAYERS = new Set(['pages', '_pages', 'views', 'widgets', 'features', 'entities'])

const normalize = (rawPath) => rawPath.replace(/\\/g, '/')

/** First sliced-layer segment in the path → { layer, slice, rest }, else null. */
const parseSlicedPath = (rawPath) => {
  const segments = normalize(rawPath).split('/').filter(Boolean)
  const layerIndex = segments.findIndex((segment) => SLICED_LAYERS.has(segment))

  if (layerIndex === -1 || layerIndex + 1 >= segments.length) {
    return null
  }

  return {
    layer: segments[layerIndex],
    slice: segments[layerIndex + 1],
    rest: segments.slice(layerIndex + 2),
  }
}

module.exports = { SLICED_LAYERS, normalize, parseSlicedPath }
