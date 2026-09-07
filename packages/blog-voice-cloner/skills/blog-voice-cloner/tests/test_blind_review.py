"""Synthetic CLI regression tests. Never reads a real benchmark corpus."""
import copy
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "build_blind_review.py"


class ReviewHTML(HTMLParser):
    """Inspect only HTML created from this test's synthetic fixtures."""

    def __init__(self, page):
        super().__init__()
        self.elements = {}
        self.labels = set()
        self.scripts = {}
        self.links = []
        self.articles = 0
        self.active_script = None
        self.active_select = None
        self.feed(page)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            if attrs["id"] in self.elements:
                raise AssertionError("duplicate HTML id")
            self.elements[attrs["id"]] = {"tag": tag, **attrs}
        if tag == "label":
            self.labels.add(attrs.get("for"))
        if tag == "article":
            self.articles += 1
        if tag == "a":
            self.links.append(attrs)
        if tag == "select":
            self.active_select = self.elements[attrs["id"]]
            self.active_select["options"] = []
        if tag == "option" and self.active_select is not None:
            self.active_select["options"].append(attrs.get("value"))
        if tag == "script":
            self.active_script = attrs.get("id", "UNEXPECTED")
            self.scripts[self.active_script] = ""

    def handle_endtag(self, tag):
        if tag == "script":
            self.active_script = None
        if tag == "select":
            self.active_select = None

    def handle_data(self, data):
        if self.active_script is not None:
            self.scripts[self.active_script] += data


class BlindReviewTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.text = "첫 줄 <script>alert('x')</script> & \"인용\"\n\n  공백\t끝\n"
        (self.root / "secret-alpha.txt").write_text(self.text, encoding="utf-8")
        (self.root / "secret-beta.txt").write_text("다른 글\n", encoding="utf-8")
        self.manifest = {
            "title": "검토 <모음>", "reference_url": "javascript:<script>bad()</script>",
            "cases": [{"id": "case-1", "title": "제목 <검토>", "brief": "같은 요청\n  상세",
                       "outputs": [{"variant": "hidden-alpha", "path": "secret-alpha.txt"},
                                   {"variant": "hidden-beta", "path": "secret-beta.txt"}]}],
        }

    def run_cli(self, manifest=None, output="review", seed="123"):
        source = self.root / "manifest.json"
        source.write_text(json.dumps(self.manifest if manifest is None else manifest), encoding="utf-8")
        args = [sys.executable, str(SCRIPT), str(source), "--output", str(self.root / output)]
        if seed is not None:
            args += ["--seed", seed]
        return subprocess.run(args, cwd=self.root, text=True, capture_output=True)

    def assert_rejected(self, manifest):
        result = self.run_cli(manifest)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "review").exists())

    def test_artifacts_schema_escaping_and_no_identity_leaks(self):
        result = self.run_cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        output = self.root / "review"
        page = (output / "review.html").read_text(encoding="utf-8")
        ratings_text = (output / "ratings.json").read_text(encoding="utf-8")
        key = json.loads((output / "private" / "key.json").read_text(encoding="utf-8"))
        self.assertIn('<html lang="ko">', page)
        self.assertIn("<pre>" + html.escape(self.text) + "</pre>", page)
        self.assertIn(html.escape(self.manifest["cases"][0]["brief"]), page)
        self.assertNotIn("<script>alert", page)
        self.assertNotIn("<script>bad", page)
        self.assertNotIn("href=\"javascript:", page)
        self.assertIn("tie", page)
        self.assertIn("cannot_judge", page)
        for label in ("hidden-alpha", "hidden-beta", "secret-alpha.txt", "secret-beta.txt"):
            self.assertNotIn(label, page + ratings_text)
        ratings = json.loads(ratings_text)
        self.assertEqual(ratings["human_preference"], "pending")
        case = ratings["cases"][0]
        self.assertIsNone(case["preferred_sample"])
        self.assertEqual(case["notes"], "")
        ids = [sample["sample_id"] for sample in case["samples"]]
        self.assertEqual(len(set(ids)), 2)
        for sample in case["samples"]:
            self.assertRegex(sample["sample_id"], r"^sample-[0-9a-f]{32}$")
            self.assertIsNone(sample["voice_match"])
            self.assertEqual(sample["meaning_errors"], "")
            self.assertEqual(sample["over_imitation"], "")
            self.assertIn(sample["sample_id"], page)
        self.assertEqual(key["seed"], 123)
        mapped = key["cases"][0]["samples"]
        self.assertEqual({s["sample_id"] for s in mapped}, set(ids))
        self.assertEqual({s["variant"] for s in mapped}, {"hidden-alpha", "hidden-beta"})
        self.assertEqual({s["path"] for s in mapped}, {"secret-alpha.txt", "secret-beta.txt"})
        self.assertEqual((output / "private").stat().st_mode & 0o777, 0o700)
        self.assertEqual((output / "private/key.json").stat().st_mode & 0o777, 0o600)

    def three_case_packet(self):
        (self.root / "secret-gamma.txt").write_text("세 번째 합성 글\n", encoding="utf-8")
        case = self.manifest["cases"][0]
        case["outputs"].append({"variant": "hidden-gamma", "path": "secret-gamma.txt"})
        self.manifest["cases"] = [dict(copy.deepcopy(case), id=f"case-{i + 1}") for i in range(3)]
        self.assertEqual(self.run_cli().returncode, 0)
        page = (self.root / "review/review.html").read_text(encoding="utf-8")
        ratings = json.loads((self.root / "review/ratings.json").read_text(encoding="utf-8"))
        return ReviewHTML(page), ratings

    def test_three_cases_have_nine_accessible_anonymous_rating_controls(self):
        page, ratings = self.three_case_packet()
        self.assertEqual(page.articles, 9)
        self.assertEqual(set(page.scripts), {"initial-ratings", "review-app"})
        self.assertEqual(json.loads(page.scripts["initial-ratings"]), ratings)
        ids = []
        for i, case in enumerate(ratings["cases"]):
            choices = page.elements[f"case-{i}-preference"]["options"]
            self.assertEqual(choices, [""] + [s["sample_id"] for s in case["samples"]]
                             + ["tie", "cannot_judge"])
            for sample in case["samples"]:
                ids.append(sample["sample_id"])
                for field in ("voice_match", "meaning_errors", "over_imitation"):
                    control_id = sample["sample_id"] + "-" + field
                    self.assertIn(control_id, page.labels)
                    control = page.elements[control_id]
                    if field == "voice_match":
                        self.assertEqual(control["options"], ["", "1", "2", "3", "4", "5"])
                    else:
                        self.assertEqual(control["tag"], "textarea")
            self.assertIn(f"case-{i}-notes", page.labels)
            self.assertIn(f"case-{i}-preference", page.labels)
        self.assertEqual(len(set(ids)), 9)
        self.assertEqual(page.elements["export-ratings"]["type"], "button")
        self.assertEqual(page.elements["import-ratings"]["type"], "file")
        self.assertEqual(page.elements["save-status"]["role"], "status")

    def test_storage_identity_changes_when_review_content_changes_with_same_seed(self):
        self.assertEqual(self.run_cli(output="one").returncode, 0)
        self.manifest["cases"][0]["brief"] += " 수정된 요청"
        self.assertEqual(self.run_cli(output="two").returncode, 0)
        first, second = [json.loads((self.root / name / "ratings.json").read_text()) for name in ("one", "two")]
        self.assertIn("packet_id", first)
        self.assertNotEqual(first["packet_id"], second["packet_id"])

    def test_only_valid_http_references_are_clickable_and_attribute_escaped(self):
        urls = ('https://example.test/한국어?q="인용"&n=1', 'http://example.test:8080/reference')
        for i, url in enumerate(urls):
            self.manifest["reference_url"] = url
            self.assertEqual(self.run_cli(output=f"valid-{i}").returncode, 0)
            page = (self.root / f"valid-{i}/review.html").read_text(encoding="utf-8")
            links = [a for a in ReviewHTML(page).links if a.get("href") == url]
            self.assertEqual(len(links), 1, "A valid reference needs a usable link")
            self.assertIn("noopener", links[0]["rel"])
            self.assertIn('href="' + html.escape(url, quote=True) + '"', page)
        for i, url in enumerate(('javascript:alert(1)', 'data:text/html,<script>bad()</script>',
                                 '//example.test', 'https://', 'https://example.test:bad',
                                 'https://example.test\n/path')):
            self.manifest["reference_url"] = url
            self.assertEqual(self.run_cli(output=f"invalid-{i}").returncode, 0)
            page = (self.root / f"invalid-{i}/review.html").read_text(encoding="utf-8")
            self.assertTrue(all(a.get("href", "").startswith("#") for a in ReviewHTML(page).links))

    def test_untrusted_content_cannot_break_out_into_the_ratings_script(self):
        payload = '</script><script id="injected">bad()</script><img src=x onerror="bad()"> & "끝"'
        self.manifest["title"] = payload
        self.manifest["cases"][0]["title"] = payload
        self.manifest["cases"][0]["brief"] = payload
        self.manifest["reference_url"] = payload
        (self.root / "secret-alpha.txt").write_text(payload, encoding="utf-8")
        self.assertEqual(self.run_cli().returncode, 0)
        page = (self.root / "review/review.html").read_text(encoding="utf-8")
        self.assertEqual(set(ReviewHTML(page).scripts), {"initial-ratings", "review-app"})
        self.assertNotIn('<img src=x', page)
        self.assertGreaterEqual(page.count(html.escape(payload)), 4)

    def test_reference_text_renders_in_reference_panel(self):
        self.manifest["reference_text"] = "<script>원본 텍스트</script>\n줄 바꿈"
        result = self.run_cli(output="with-reference-text")
        self.assertEqual(result.returncode, 0, result.stderr)
        page = (self.root / "with-reference-text/review.html").read_text(encoding="utf-8")
        self.assertIn("<h2>원본 비교</h2>", page)
        self.assertIn("<h3>원문 텍스트</h3>", page)
        self.assertIn(html.escape(self.manifest["reference_text"]), page)

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed to exercise the offline ratings script")
    def test_ratings_script_autosave_restore_export_import_and_storage_failure(self):
        page, ratings = self.three_case_packet()
        self.assertIn("review-app", page.scripts, "The review page must have working ratings behavior")
        # Run the actual generated script. Only browser APIs are small in-memory
        # adapters. Real file:// behavior also needs a browser acceptance check.
        harness = r'''
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {Blob} = require('node:buffer');
const input = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
const storage = new Map();
function boot({blocked = false, confirm = true} = {}) {
  const elements = Object.fromEntries(Object.entries(input.elements).map(([id, attrs]) => [id, {
    value: attrs.value || '', checked: false, disabled: 'disabled' in attrs,
    textContent: id === 'initial-ratings' ? JSON.stringify(input.ratings) : '',
    files: [], events: {}, addEventListener(type, fn) { this.events[type] = fn; },
  }]));
  const downloads = [];
  const blobs = new Map();
  const window = {events: {}, confirm: () => confirm, addEventListener(type, fn) { this.events[type] = fn; }};
  const document = {
    getElementById: id => { assert.ok(elements[id], `missing control ${id}`); return elements[id]; },
    body: {appendChild() {}},
    createElement: () => ({click() { downloads.push({name: this.download, blob: blobs.get(this.href)}); }, remove() {}}),
  };
  const localStorage = {
    getItem(key) { if (blocked) throw Error('storage blocked'); return storage.get(key) || null; },
    setItem(key, value) { if (blocked) throw Error('quota exceeded'); storage.set(key, value); },
  };
  const URL = {createObjectURL(blob) { const id = `blob:${blobs.size}`; blobs.set(id, blob); return id; }, revokeObjectURL() {}};
  const context = {document, window, localStorage, Blob, URL, setTimeout() {}};
  vm.runInNewContext(input.script, context, {timeout: 2000});
  return {elements, downloads, window, async fire(id, type) {
    assert.equal(typeof elements[id].events[type], 'function', `${id} needs ${type} handler`);
    await elements[id].events[type]({target: elements[id], preventDefault() {}});
  }};
}
(async () => {
  let app = boot();
  const id = input.ratings.cases[0].samples[0].sample_id;
  const note = '한국어 메모 "인용"\n</script><img src=x onerror=bad()> & 끝';
  app.elements[id + '-voice_match'].value = '5';
  app.elements[id + '-meaning_errors'].value = note;
  app.elements[id + '-over_imitation'].value = '과장된 어미';
  app.elements['case-0-notes'].value = '종합 의견';
  app.elements['case-0-preference'].value = id;
  app.elements['case-1-preference'].value = 'tie';
  app.elements['case-2-preference'].value = 'cannot_judge';
  await app.fire('ratings-form', 'input');
  assert.equal(storage.size, 1);
  assert.equal(app.elements['review-complete'].disabled, false);
  app.elements['review-complete'].checked = true;
  await app.fire('ratings-form', 'change');
  const saved = JSON.parse([...storage.values()][0]);
  assert.equal(saved.human_preference, 'completed');
  assert.equal(saved.cases[0].samples[0].voice_match, 5);
  assert.equal(saved.cases[0].samples[0].meaning_errors, note);
  assert.equal(saved.cases[0].samples[0].over_imitation, '과장된 어미');
  assert.equal(saved.cases[0].notes, '종합 의견');
  assert.equal(saved.cases[1].preferred_sample, 'tie');
  assert.equal(saved.cases[2].preferred_sample, 'cannot_judge');
  assert.equal(saved.cases[0].samples[1].voice_match, null);
  app = boot();
  assert.equal(app.elements[id + '-voice_match'].value, '5');
  assert.equal(app.elements[id + '-meaning_errors'].value, note);
  assert.equal(app.elements['review-complete'].checked, true);
  await app.fire('export-ratings', 'click');
  assert.equal(app.downloads[0].name, 'ratings.json');
  assert.deepEqual(JSON.parse(await app.downloads[0].blob.text()), saved);
  const key = [...storage.keys()][0];
  storage.clear();
  app = boot({blocked: true});
  assert.match(app.elements['save-status'].textContent, /저장.*불가|저장.*실패/);
  let warned = false;
  app.window.events.beforeunload({preventDefault() { warned = true; }});
  assert.equal(warned, false, 'An untouched blank form must not warn about lost edits');
  app.elements['import-ratings'].files = [{text: async () => JSON.stringify(saved)}];
  await app.fire('import-ratings', 'change');
  assert.equal(app.elements[id + '-meaning_errors'].value, note);
  assert.match(app.elements['save-status'].textContent, /저장.*불가|저장.*실패/);
  warned = false;
  app.window.events.beforeunload({preventDefault() { warned = true; }});
  assert.equal(warned, true);
  await app.fire('export-ratings', 'click');
  assert.deepEqual(JSON.parse(await app.downloads[0].blob.text()), saved);
  warned = false;
  app.window.events.beforeunload({preventDefault() { warned = true; }});
  assert.equal(warned, false);
  for (const corrupt of [null, {seed: 123, cases: []}, {...saved, packet_id: 'other'},
                        {...saved, human_preference: 'bogus'},
                        {...saved, cases: saved.cases.slice(1)},
                        {...saved, cases: [saved.cases[0], saved.cases[0], saved.cases[2]]}]) {
    app.elements['import-ratings'].files = [{text: async () => JSON.stringify(corrupt)}];
    await app.fire('import-ratings', 'change');
    assert.match(app.elements['save-status'].textContent, /불러오기 실패/);
    assert.equal(app.elements[id + '-meaning_errors'].value, note);
  }
  for (const change of [s => s.cases[0].preferred_sample = 'not-a-sample',
                        s => s.cases[0].preferred_sample = null,
                        s => s.cases[0].samples[0].voice_match = 6,
                        s => s.cases[0].samples[0].voice_match = true,
                        s => s.cases[0].samples[0].meaning_errors = {},
                        s => s.cases[0].samples[0].sample_id = 'other']) {
    const corrupt = JSON.parse(JSON.stringify(saved)); change(corrupt);
    app.elements['import-ratings'].files = [{text: async () => JSON.stringify(corrupt)}];
    await app.fire('import-ratings', 'change');
    assert.match(app.elements['save-status'].textContent, /불러오기 실패/);
    assert.equal(app.elements[id + '-meaning_errors'].value, note);
  }
  storage.set(key, '{broken');
  app = boot();
  assert.match(app.elements['save-status'].textContent, /복원 실패/);
  assert.equal(app.elements[id + '-voice_match'].value, '');
  storage.set(key, JSON.stringify(saved));
  app = boot();
  app.elements['case-1-preference'].value = '';
  await app.fire('ratings-form', 'change');
  assert.equal(app.elements['review-complete'].checked, false);
  assert.equal(app.elements['review-complete'].disabled, true);
  assert.equal(JSON.parse(storage.get(key)).human_preference, 'pending');
  // Imported extra metadata must never become part of the public export.
  app.elements['import-ratings'].files = [{text: async () => JSON.stringify({...saved, seed: 123, private: 'hidden-alpha'})}];
  await app.fire('import-ratings', 'change');
  await app.fire('export-ratings', 'click');
  assert.deepEqual(JSON.parse(await app.downloads[0].blob.text()), saved);
  app = boot({confirm: false});
  const unchanged = app.elements['case-0-notes'].value;
  const changed = JSON.parse(JSON.stringify(saved)); changed.cases[0].notes = '교체하지 않음';
  app.elements['import-ratings'].files = [{text: async () => JSON.stringify(changed)}];
  await app.fire('import-ratings', 'change');
  assert.equal(app.elements['case-0-notes'].value, unchanged, 'Cancelling import must preserve current edits');
})().catch(error => { console.error(error); process.exitCode = 1; });
'''
        result = subprocess.run([shutil.which("node"), "-e", harness], input=json.dumps({
            "elements": page.elements, "ratings": ratings, "script": page.scripts["review-app"],
        }), text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_seed_is_repeatable_and_independent_of_input_order(self):
        self.assertEqual(self.run_cli(output="one").returncode, 0)
        self.manifest["cases"][0]["outputs"].reverse()
        self.assertEqual(self.run_cli(output="two").returncode, 0)
        for name in ("review.html", "ratings.json", "private/key.json"):
            self.assertEqual((self.root / "one" / name).read_bytes(), (self.root / "two" / name).read_bytes())
        self.assertEqual(self.run_cli(output="three", seed="456").returncode, 0)
        self.assertNotEqual((self.root / "one/ratings.json").read_bytes(), (self.root / "three/ratings.json").read_bytes())

    def test_shuffle_changes_presentation_order_across_seeds(self):
        orders = set()
        for seed in range(8):
            name = f"out-{seed}"
            self.assertEqual(self.run_cli(output=name, seed=str(seed)).returncode, 0)
            key = json.loads((self.root / name / "private/key.json").read_text())
            orders.add(tuple(s["variant"] for s in key["cases"][0]["samples"]))
        self.assertEqual(len(orders), 2)

    def test_existing_directory_is_untouched(self):
        output = self.root / "review"
        output.mkdir()
        (output / "keep").write_text("keep")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(list(output.iterdir()), [output / "keep"])

    def test_malformed_shapes_and_ids_leave_no_artifact(self):
        for value in (None, [], {}, {"title": "x", "cases": []}, {"title": 5, "cases": []}):
            with self.subTest(value=value):
                self.assert_rejected(value if value is not None else "invalid")
        for field, value in (("id", "../escape"), ("id", "<script>"), ("id", ""),
                             ("brief", None), ("title", []), ("outputs", [{}]), ("outputs", "bad")):
            manifest = copy.deepcopy(self.manifest)
            manifest["cases"][0][field] = value
            with self.subTest(field=field, value=value):
                self.assert_rejected(manifest)

    def test_duplicate_cases_and_variants_are_rejected(self):
        duplicate = copy.deepcopy(self.manifest)
        duplicate["cases"].append(copy.deepcopy(duplicate["cases"][0]))
        self.assert_rejected(duplicate)
        self.manifest["cases"][0]["outputs"][1]["variant"] = "hidden-alpha"
        self.assert_rejected(self.manifest)

    def test_missing_empty_and_invalid_utf8_text_are_rejected(self):
        path = self.root / "secret-beta.txt"
        for content in (b"", b" \n\t", b"\xff"):
            path.write_bytes(content)
            self.assert_rejected(self.manifest)
        path.unlink()
        self.assert_rejected(self.manifest)

    def test_invalid_output_fields_are_rejected(self):
        for field, value in (("variant", ""), ("variant", None), ("path", ""), ("path", [])):
            manifest = copy.deepcopy(self.manifest)
            manifest["cases"][0]["outputs"][0][field] = value
            with self.subTest(field=field, value=value):
                self.assert_rejected(manifest)

    def test_default_seed_is_recorded(self):
        result = self.run_cli(seed=None)
        self.assertEqual(result.returncode, 0, result.stderr)
        key = json.loads((self.root / "review/private/key.json").read_text())
        self.assertIsInstance(key["seed"], int)

    def test_malformed_json_and_missing_manifest_leave_no_artifact(self):
        source = self.root / "broken.json"
        for content in ("{", "null", '{"title":"x", "cases":[null]}'):
            source.write_text(content)
            result = subprocess.run([sys.executable, str(SCRIPT), str(source),
                                     "--output", str(self.root / "review")], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b"error:", result.stderr)
            self.assertFalse((self.root / "review").exists())
        source.unlink()
        result = subprocess.run([sys.executable, str(SCRIPT), str(source),
                                 "--output", str(self.root / "review")], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "review").exists())

    def test_leading_newline_and_crlf_are_preserved(self):
        text = "\n\r\n  첫 줄\t<끝>\r\n"
        (self.root / "secret-alpha.txt").write_bytes(text.encode("utf-8"))
        self.assertEqual(self.run_cli().returncode, 0)
        page = (self.root / "review/review.html").read_bytes().decode("utf-8")
        self.assertIn("<pre><span></span>" + html.escape(text) + "</pre>", page)

    def test_existing_file_and_dangling_symlink_are_untouched(self):
        output = self.root / "review"
        output.write_text("sentinel")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertEqual(output.read_text(), "sentinel")
        output.unlink()
        output.symlink_to(self.root / "nonexistent")
        self.assertNotEqual(self.run_cli().returncode, 0)
        self.assertTrue(output.is_symlink())
        self.assertFalse((self.root / "nonexistent").exists())

    def test_cli_help(self):
        result = subprocess.run([sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        self.assertIn("--seed", result.stdout)
        self.assertIn("--output", result.stdout)


if __name__ == "__main__":
    unittest.main()
