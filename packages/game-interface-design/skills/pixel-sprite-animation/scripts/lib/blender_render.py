"""Render the scene to small, unsmoothed PNG frames for `pixel-sprite.mjs import`.

Workbench engine, anti-aliasing off, transparent film, Standard view transform and no dither, so every
pixel is a flat shaded color that palette snapping can lock. `--demo` builds a tiny swinging-blade scene.
Run through `node scripts/pixel-sprite.mjs blender ...`; arguments follow Blender's `--` separator.
"""

import argparse
import math
import os
import sys

import bpy


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(prog="blender_render.py")
    parser.add_argument("--out", required=True)
    parser.add_argument("--size", default="48x48")
    parser.add_argument("--frames", default=None, help="first-last, e.g. 1-12")
    parser.add_argument("--camera", default=None)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--outline", action="store_true")
    return parser.parse_args(argv)


def material(name, rgba):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = rgba
    return mat


def add_box(name, size, location, mat, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(mat)
    if parent is not None:
        # Parenting without an inverse makes `location` an offset from the parent's origin.
        obj.parent = parent
        obj.location = location
    return obj


def build_demo(scene):
    for obj in list(scene.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    add_box("body", (0.8, 0.5, 1.6), (0, 0, 0.8), material("body", (0.2, 0.3, 0.8, 1)))
    bpy.ops.object.empty_add(location=(0.2, 0, 1.3))
    shoulder = bpy.context.active_object
    shoulder.name = "shoulder"
    add_box(
        "blade",
        (0.12, 0.12, 1.6),
        (0, 0, 0.8),
        material("blade", (0.85, 0.85, 0.9, 1)),
        shoulder,
    )
    for frame, degrees in ((1, -60), (3, -20), (4, 60), (5, 110), (8, 120)):
        shoulder.rotation_euler = (0, math.radians(degrees), 0)
        shoulder.keyframe_insert(data_path="rotation_euler", frame=frame)
    bpy.ops.object.camera_add(location=(0, -8, 1.2), rotation=(math.radians(90), 0, 0))
    camera = bpy.context.active_object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 5
    scene.camera = camera
    scene.frame_start = 1
    scene.frame_end = 8


def configure(scene, width, height, outline):
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.render_aa = "OFF"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_object_outline = outline
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.render.dither_intensity = 0.0
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"


def main():
    args = parse_args()
    scene = bpy.context.scene
    if args.demo:
        build_demo(scene)
    if args.camera:
        scene.camera = bpy.data.objects[args.camera]
    if scene.camera is None:
        raise SystemExit("scene has no camera; pass --camera <name>")
    width, height = (int(v) for v in args.size.lower().split("x"))
    configure(scene, width, height, args.outline)
    first, last = scene.frame_start, scene.frame_end
    if args.frames:
        first, last = (int(v) for v in args.frames.split("-"))
    os.makedirs(args.out, exist_ok=True)
    for frame in range(first, last + 1):
        scene.frame_set(frame)
        target = os.path.join(args.out, f"frame_{frame:04d}.png")
        scene.render.filepath = target
        bpy.ops.render.render(write_still=True)
        # The Node side reports exactly these paths, not whatever older frames sit in the folder.
        print(f"PIXEL_SPRITE_FRAME {target}", flush=True)


main()
