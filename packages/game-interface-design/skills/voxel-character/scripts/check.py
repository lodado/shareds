"""Checks for the voxel character pipeline. Each case comes from a mistake a real bake made.

uv run --with pillow --with numpy python check.py
"""

import base64
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp(prefix="vchar-check-"))
SPEC = {
    "title": "check",
    "tools": {"pick": {"part": "weapon_pick", "label": "Pick"}},
    "shield": False,
    "actions": {"idle": {"source": "idle", "dirs": [8, 12], "label": "Idle"}},
    "faces": {"plain": {"strip": "plain.png", "label": "Plain"}},
}
(TMP / "character.json").write_text(json.dumps(SPEC))
os.environ["VCHAR_SPEC"] = str(TMP / "character.json")
_ARGV, sys.argv = sys.argv, [sys.argv[0], str(TMP / "character.json"), str(TMP / "out.html")]  # bake reads its spec on import
sys.path.insert(0, str(HERE))

import bake  # noqa: E402
import heads  # noqa: E402

sys.argv = _ARGV


def sheet(n=5, size=(1500, 500), bg=(255, 255, 255), flap=False):
    """n round heads in a row on a flat background: skin face with white eyes, a dark brim band, a red cap on top."""
    im = Image.new("RGBA" if len(bg) == 4 else "RGB", size, bg)
    d = ImageDraw.Draw(im)
    cell = size[0] // max(n, 5)
    for i in range(n):
        x = i * cell + cell // 2
        d.ellipse(
            (x - 80, 120, x + 80, 300),
            fill=(214, 160, 120),
            outline=(20, 20, 26),
            width=6,
        )
        d.rectangle((x - 80, 150, x + 80, 175), fill=(40, 40, 50))
        d.pieslice((x - 80, 100, x + 80, 240), 180, 360, fill=(180, 40, 40))
        for ex in (x - 35, x + 15):
            d.rectangle((ex, 205, ex + 20, 225), fill=(255, 255, 255))
        if flap:  # cloth hanging from the cap down one side
            d.rectangle((x - 95, 150, x - 70, 290), fill=(180, 40, 40))
    return im


def keyed_hat_sheet():
    """A wide drooping brim over a magenta head with a dark outline, as the hat prompt asks for."""
    im = Image.new("RGB", (1500, 500), (255, 255, 255))
    d = ImageDraw.Draw(im)
    for i in range(5):
        x = i * 300 + 150
        d.ellipse((x - 80, 120, x + 80, 300), fill=heads.KEY, outline=(20, 20, 26), width=6)
        d.pieslice((x - 70, 60, x + 70, 200), 180, 360, fill=(200, 160, 60))
        d.rectangle((x - 140, 130, x + 140, 150), fill=(200, 160, 60))
        for ex in (x - 140, x + 115):  # the brim edges droop past where the hat meets the head
            d.rectangle((ex, 150, ex + 25, 200), fill=(200, 160, 60))
    return im


def tearDownModule():
    shutil.rmtree(TMP, ignore_errors=True)


class Heads(unittest.TestCase):
    def test_import_gives_eight_views_with_mirrored_left_side(self):
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "plain.png")
        a = np.array(Image.open(TMP / "plain.png"))
        c = heads.CELL
        self.assertEqual(a.shape, (c, c * 8, 4))
        for col in range(8):
            self.assertTrue(
                a[:, col * c : (col + 1) * c, 3].any(), f"view {col} is empty"
            )
        for right, left in heads.MIRROR.items():
            self.assertTrue(
                (
                    a[:, right * c : (right + 1) * c]
                    == a[:, left * c : (left + 1) * c][:, ::-1]
                ).all()
            )

    def test_head_is_centred_on_the_anchor_column(self):
        # anchors were once read by hand per sheet; a head off its column swims on the neck while turning
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "plain.png")
        a = np.array(Image.open(TMP / "plain.png"))[:, : heads.CELL, 3] > 0
        xs = np.nonzero(a.any(0))[0]
        self.assertLessEqual(abs((xs.min() + xs.max()) / 2 - heads.CX), 1.0)

    def test_a_sheet_without_five_heads_is_refused(self):
        sheet(n=4).save(TMP / "four.png")
        with self.assertRaises(SystemExit):
            heads.import_sheet(TMP / "four.png", TMP / "four-out.png")

    def test_white_inside_a_head_is_kept_on_a_white_sheet(self):
        # keying every near-white pixel punched the eyes and highlights out of the head
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "plain.png")
        a = np.array(Image.open(TMP / "plain.png"))[:, : heads.CELL]
        self.assertTrue(((a[..., :3].min(-1) > 220) & (a[..., 3] > 0)).any())

    def test_a_transparent_sheet_imports(self):
        sheet(bg=(0, 0, 0, 0)).save(TMP / "t.png")
        heads.import_sheet(TMP / "t.png", TMP / "t-out.png")
        a = np.array(Image.open(TMP / "t-out.png"))[..., 3]
        self.assertTrue(all(a[:, c * heads.CELL : (c + 1) * heads.CELL].any() for c in range(8)))

    def test_a_drape_keeps_cloth_hanging_from_the_hat_only_when_asked(self):
        sheet(flap=True).save(TMP / "f.png")
        for drape in (False, True):
            heads.import_sheet(TMP / "f.png", TMP / "f-out.png", hat=True, drape=drape)
            low = np.array(Image.open(TMP / "f-out.png"))[heads.BRIM_Y + 1 :, : heads.CELL, 3]
            self.assertEqual(bool(low.any()), drape)

    def test_a_hat_on_the_hair_drops_colours_drawn_below_the_brim(self):
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "sit.png", hat=True, sit=True)
        heads.import_sheet(TMP / "s.png", TMP / "plain.png")
        hat = np.array(Image.open(TMP / "sit.png"))[..., :4]
        face = np.array(Image.open(TMP / "plain.png"))
        below = {tuple(c) for c in face[heads.BRIM_Y + 4 :][face[heads.BRIM_Y + 4 :, :, 3] > 0][:, :3]}
        kept = {tuple(c) for c in hat[hat[..., 3] > 0][:, :3]}
        self.assertTrue(kept)
        self.assertFalse(kept & below)

    def test_a_hat_on_a_magenta_head_keeps_the_brim_and_drops_the_head(self):
        # a wide straw brim kept a band of the generator's bald head under it
        keyed_hat_sheet().save(TMP / "k.png")
        heads.import_sheet(TMP / "k.png", TMP / "k-out.png", hat=True)
        a = np.array(Image.open(TMP / "k-out.png"))[:, : heads.CELL]
        on = a[..., 3] > 0
        self.assertFalse(((a[..., :3] == heads.KEY).all(-1) & on).any(), "magenta head kept")
        self.assertTrue(on[heads.BRIM_Y + 1 :].any(), "drooping brim cut at the brim line")
        self.assertFalse(on[heads.BRIM_Y + 8 :].any(), "head outline kept")

    def test_a_crown_on_a_magenta_head_sits_above_the_brim_line(self):
        # pinning by the highest magenta row put a crown on the skull top over the eyes
        im = Image.new("RGB", (1500, 500), (255, 255, 255))
        d = ImageDraw.Draw(im)
        for i in range(5):
            x = i * 300 + 150
            d.ellipse((x - 80, 120, x + 80, 320), fill=heads.KEY)
            d.rectangle((x - 50, 95, x + 50, 135), fill=(220, 180, 40), outline=(20, 20, 26), width=4)
        im.save(TMP / "crown.png")
        heads.import_sheet(TMP / "crown.png", TMP / "crown-out.png", hat=True, sit=True)
        a = np.array(Image.open(TMP / "crown-out.png"))[:, : heads.CELL, 3]
        self.assertLess(np.nonzero(a.any(1))[0].max(), heads.BRIM_Y - 2)

    def test_a_view_where_the_hat_hides_the_head_still_imports(self):
        # a hood hides the whole head from behind; the import crashed on that view
        im = keyed_hat_sheet()
        ImageDraw.Draw(im).rectangle((1200, 110, 1500, 330), fill=(200, 160, 60))
        im.save(TMP / "hidden.png")
        heads.import_sheet(TMP / "hidden.png", TMP / "hidden-out.png", hat=True)
        a = np.array(Image.open(TMP / "hidden-out.png"))[..., 3]
        self.assertTrue(a[:, 4 * heads.CELL : 5 * heads.CELL].any())

    def test_a_hat_keeps_nothing_below_the_brim(self):
        # a hat that carried the generator's face along changed the face under it when swapped
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "hat.png", hat=True)
        a = np.array(Image.open(TMP / "hat.png"))[..., 3]
        self.assertTrue(a[: heads.BRIM_Y + 1].any())
        self.assertFalse(a[heads.BRIM_Y + 1 :].any())


class Body(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "plain.png")
        bake.mp.LOADOUTS["c"] = (
            "body_cloth",
            "head_base",
            "hair_long",
            "chin_long",
            "weapon_pick",
        )
        cls.lo = bake.F.loadout("c")

    def test_held_tools_stay_out_of_the_head(self):
        # a swung tool passed through the lower face: the grip is pushed out of the head stand-ins
        raw = 0.0
        for act in ("idle", "walk", "mine", "attack"):
            for q, *_ in bake.ACTIONS[act]["build"](self.lo):
                self.assertLessEqual(bake.penetration(self.lo, q), 0.0, act)
                raw = max(raw, bake.penetration(self.lo, q, bake._raw_pose))
        self.assertGreater(
            raw, 0.0, "the poses no longer reach the head, so this check proves nothing"
        )

    def poses_at_every_neck(self, acts):
        # hands sit in body space but the head rides up its neck, so check every short neck and the longest
        keep = bake.rig.NECK_LEN
        try:
            for neck in (0.0, 1.0, 2.0, 3.0, 4.0, 6.0, float(bake.rig.N - bake.rig.NECK[2] - 4)):
                bake.rig.NECK_LEN = neck
                for act in acts:
                    for k, (q, *_) in enumerate(bake.ACTIONS[act]["build"](self.lo)):
                        inst, info = bake.solved(self.lo, q)
                        yield f"{act} frame {k} neck {neck:g}", q, inst, info
        finally:
            bake.rig.NECK_LEN = keep

    def test_a_tool_carried_on_the_shoulder_passes_below_the_neck(self):
        # the walk held the haft at neck height, so in profile it lay across the throat
        for name, _, inst, _ in self.poses_at_every_neck(("idle", "walk")):
            chest = next(i for i in inst if i.name == "chest")
            weapon = next(i for i in inst if i.name == "weapon")
            base = chest.point(bake.rig.NECK)
            local = [chest.M.T @ (weapon.point((19.0, 0.0, z)) - base) for z in np.arange(0, 45, 0.5)]
            crossing = [v[2] for v in local if abs(v[1]) < 0.5 and abs(v[0]) < 14]
            self.assertTrue(crossing, f"{name}: the haft never passes the neck")
            self.assertLessEqual(min(crossing), 0.0, name)

    def test_no_haft_passes_in_front_of_the_face(self):
        # the swing wind-up and smear ran the haft across the eyes, which a profile view draws over the face;
        # a guard (block) holds the tool there on purpose
        for name, q, inst, _ in self.poses_at_every_neck([a for a in bake.ACTIONS if a != "block"]):
            if q["weapon"][0] not in ("hand", "two"):
                continue
            head = next(i for i in inst if i.name == "head")
            weapon = next(i for i in inst if i.name == "weapon")
            for z in np.arange(0, 45, 0.5):
                v = head.M.T @ (weapon.point((19.0, 0.0, z)) - head.pos) + bake.rig.NECK
                self.assertFalse(3 <= v[1] <= 10 and 29 <= v[2] <= 38, f"{name}: haft at {v.round(1)}")

    def test_a_carried_haft_shows_unbroken_on_the_tool_side(self):
        # seen from the tool-arm side the shoulder cap swallowed the middle of the haft, so the tool stuck into
        # the chest and the gripping hand read as holding nothing
        for act in ("idle", "walk"):
            for k, (q, *_) in enumerate(bake.ACTIONS[act]["build"](self.lo)):
                if q["weapon"][0] != "hand":
                    continue
                inst, _ = bake.solved(self.lo, q)
                names = [None] + [i.name for i in inst]
                weapon = next(i for i in inst if i.name == "weapon")
                for d in (10, 12):
                    _, ident, _ = bake.R.render(inst, d, bake.rig.DARK, 16)
                    C = bake.R.camera(d, 16)
                    for z in range(8, 40, 2):
                        col, row, _ = bake.R.project([weapon.point((19.0, 0.0, z))], C)[0]
                        self.assertIn(names[ident[int(row), int(col)]], ("weapon", "hand_hi"), f"{act} {k} dir {d} haft z {z}")

    def test_the_carrying_elbow_hangs_beside_the_body(self):
        # an elbow out to the side pointed at the camera in the tool-side profile and covered the torso
        for act in ("idle", "walk"):
            for k, (q, *_) in enumerate(bake.ACTIONS[act]["build"](self.lo)):
                side, _, down = bake.solved(self.lo, q)[1]["elbow"]["hi"]
                self.assertLessEqual(side, 2.5, f"{act} {k}: elbow out to the side")
                self.assertLess(down, -4.0, f"{act} {k}: elbow not below the shoulder")

    def test_arms_reach_their_targets(self):
        # hands raised out of reach to clear the face stretched the arms half again in profile;
        # two-handed grips already stretch a little, so the bound sits just above them
        for name, _, _, info in self.poses_at_every_neck(bake.ACTIONS):
            arms = max(s for a, s in info["stretch"].items() if a.startswith("arm"))
            self.assertLessEqual(arms, 1.32, name)

    def test_the_neck_is_a_column_not_a_stalk(self):
        # a neck 4 voxels thick showed as a thin stalk under a bald head in profile
        width, depth, _ = bake.rig.SHARED["neck"].size
        self.assertGreaterEqual(width, 6)
        self.assertGreaterEqual(depth, 7)

    def test_whatever_is_nearer_than_the_head_covers_it(self):
        # the head image was drawn over everything, so the near shoulder and a slung pick sat behind it
        for d in (4, 12):
            _, top, _ = bake.layers("c", "idle", 0, d)
            self.assertGreater(
                int((top[..., 3] > 0).sum()),
                20,
                f"nothing covers the head in profile view {d}",
            )

    def test_torso_is_deep_enough_for_the_head_in_profile(self):
        # a torso 22 wide but 16 deep came out narrower than a painted head (about 20 px) in profile,
        # so the head read as nearer than the body
        inst, _ = bake.solved(self.lo, bake.ACTIONS["idle"]["build"](self.lo)[0][0])
        torso = [i for i in inst if i.name in ("chest", "belt", "skirt_lo", "skirt_hi")]
        for d in (4, 12):
            _, ident, _ = bake.R.render(torso, d, bake.rig.DARK, 16)
            xs = np.nonzero((ident > 0).any(0))[0]
            self.assertGreaterEqual(xs.max() - xs.min() + 1, 20, f"profile view {d}")

    def test_a_side_on_torso_has_a_lit_and_a_shaded_side(self):
        # colours baked in the rest pose left the torso one flat tone from the side: no volume
        inst, _ = bake.solved(self.lo, bake.ACTIONS["idle"]["build"](self.lo)[0][0])
        chest = [i for i in inst if i.name == "chest"]
        tone = np.zeros(len(bake.rig.PAL))
        for codes in bake.rig.CODE.values():
            tone[codes] = np.arange(len(codes))
        for d in (4, 12):
            code, _, _ = bake.R.render(chest, d, bake.rig.DARK, 16)
            xs = np.nonzero((code > 0).any(0))[0]
            third = (xs.max() - xs.min() + 1) // 3
            left, right = code[:, xs.min() : xs.min() + third], code[:, xs.max() + 1 - third : xs.max() + 1]
            lit, shaded = tone[left[left > 0]].mean(), tone[right[right > 0]].mean()
            self.assertGreater(lit - shaded, 0.3, f"profile view {d}: the light comes from the upper left")


class Page(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sheet().save(TMP / "s.png")
        heads.import_sheet(TMP / "s.png", TMP / "plain.png")
        cls.ramp = [[10 * i, 20, 30] for i in range(6)]
        spec = dict(SPEC, title="a </script> title", ramps={"coat": cls.ramp})
        (TMP / "page.json").write_text(json.dumps(spec))
        r = subprocess.run(
            [sys.executable, "-B", str(HERE / "bake.py"), str(TMP / "page.json"), str(TMP / "page.html")],
            capture_output=True,
            text=True,
        )
        assert r.returncode == 0, r.stderr
        s = (TMP / "page.html").read_text()
        cls.page = s
        cls.data = json.loads(s[s.index("const D=") + 8 : s.index(";\nconst U=")])

    def test_the_crop_holds_every_body_frame_and_head(self):
        # a crop read by eye cut tool heads off the swing frames
        d = self.data
        x, y, w, h = d["crop"]
        face = np.array(Image.open(io.BytesIO(base64.b64decode(d["faces"]["plain"]["src"].split(",")[1]))))
        for key, item in d["body"].items():
            sheet_ = np.array(Image.open(io.BytesIO(base64.b64decode(item["src"].split(",")[1]))))
            col = ((int(key.split("|")[-1]) - 8) // 2) % 8
            for f, (ax, ay) in enumerate(item["at"]):
                ys, xs = np.nonzero(sheet_[: d["h"], f * d["w"] : (f + 1) * d["w"], 3])
                hy, hx = np.nonzero(face[:, col * d["cell"] : (col + 1) * d["cell"], 3])
                xs = np.concatenate([xs, hx + round(ax - d["cx"])])
                ys = np.concatenate([ys, hy + round(ay - d["brimY"])])
                self.assertGreaterEqual(xs.min(), x, key)
                self.assertLess(xs.max(), x + w, key)
                self.assertGreaterEqual(ys.min(), y, key)
                self.assertLess(ys.max(), y + h, key)

    def test_a_spec_ramp_recolours_the_body(self):
        # spec ramps were applied before the built-in ramps and crashed or were overwritten
        self.assertEqual(self.data["coat"], self.ramp)

    def test_a_neck_lifts_the_head_off_the_collar(self):
        # a beardless face sat on the collar with no neck
        spec = dict(SPEC, head={"neck": 6})
        (TMP / "neck.json").write_text(json.dumps(spec))
        r = subprocess.run(
            [sys.executable, "-B", str(HERE / "bake.py"), str(TMP / "neck.json"), str(TMP / "neck.html")],
            capture_output=True,
            text=True,
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        s = (TMP / "neck.html").read_text()
        lifted = json.loads(s[s.index("const D=") + 8 : s.index(";\nconst U=")])
        for key in ("pick|off|idle|8", "pick|off|idle|12"):
            self.assertGreaterEqual(self.data["body"][key]["at"][0][1] - lifted["body"][key]["at"][0][1], 3, key)

    def test_labels_cannot_break_the_page(self):
        self.assertIn('<meta charset="utf-8">', self.page)
        self.assertIn("<title>a &lt;/script&gt; title</title>", self.page)
        self.assertEqual(self.page.count("</script>"), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
