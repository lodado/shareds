"""Deterministic validation tests, runnable with unittest discover."""
import importlib.util
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/validate_style.py'
sys.path.insert(0, str(SCRIPT.parent))
spec = importlib.util.spec_from_file_location('validate_style', SCRIPT)
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)


def doc(text, id='source', kind='paragraph'):
    return {'id': id, 'blocks': [{'id': 'b1', 'type': kind, 'text': text}]}


def rule(evidence=None):
    return {'id': 'r1', 'dimension': 'sentence_architecture', 'instruction': 'Vary sentence lengths.',
            'scope': {'genres': ['essay'], 'roles': ['explanation']},
            'evidence': evidence or ['source:b1'], 'confidence': 'weak', 'exceptions': []}


def profile(r=None):
    return {'global_rules': [r or rule()], 'genre_rules': {},
            'weak_observations': [], 'anti_patterns': []}


class TitleRuleTests(unittest.TestCase):
    def test_title_evidence_requires_heading_block(self):
        for dimension, roles in [('title_craft', ['title']), ('formatting', ['title'])]:
            with self.subTest(dimension=dimension):
                title = rule()
                title['dimension'] = dimension
                title['scope']['roles'] = roles
                findings = validator.validate_profile(
                    profile(title), [doc('This is a body paragraph.')], {'profile': ['source']})
                self.assertTrue(any('heading' in finding['problem'] for finding in findings))

    def test_title_rule_with_real_heading_evidence(self):
        title = rule()
        title.update(dimension='title_craft', instruction='Name the topic in a short title.')
        title['scope']['roles'] = ['title']
        self.assertEqual(validator.validate_profile(
            profile(title), [doc('A small notebook', kind='heading')], {'profile': ['source']}), [])

    def test_title_rule_cannot_use_held_out_heading(self):
        title = rule()
        title.update(dimension='title_craft')
        title['scope']['roles'] = ['title']
        findings = validator.validate_profile(profile(title), [doc('A small notebook', kind='heading')],
            {'profile': ['source'], 'held_out': ['source']})
        self.assertTrue(any('exclusively' in finding['problem'] for finding in findings))


class OverlapTests(unittest.TestCase):
    def test_target_voice_review_is_explicitly_not_run(self):
        self.assertEqual(validator.validate_documents([], [])['reviews'].get('target_voice_match'), 'not_run')

    def test_copied_english_and_korean(self):
        for text in ['A distinctive long paragraph about saffron sunsets and ancient observatories. ' * 3,
                     '나는 오늘 오래된 골목에서 반짝이는 빛을 발견했다. 그 빛은 잊었던 기억을 조용히 불러왔다. ' * 3]:
            with self.subTest(text=text):
                report = validator.validate_documents([doc(text, 'draft')], [doc(text)])
                self.assertEqual(report['status'], 'review_required')
                finding = report['findings'][0]
                for field in ('block', 'category', 'rule', 'problem', 'suggestion', 'source', 'evidence', 'measurement'):
                    self.assertIn(field, finding)
                self.assertIn('caveat', report)

    def test_nfc_whitespace_normalization(self):
        text = '한글 문장을 충분히 길게 써서 같은 원문인지 확인하는 테스트입니다. ' * 3
        draft = unicodedata.normalize('NFD', text).replace(' ', '\n  ')
        self.assertEqual(validator.validate_documents([doc(draft, 'draft')], [doc(text)])['status'], 'review_required')

    def test_novel_and_short_common_text_do_not_flag(self):
        for draft in ['Thank you for reading.', 'Orchids grow beneath a vaulted greenhouse beside the eastern river.']:
            report = validator.validate_documents([doc(draft, 'draft')], [doc('Thank you for reading.')])
            self.assertEqual(report['status'], 'no_overlap_flags')

    def test_ngram_overlap_without_long_contiguous_match(self):
        source = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen'
        draft = source.replace('eight', 'changed')
        report = validator.validate_documents([doc(draft, 'draft')], [doc(source)], min_shared_chars=1000)
        self.assertTrue(any(f['rule'] == 'token_ngram_overlap' for f in report['findings']))

    def test_quote_and_code_are_informational(self):
        text = 'Copied example with many distinctive tokens to establish measurable overlap. ' * 3
        for kind in ('quote', 'code'):
            for drafts, sources in (([doc(text, 'draft', kind)], [doc(text)]),
                                    ([doc(text, 'draft')], [doc(text, kind=kind)])):
                report = validator.validate_documents(drafts, sources)
                self.assertEqual(report['status'], 'no_overlap_flags')
                self.assertTrue(report['findings'])
                self.assertTrue(all(f['severity'] == 'info' for f in report['findings']))

    def test_ledger_missing_literal_is_warning_and_reviews_not_run(self):
        report = validator.validate_documents([doc('An unrelated draft.', 'draft')], [], ledger={'protected_literals': ['2026-09-01', '42%']})
        self.assertEqual(report['status'], 'review_required')
        self.assertEqual(len(report['findings']), 2)
        self.assertTrue(all(f['severity'] == 'warning' for f in report['findings']))
        self.assertEqual(set(report['reviews']), {'content_preservation', 'style_match',
                         'over_imitation', 'source_leakage', 'generic_ai_signals', 'target_voice_match'})
        self.assertEqual(set(report['reviews'].values()), {'not_run'})
        self.assertNotIn('originality_score', report)
        self.assertIn('not proof', report['findings'][0]['problem'])

    def test_size_limits_are_explicit_review_warnings(self):
        text = 'a' * (validator.MAX_BLOCK_CHARS + 1)
        report = validator.validate_documents([doc(text, 'draft')], [doc('a')])
        self.assertEqual(report['status'], 'review_required')
        self.assertEqual(report['findings'][0]['rule'], 'block_size_limit')
        report = validator.validate_documents([doc('a' * 2100, 'draft')], [doc('b' * 2100)])
        self.assertTrue(any(f['rule'] == 'comparison_size_limit' for f in report['findings']))

    def test_aggregate_comparison_budget_is_reported(self):
        for text, count in (('Short common phrase.', 33), ('Distinctive sentence with repeated wording. ' * 42, 4)):
            drafts = [doc(text, f'draft-{i}') for i in range(count)]
            sources = [doc(text, f'source-{i}') for i in range(count)]
            report = validator.validate_documents(drafts, sources)
            limits = [f for f in report['findings'] if f['rule'] == 'comparison_budget_exhausted']
            self.assertEqual(len(limits), 1)
            measurement = limits[0]['measurement']
            self.assertLessEqual(measurement['comparisons_completed'], 1000)
            self.assertLessEqual(measurement['character_product_used'], 20_000_000)
            self.assertTrue(measurement['incomplete'])
            self.assertEqual(report['status'], 'review_required')

    def test_present_literal_does_not_claim_semantic_success(self):
        report = validator.validate_documents([doc('42% of something.', 'draft')], [], ledger={'protected_literals': ['42%']})
        self.assertFalse(report['findings'])
        self.assertEqual(set(report['reviews']), {'content_preservation', 'style_match',
                         'over_imitation', 'source_leakage', 'generic_ai_signals', 'target_voice_match'})
        self.assertEqual(set(report['reviews'].values()), {'not_run'})
        for invalid in ({}, {'protected_literals': [42]}, {'protected_literals': ['']}):
            with self.assertRaises(ValueError):
                validator.validate_documents([], [], ledger=invalid)

    def test_invalid_thresholds_rejected(self):
        for kwargs in ({'ngram_size': 0}, {'overlap_threshold': 1.2}, {'min_shared_chars': 0}):
            with self.assertRaises(ValueError):
                validator.validate_documents([], [], **kwargs)


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.docs = [doc('Profile text.'), doc('Held out text.', 'heldout')]
        self.splits = {'profile': ['source'], 'heldout': ['heldout']}

    def test_valid_weak_rule(self):
        self.assertEqual(validator.validate_profile(profile(), self.docs, self.splits), [])

    def test_heldout_and_missing_evidence_rejected(self):
        for ref in ('heldout:b1', 'source:missing', 'missing:b1'):
            with self.subTest(ref=ref):
                errors = validator.validate_profile(profile(rule([ref])), self.docs, self.splits)
                self.assertTrue(errors)
                self.assertTrue(all('problem' in f for f in errors))

    def test_one_document_high_confidence_and_universal_scope_rejected(self):
        r = rule()
        r['confidence'] = 'high'
        self.assertTrue(validator.validate_profile(profile(r), self.docs, self.splits))
        r['confidence'] = 'weak'
        r['scope'] = {'genres': ['*'], 'roles': ['*']}
        self.assertTrue(validator.validate_profile(profile(r), self.docs, self.splits))

    def test_singleton_medium_only_in_scoped_genre(self):
        r = rule()
        r['confidence'] = 'medium'
        self.assertTrue(validator.validate_profile(profile(r), self.docs, self.splits))
        p = profile()
        p['global_rules'] = []
        p['genre_rules'] = {'essay': [r]}
        self.assertFalse(validator.validate_profile(p, self.docs, self.splits))

    def test_multi_document_high_confidence_and_split_overlap(self):
        r = rule(['source:b1', 'heldout:b1'])
        r['confidence'] = 'high'
        splits = {'profile': ['source', 'heldout'], 'validation': [], 'held_out': []}
        self.assertFalse(validator.validate_profile(profile(r), self.docs, splits))
        splits['held_out'] = ['heldout']
        self.assertTrue(validator.validate_profile(profile(r), self.docs, splits))

    def test_duplicate_evidence_is_one_independent_source(self):
        documents = [doc('Identical original passage.', 'a'), doc('Identical original passage.', 'b')]
        r = rule(['a:b1', 'b:b1'])
        r['confidence'] = 'high'
        r['scope'] = {'genres': [], 'roles': []}
        for groups in ([['a', 'b']], []):
            splits = {'profile': ['a', 'b'], 'duplicate_groups': groups}
            errors = validator.validate_profile(profile(r), documents, splits)
            self.assertTrue(any('high confidence' in f['problem'] for f in errors))
            self.assertTrue(any('universal' in f['problem'] for f in errors))

    def test_duplicate_of_held_out_evidence_is_contamination(self):
        documents = [doc('The same original passage.', 'a'), doc('The same original passage.', 'b')]
        splits = {'profile': ['a'], 'held_out': ['b'], 'duplicate_groups': [['a', 'b']]}
        errors = validator.validate_profile(profile(rule(['a:b1'])), documents, splits)
        self.assertTrue(any('profile set' in f['problem'] for f in errors))

    def test_malformed_shapes_fail_closed(self):
        for p in (None, [], {'global_rules': [None]}, profile({'id': []})):
            self.assertTrue(validator.validate_profile(p, self.docs, self.splits))
        self.assertTrue(validator.validate_profile(profile(), self.docs, None))
        self.assertTrue(validator.validate_profile(profile(), self.docs, {'profile': ['source'], 'held_out': None}))

    def test_required_fields_whitelists_and_collections(self):
        r = rule()
        del r['exceptions']
        self.assertTrue(validator.validate_profile(profile(r), self.docs, self.splits))
        for key in ('dimension', 'confidence'):
            r = rule()
            r[key] = 'invented'
            self.assertTrue(validator.validate_profile(profile(r), self.docs, self.splits))
        for key in ('genres', 'roles'):
            r = rule()
            r['scope'][key] = ['invented']
            self.assertTrue(validator.validate_profile(profile(r), self.docs, self.splits))
        self.assertTrue(validator.validate_profile({}, self.docs, self.splits))


class CLITests(unittest.TestCase):
    def test_profile_api_imported_by_path_resolves_sibling(self):
        code = ("import importlib.util, pathlib, sys; "
                f"p = pathlib.Path({str(SCRIPT)!r}); "
                "sys.path = [entry for entry in sys.path if pathlib.Path(entry).resolve() != p.parent]; "
                "spec = importlib.util.spec_from_file_location('isolated_validator', p); "
                "module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); "
                f"assert module.validate_profile({profile()!r}, {[doc('Source text.')]!r}, {{'profile': ['source']}}) == []")
        result = subprocess.run([sys.executable, '-c', code], text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_snapshot_documents_preserve_evidence_ids(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('JCODE_SCRATCH_DIR')) as tmp:
            root = Path(tmp)
            snapshot = root / 'snapshot'
            snapshot.mkdir()
            documents = [dict(doc('Original profile source.', 'stable-id'), title='Source', path='original.md', version='v1')]
            (snapshot / 'documents.json').write_text(json.dumps(documents), encoding='utf-8')
            (snapshot / 'splits.json').write_text(json.dumps({'profile': ['stable-id']}), encoding='utf-8')
            (snapshot / 'generated-reference.md').write_text('Generated instructions, not corpus.', encoding='utf-8')
            profile_path = snapshot / 'profile.json'
            profile_path.write_text(json.dumps(profile(rule(['stable-id:b1']))), encoding='utf-8')
            draft = root / 'draft.md'
            draft.write_text('A fresh draft.', encoding='utf-8')
            output = root / 'output.json'
            command = [sys.executable, str(SCRIPT), str(draft), '--corpus', str(snapshot),
                       '--profile', str(profile_path), '--output', str(output)]
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text())['findings'], [])
            for invalid in ({}, [None], [{'id': 'bad'}], documents + documents):
                (snapshot / 'documents.json').write_text(json.dumps(invalid), encoding='utf-8')
                result = subprocess.run(command, text=True, capture_output=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertNotIn('Traceback', result.stderr)

    def test_profile_cli_embedded_and_file_splits(self):
        sys.path.insert(0, str(SCRIPT.parent))
        try:
            from analyze_style import load_documents
        finally:
            sys.path.pop(0)
        with tempfile.TemporaryDirectory(dir=os.environ.get('JCODE_SCRATCH_DIR')) as tmp:
            root = Path(tmp)
            corpus = root / 'corpus'
            corpus.mkdir()
            (corpus / 'source.txt').write_text('Source text.', encoding='utf-8')
            draft = root / 'draft.txt'
            draft.write_text('Fresh draft.', encoding='utf-8')
            documents = load_documents(corpus)
            source = documents[0]
            reference = source['id'] + ':' + source['blocks'][0]['id']
            p = profile(rule([reference]))
            splits = {'profile': [source['id']], 'validation': [], 'held_out': []}
            profile_path = root / 'profile.json'
            output = root / 'report.json'
            command = [sys.executable, str(SCRIPT), str(draft), '--corpus', str(corpus),
                       '--output', str(output), '--profile', str(profile_path)]
            for embedded in (True, False):
                if embedded:
                    p['splits'] = splits
                else:
                    del p['splits']
                    (corpus / 'splits.json').write_text(json.dumps(splits), encoding='utf-8')
                profile_path.write_text(json.dumps(p), encoding='utf-8')
                result = subprocess.run(command, text=True, capture_output=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(json.loads(output.read_text())['findings'], [])
            p['global_rules'][0]['evidence'] = ['nonexistent:b1']
            profile_path.write_text(json.dumps(p), encoding='utf-8')
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(output.read_text())['status'], 'review_required')

    def test_draft_file_corpus_output_and_options(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('JCODE_SCRATCH_DIR')) as tmp:
            root = Path(tmp)
            corpus = root / 'corpus'
            corpus.mkdir()
            text = 'A distinctive narrative about amber lanterns beyond the old station. ' * 3
            (corpus / 'source.md').write_text(text, encoding='utf-8')
            draft = root / 'draft.md'
            draft.write_text(text, encoding='utf-8')
            ledger = root / 'ledger.json'
            ledger.write_text(json.dumps({'protected_literals': ['absent']}), encoding='utf-8')
            output = root / 'nested' / 'report.json'
            command = [sys.executable, str(SCRIPT), str(draft), '--corpus', str(corpus),
                       '--output', str(output), '--ledger', str(ledger), '--min-shared-chars', '80',
                       '--ngram-size', '5', '--overlap-threshold', '.35']
            result = subprocess.run(command, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(report['status'], 'review_required')
            self.assertTrue(any(f['rule'] == 'shared_contiguous_text' for f in report['findings']))
            self.assertTrue(any(f['rule'] == 'missing_protected_literal' for f in report['findings']))
            self.assertEqual(subprocess.run(command + ['--ngram-size', '0'], capture_output=True).returncode, 2)


if __name__ == '__main__':
    unittest.main()
