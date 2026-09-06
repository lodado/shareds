"""Storage acceptance tests. Run unittest discovery from this skill's tests directory."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/manage_voice.py'


class StorageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('manage_voice', SCRIPT)
        cls.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.module)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name).resolve()
        self.root = self.base / 'voices'
        self.source = self.base / 'article.md'
        self.source.write_text('Original reference article.\n', encoding='utf-8')
        self.module.init_author(self.root, 'writer', 'https://example.com')

    def ingest(self, url='https://example.com/one', published='2026-08-10T00:00:00Z', collected='2026-08-20T00:00:00Z'):
        return self.module.import_article(self.root, 'writer', self.source, url, published, collected, title='Title', genre='essay')

    def test_import_idempotence_and_collection_history(self):
        first = self.ingest()
        self.assertEqual(first, self.ingest())
        self.ingest(collected='2026-08-21T00:00:00Z')
        manifest = json.loads((self.root / 'writer/corpus/manifest.json').read_text())
        self.assertEqual(1, len(manifest['documents']))
        self.assertEqual(2, len(manifest['documents'][first]['collections']))
        self.assertEqual(1, len(list((self.root / 'writer/corpus/documents').rglob('*.md'))))

    def test_temporal_window_timezone_and_future_collection(self):
        self.ingest(url='https://e/lower', published='2026-08-02T09:00:00+09:00')
        self.ingest(url='https://e/old', published='2026-08-02T08:59:59+09:00')
        self.ingest(url='https://e/upper', published='2026-09-01T00:00:00Z')
        self.ingest(url='https://e/future', collected='2026-09-01T00:00:01Z')
        selected = self.module.select_documents(self.root, 'writer', '2026-09-01T00:00:00Z', 30)
        self.assertEqual(['https://e/lower'], [d['url'] for d in selected])

    def test_republished_version_uses_latest_eligible_collection(self):
        old = self.ingest()
        self.source.write_text('Revised reference.\n')
        new = self.ingest(published='2026-08-25T00:00:00Z', collected='2026-08-26T00:00:00Z')
        self.assertNotEqual(old, new)
        self.assertEqual(old, self.module.select_documents(self.root, 'writer', '2026-08-24T00:00:00Z', 30)[0]['version_id'])
        self.assertEqual(new, self.module.select_documents(self.root, 'writer', '2026-09-01T00:00:00Z', 30)[0]['version_id'])
        self.assertEqual(2, len(list((self.root / 'writer/corpus/documents').rglob('*.md'))))

    def test_metadata_only_republication_and_unknown_publication(self):
        self.ingest()
        self.ingest(published='2026-09-02T00:00:00Z', collected='2026-08-30T00:00:00Z')
        self.assertEqual([], self.module.select_documents(self.root, 'writer', '2026-09-01T00:00:00Z', 30))

    def test_bad_slug_naive_dates_and_symlinks_rejected(self):
        for slug in ('../escape', '/tmp/escape', '.', 'two/parts', 'UPPER', ''):
            with self.subTest(slug=slug), self.assertRaises(ValueError):
                self.module.init_author(self.root, slug)
        with self.assertRaises(ValueError):
            self.ingest(published='2026-08-10T00:00:00')
        link = self.base / 'link.md'
        link.symlink_to(self.source)
        with self.assertRaises(ValueError):
            self.module.import_article(self.root, 'writer', link, 'https://e/a', '2026-08-10T00:00:00Z', '2026-08-20T00:00:00Z')
        evil = self.root / 'evil'
        evil.symlink_to(self.base, target_is_directory=True)
        with self.assertRaises(ValueError):
            self.module.init_author(self.root, 'evil')

    def test_correction_versions_and_separate_reason_do_not_change_reference(self):
        self.ingest()
        before = (self.root / 'writer/corpus/manifest.json').read_bytes()
        overrides_before = (self.root / 'writer/user-overrides.json').read_bytes()
        edited = self.base / 'edited.txt'
        edited.write_text('Edited words.\n')
        first = self.module.record_correction(self.root, 'writer', self.source, edited, 'STYLE_CORRECTION', 'Less formal')
        second = self.module.record_correction(self.root, 'writer', self.source, edited, 'FACT_CORRECTION', 'Fix a date')
        self.assertNotEqual(first, second)
        folder = self.root / 'writer/corrections' / first
        self.assertEqual('Less formal', (folder / 'reason.txt').read_text())
        self.assertIn('+Edited words.', (folder / 'changes.diff').read_text())
        self.assertEqual(before, (self.root / 'writer/corpus/manifest.json').read_bytes())
        self.assertEqual(overrides_before, (self.root / 'writer/user-overrides.json').read_bytes())

    def test_snapshot_unique_immutable_stable_names_and_no_activation(self):
        self.ingest()
        stage_article = self.module.stage_article
        def observe_stage(entry, raw, inputs):
            stage_article(entry, raw, inputs)
            self.staged = inputs
            self.assertEqual([self.module.document_id('https://example.com/one') + '.md'], sorted(p.name for p in inputs.iterdir()))
        with patch.object(self.module, 'stage_article', side_effect=observe_stage):
            first = self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z', 30)
            original = {str(p.relative_to(self.root)): p.read_bytes() for p in (self.root / 'writer/profiles' / first).rglob('*') if p.is_file()}
            second = self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z', 30)
        self.assertNotEqual(first, second)
        self.assertFalse(self.staged.exists())
        self.assertFalse((self.root / 'writer/active-profile.json').exists())
        for path, content in original.items():
            self.assertEqual(content, (self.root / path).read_bytes())
        with self.assertRaises(ValueError):
            self.module.activate_profile(self.root, 'writer', first)

    def test_reconcile_preserves_history_and_quarantines_joined_groups(self):
        docs = [{'id': key, 'blocks': [{'type': 'paragraph', 'text': key}]} for key in ('a', 'b', 'c', 'd')]
        splits = {'profile': ['a', 'b', 'c', 'd'], 'validation': [], 'held_out': [], 'duplicate_groups': [['a', 'b']], 'status': 'ready', 'warnings': [], 'independent_groups': 3}
        reconciled = self.module.reconcile_splits(docs, splits, {'a': ['profile'], 'b': ['held_out'], 'c': ['validation']})
        self.assertEqual(['a', 'b'], reconciled['quarantine'])
        self.assertEqual(['c'], reconciled['validation'])
        self.assertEqual(['d'], reconciled['profile'])
        self.assertEqual([], reconciled['held_out'])
        self.assertEqual(['a', 'b', 'c', 'd'], splits['profile'])

    def test_reconcile_uses_duplicates_from_nonoverlapping_history(self):
        block = {'type': 'paragraph', 'text': 'The exact same original article in a new URL.'}
        docs = [{'id': 'new', 'blocks': [block]}]
        splits = {'profile': ['new'], 'validation': [], 'held_out': [], 'duplicate_groups': [], 'warnings': []}
        history = {'assignments': {'old': ['held_out']}, 'documents': [{'id': 'old', 'blocks': [block]}]}
        reconciled = self.module.reconcile_splits(docs, splits, history)
        self.assertEqual(['new'], reconciled['held_out'])
        self.assertEqual([], reconciled['profile'])

    def test_real_snapshot_engine_outputs_and_stable_ids_across_formats(self):
        self.ingest()
        first = self.module.create_snapshot(self.root, 'writer', '2026-08-24T00:00:00Z')
        first_docs = json.loads((self.root / 'writer/profiles' / first / 'documents.json').read_text())
        html = self.base / 'article.html'
        html.write_text('<article><h1>Title</h1><p>Revised reference article.</p></article>')
        self.module.import_article(self.root, 'writer', html, 'https://example.com/one', '2026-08-25T00:00:00Z', '2026-08-26T00:00:00Z')
        second = self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
        second_path = self.root / 'writer/profiles' / second
        second_docs = json.loads((second_path / 'documents.json').read_text())
        self.assertEqual(first_docs[0]['id'], second_docs[0]['id'])
        self.assertNotIn('<article>', str(second_docs[0]['blocks']))
        metrics = json.loads((second_path / 'references/style-metrics.json').read_text())
        splits = json.loads((second_path / 'splits.json').read_text())
        self.assertEqual(splits['profile'], metrics['document_ids'])
        snapshot = json.loads((second_path / 'snapshot.json').read_text())
        self.assertEqual(['profile'], snapshot['historical_assignments']['assignments'][first_docs[0]['id']])

    def test_selection_hides_future_history_and_unknown_publication(self):
        self.ingest()
        self.ingest(collected='2026-09-03T00:00:00Z')
        selected = self.module.select_documents(self.root, 'writer', '2026-09-01T00:00:00Z')
        self.assertNotIn('2026-09-03', json.dumps(selected))
        manifest_path = self.root / 'writer/corpus/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        for entry in manifest['documents'].values():
            for collection in entry['collections']:
                collection['published_at'] = None
        manifest_path.write_text(json.dumps(manifest))
        self.assertEqual([], self.module.select_documents(self.root, 'writer', '2026-09-01T00:00:00Z'))

    def test_collection_at_cutoff_is_included(self):
        self.ingest(collected='2026-09-01T09:00:00+09:00')
        self.assertEqual(1, len(self.module.select_documents(self.root, 'writer', '2026-09-01T00:00:00Z')))

    def test_reviewed_exploratory_activation_checks_real_evidence(self):
        self.ingest()
        version = self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
        directory = self.root / 'writer/profiles' / version
        profile_path = directory / 'references/style-profile.json'
        docs = json.loads((directory / 'documents.json').read_text())
        reference = docs[0]['id'] + ':' + docs[0]['blocks'][0]['id']
        rule = {'id': 'opening-1', 'dimension': 'opening', 'instruction': 'Use a direct opening.', 'scope': {'genres': ['essay'], 'roles': ['opening']}, 'evidence': [reference], 'confidence': 'weak', 'exceptions': []}
        profile = {'status': 'reviewed', 'global_rules': [], 'genre_rules': {}, 'anti_patterns': [], 'weak_observations': [rule]}
        profile_path.write_text(json.dumps(profile))
        with self.assertRaisesRegex(ValueError, 'exploratory'):
            self.module.activate_profile(self.root, 'writer', version)
        profile['mode'] = 'exploratory'
        profile_path.write_text(json.dumps(profile))
        self.assertEqual(version, self.module.activate_profile(self.root, 'writer', version))
        active_path = self.root / 'writer/active-profile.json'
        active = active_path.read_bytes()
        self.assertEqual(version, json.loads(active)['profile'])
        rule['evidence'] = ['missing:block']
        profile_path.write_text(json.dumps(profile))
        with self.assertRaisesRegex(ValueError, 'validation failed'):
            self.module.activate_profile(self.root, 'writer', version)
        self.assertEqual(active, active_path.read_bytes())
        rule['evidence'] = [reference]
        rule['confidence'] = 'high'
        profile_path.write_text(json.dumps(profile))
        with self.assertRaises(ValueError):
            self.module.activate_profile(self.root, 'writer', version)

    def test_expired_article_near_duplicate_new_url_keeps_heldout_role(self):
        words = ['astronomy', 'baking', 'canoeing', 'dancing', 'electronics', 'farming', 'geography', 'hiking', 'improv', 'juggling', 'knitting', 'linguistics']
        originals = {}
        for i, word in enumerate(words):
            text = ((word + ' ') * 40).strip() + '.'
            self.source.write_text(text)
            url = 'https://example.com/article-' + str(i)
            originals[url] = text
            self.ingest(url=url)
        first = self.module.create_snapshot(self.root, 'writer', '2026-08-24T00:00:00Z')
        first_path = self.root / 'writer/profiles' / first
        splits = json.loads((first_path / 'splits.json').read_text())
        docs = json.loads((first_path / 'documents.json').read_text())
        heldout = next(doc for doc in docs if doc['id'] in splits['held_out'])
        self.source.write_text(originals[heldout['url']] + 'x')
        self.ingest(url='https://example.com/republished', published='2026-09-10T00:00:00Z', collected='2026-09-11T00:00:00Z')
        second = self.module.create_snapshot(self.root, 'writer', '2026-09-12T00:00:00Z')
        second_path = self.root / 'writer/profiles' / second
        docs = json.loads((second_path / 'documents.json').read_text())
        splits = json.loads((second_path / 'splits.json').read_text())
        self.assertEqual(1, len(docs))
        self.assertEqual([docs[0]['id']], splits['held_out'])
        self.assertEqual([], splits['profile'])
        self.assertEqual([], json.loads((second_path / 'references/style-metrics.json').read_text())['document_ids'])
        self.assertNotIn(docs[0]['id'], (second_path / 'references/evidence.md').read_text())

    def test_snapshot_rejects_tampered_absolute_staging_id(self):
        self.ingest()
        manifest_path = self.root / 'writer/corpus/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        next(iter(manifest['documents'].values()))['document_id'] = str(self.base / 'escape')
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
        self.assertFalse((self.base / 'escape.md').exists())

    def test_cli_local_import_snapshot_correction_and_default_root(self):
        def cli(*arguments, expected=0):
            result = subprocess.run([sys.executable, str(SCRIPT), *arguments], cwd=self.base, capture_output=True, text=True)
            self.assertEqual(expected, result.returncode, result.stderr)
            return json.loads(result.stdout)['result'] if expected == 0 else None
        cli('init', '--author', 'default')
        self.assertTrue((self.base / '.blog-voice/default/author.json').is_file())
        text = self.base / 'plain.txt'
        text.write_text('A plain local article.\n')
        common = ['--root', str(self.root), '--author', 'writer']
        cli('import', *common, '--file', str(text), '--url', 'https://e/cli', '--published-at', '2026-08-15T00:00:00Z', '--collected-at', '2026-08-20T00:00:00Z', '--title', 'CLI title', '--genre', 'essay')
        version = cli('snapshot', *common, '--as-of', '2026-09-01T00:00:00Z')
        directory = self.root / 'writer/profiles' / version
        doc = json.loads((directory / 'documents.json').read_text())[0]
        self.assertEqual('CLI title', doc['title'])
        self.assertEqual('essay', doc['genre'])
        self.assertEqual('CLI title', json.loads((directory / 'references/style-profile.json').read_text())['source_metadata'][0]['title'])
        cli('activate', *common, '--profile', version, expected=2)
        correction = cli('correction', *common, '--generated', str(text), '--edited', str(self.source), '--category', 'PERSONAL_PREFERENCE', '--reason', 'Prefer this')
        self.assertTrue((self.root / 'writer/corrections' / correction / 'changes.diff').is_file())
        cli('snapshot', *common, '--as-of', '2026-09-01T00:00:00', expected=2)
        cli('snapshot', *common, '--as-of', '2026-09-01T00:00:00Z', '--days', '0', expected=2)

    def test_empty_reviewed_profile_and_symlink_active_pointer_rejected(self):
        self.ingest()
        version = self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
        directory = self.root / 'writer/profiles' / version
        profile_path = directory / 'references/style-profile.json'
        empty = {'status': 'reviewed', 'mode': 'exploratory', 'global_rules': [], 'genre_rules': {}, 'anti_patterns': [], 'weak_observations': []}
        profile_path.write_text(json.dumps(empty))
        with self.assertRaisesRegex(ValueError, 'at least one'):
            self.module.activate_profile(self.root, 'writer', version)
        target = self.base / 'outside.json'
        target.write_text('do not replace')
        (self.root / 'writer/active-profile.json').symlink_to(target)
        with self.assertRaises(ValueError):
            self.module.atomic_write(self.root / 'writer/active-profile.json', '{}')
        self.assertEqual('do not replace', target.read_text())
        with self.assertRaises(ValueError):
            self.module.activate_profile(self.root, 'writer', '../../escape')

    def test_analysis_failure_leaves_no_snapshot_or_lock(self):
        self.ingest()
        analyzer = self.module.load_sibling('analyze_style')
        with patch.object(self.module, 'load_sibling', return_value=analyzer), patch.object(analyzer, 'write_outputs', side_effect=ValueError('analysis failed')):
            with self.assertRaisesRegex(ValueError, 'analysis failed'):
                self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
        self.assertEqual([], list((self.root / 'writer/profiles').iterdir()))
        self.assertEqual([], list((self.root / 'writer').glob('.snapshot-*')))
        self.assertFalse((self.root / 'writer/.storage-lock').exists())

    def test_raw_symlink_and_correction_symlink_rejected(self):
        version = self.ingest()
        manifest_path = self.root / 'writer/corpus/manifest.json'
        manifest = json.loads(manifest_path.read_text())
        raw = self.root / 'writer' / manifest['documents'][version]['raw_path']
        raw.unlink()
        raw.symlink_to(self.source)
        with self.assertRaises(ValueError):
            self.ingest()
        with self.assertRaises(ValueError):
            self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
        with self.assertRaises(ValueError):
            self.module.record_correction(self.root, 'writer', self.source, raw, 'STYLE_CORRECTION')
        with self.assertRaises(ValueError):
            self.module.record_correction(self.root, 'writer', self.source, self.source, 'UNKNOWN')
        self.assertEqual([], list((self.root / 'writer/corrections').iterdir()))

    def test_snapshot_preserves_native_text_and_html_block_parsing(self):
        analyzer = self.module.load_sibling('analyze_style')
        cases = {'.txt': '# sentence\n\n> author prose', '.html': '<p># sentence</p><ul><li>First line<br>Second line</li></ul>'}
        for extension, content in cases.items():
            with self.subTest(extension=extension):
                original_dir = self.base / ('native-' + extension[1:])
                original_dir.mkdir()
                original = original_dir / ('article' + extension)
                original.write_text(content)
                expected = analyzer.load_documents(original_dir)[0]['blocks']
                self.module.import_article(self.root, 'writer', original, 'https://example.com/' + extension[1:], '2026-08-10T00:00:00Z', '2026-08-20T00:00:00Z')
                version = self.module.create_snapshot(self.root, 'writer', '2026-09-01T00:00:00Z')
                docs = json.loads((self.root / 'writer/profiles' / version / 'documents.json').read_text())
                actual = next(doc for doc in docs if doc['url'] == 'https://example.com/' + extension[1:])
                self.assertEqual(expected, actual['blocks'])

    def test_init_creates_persistent_slots_without_overwriting_user_overrides(self):
        folder = self.root / 'writer'
        self.assertTrue((folder / 'runs').is_dir())
        self.assertTrue((folder / 'history').is_dir())
        overrides = folder / 'user-overrides.json'
        self.assertEqual({'schema_version': 1, 'overrides': []}, json.loads(overrides.read_text()))
        overrides.write_text('{"overrides": ["keep my setting"]}')
        before = overrides.read_bytes()
        self.module.init_author(self.root, 'writer')
        self.assertEqual(before, overrides.read_bytes())

    def test_cli_init_and_validation(self):
        result = subprocess.run([sys.executable, str(SCRIPT), 'init', '--root', str(self.root), '--author', 'cli'], capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)
        result = subprocess.run([sys.executable, str(SCRIPT), 'init', '--root', str(self.root), '--author', '../bad'], capture_output=True, text=True)
        self.assertNotEqual(0, result.returncode)


if __name__ == '__main__':
    unittest.main()
