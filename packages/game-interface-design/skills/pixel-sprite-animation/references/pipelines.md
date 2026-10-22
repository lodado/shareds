# Pipelines, base sources and rendering

## Base sources for BASE_DIFF

Licenses are per asset. Record every external frame in `sources` and keep `credits.txt` with the build.

- **Free asset libraries**: OpenGameArt, Kenney (CC0 throughout), itch.io free game assets. Filter by
  license where the site allows it, and copy the license from the asset's own page.
- **LPC character generator**: layered characters with walk, slash, thrust and hurt rows on a 64×64
  grid. Licenses differ per layer and most need credit; check share-alike terms before commercial use.
  Its animations are evenly timed and stiff, which is exactly what this harness fixes: import a row
  (`--grid 64x64 --row R --cols a-b`), retime it, exaggerate the anticipation, and add smear and impact
  frames as diffs.
- **Rigged 3D packs** (for example Quaternius) through the 3D rig route; the license differs between
  packs, so check each one.
- **Image-model key poses**: generate only key poses, clean them to a true pixel grid with an external
  fixer (proper-pixel-art, unfake.js), and `import` the result. Image models drift between frames (lint
  `M10`), so make the in-betweens as diffs of one cleaned pose instead of generating each.
- **Generators with sprite tools** (PixelLab, Retro Diffusion): drafts, then the same import and gates.

## Candidates

`candidates <manifest.json> --out <dir>` loads every entry of a JSON array of
`{ id, url | path, page?, author?, license?, note? }`:

- `id` uses letters, digits, `_` and `-`; give exactly one of `url` (http or https) or `path` (resolved
  from the manifest's folder). A bad manifest exits 2 and lists every problem.
- Downloads are plain GETs with no cookies or auth headers, capped at 5 MB and 20 s for headers plus
  body; only PNG files up to 4096×4096 pixels load, judged from the header. A redirect to a `file:` or
  `data:` address fails as an error row. A failed entry keeps its row with `error` and an empty board cell; the rest still load. The
  command exits 0 when at least one candidate loads, else 1.
- Outputs: `<id>.png` copies, `candidates.json` (index, id, source, page, author, license, license
  class, size, detected upscale or why none, native size, opaque colors at native size) and
  `candidates.png`, a board with each image scaled by a whole number to fit 96 px and a strip colored
  by license class: green open, blue attribution, amber copyleft, purple generator, dark red restricted,
  red unknown. Ids compare without case and must be safe file names.
- A rerun replaces only files an earlier run wrote (listed in `.pixel-sprite-candidates.json`) and
  removes the copy of an entry that now fails; any other file with the same name, or the manifest
  itself, stops the run unless `--force`.

License classes come from the license text: `restricted` for NonCommercial or NoDerivatives wording,
`copyleft` for share-alike or GPL wording (both checked before attribution, since "CC-BY-SA" contains
"CC-BY"), `open` for the whole words CC0, public domain, MIT or own work (not when negated), `attribution`
for CC-BY or OGA-BY, `generator` for generator or subscription words, otherwise `unknown`. Lint `L2`
applies the same classes to `sources`.

Base gate: before deriving frames, put the picked base alone into a 1-frame spec and run
`build --draft`. Fix palette (`H1`, `H2`), outline (`H6`) and dust (`H5`) findings there; the base is
copied into every frame.

## 3D rig route

Model a rough mesh, animate the key poses, render the character small and without anti-aliasing, and
add interpolation frames only around the keys. Retiming then takes minutes, but rendered edges flicker
between frames, so plan a cleanup pass as diffs.

`node scripts/pixel-sprite.mjs blender <file.blend> --out <dir> --size 48x48 --frames 1-12` renders with
Workbench, anti-aliasing off, transparent film and the Standard view transform (`--demo` renders a test
scene). It lists exactly the frames this run rendered; import those paths, not a folder glob that may
hold older renders. An explicit `--bin` must run as Blender (exit 2 otherwise); without it the
`BLENDER_BIN` variable and the usual install paths are tried. Then
`import <frames...> --actor <actor> --palette auto:12 --out <spec>` and clean up as diffs.

## Import

Any PNG frames. `--downscale auto` finds the integer block size and refuses uneven or off-grid
upscales (unzoom in the generator, or force `--downscale N`); fully transparent pixels count as equal
whatever RGB an exporter left in them. `--alpha` (0–255, default 128) sets the opacity cut, and an image
with no pixel above it is refused. `--palette` takes `auto:N` or any JSON file with a `palette` object.
`colors <png...>` lists opaque colors by use and groups shades closer than 24 (redmean distance) that
usually belong to one key.

The report lists each frame's scale, worst color error (`maxError`, same redmean scale: 0 exact, under
24 a merged shade, 24 or more a missing color), off-palette pixels and semi-transparent pixels.
`--diff-base first` writes every later frame as `base` = the first frame plus one patch, so each patch
stands alone; `--diff-chain` (`--diff-base previous`) bases each frame on the one before, which keeps
patches small but makes an edit to one frame move every later frame. `--source` with `--license`,
`--author`, `--url`, `--prompt` and `--seed` fills the `sources` entry. Imported frames keep their
`source` when you edit them, and frames derived from them inherit it through `base`.

## PixelLab MCP route

With the PixelLab MCP tools connected:

1. Base: `create_image_pixflux` (for example 32×32, transparent background, side view), or your own
   hand-drawn base frame.
2. Motion: `animate_image` with that first frame, the action and a `frame_count` for the motion only
   (4–8 for an attack). It returns `frame_count` + 1 frames with the input first; import the input
   once as the base, not twice.
3. Jobs can take minutes: wait with `wait_for_jobs` or `get_image`, then download the returned PNG URLs
   into the work directory. Run upscaled outputs through an unzoom tool first, or let
   `--downscale auto` check them.
4. `import <frames...> --diff-base first --actor <actor> --source pixellab --license "<plan terms>"`
   with `--prompt` and `--seed`, then `--palette auto:N --out <spec>`.
5. Retime, then add squash (`scale`), smears and the impact frame as diffs, and pass the gates.

Generation cost and commercial-use terms depend on the account's plan: check both before batch runs or
shipping, record the plan's terms as the source's license (`L2` warns on generator terms until a waiver
says why the release is covered), and declare AI-generated content in the store.

## Rendering checklist for the engine

- Pick a base resolution and scale by integers (320×180 or 640×360 → ×6 or ×3 at 1080p). On phones fix
  the base height and extend the background horizontally. Godot 4.2+ has an integer scale mode for its
  stretch settings; Unity has the Pixel Perfect Camera.
- No mixels: never rotate or scale sprites at runtime by non-integer amounts; draw rotations as parts.
- Camera: snap to the texel grid, then offset the final image by the snap error to keep motion smooth.
- Variants and hit flashes: palette-swap shaders instead of new sheets.
- Lighting: normal maps (rendered from 3D or painted) for dynamic light on sprites.
- Mobile: touch targets at least 44 pt (iOS) / 48 dp (Android); a 1-px outline or sel-out keeps the
  silhouette readable on busy backgrounds; keep key effects out of thumb zones.
