"""Acceptance tests for the standalone, stdlib corpus analyzer."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/analyze_style.py'
spec = importlib.util.spec_from_file_location('analyze_style', SCRIPT)
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'input'
        self.source.mkdir()

    def put(self, name, text):
        path = self.source / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def test_empty_and_small(self):
        self.assertEqual(analysis.load_documents(self.source), [])
        splits = analysis.split_documents([])
        self.assertNotEqual(splits['status'], 'ready')
        self.assertTrue(splits['warnings'])
        self.assertEqual(analysis.analyze_documents([])['distributions']['paragraph_characters']['count'], 0)
        self.put('one.txt', 'A small paragraph.')
        docs = analysis.load_documents(self.source)
        self.assertEqual(analysis.split_documents(docs)['profile'], [docs[0]['id']])

    def test_ids_versions_and_recursive_order(self):
        self.put('nested/a.md', '# Title\n\nHello world.')
        first = analysis.load_documents(self.source)[0]
        self.put('z.txt', 'Unrelated')
        self.assertEqual(first, analysis.load_documents(self.source)[0])
        self.put('nested/a.md', '# Title\n\nChanged.')
        changed = analysis.load_documents(self.source)[0]
        self.assertEqual(first['id'], changed['id'])
        self.assertNotEqual(first['version'], changed['version'])
        self.assertEqual(first['blocks'][1]['id'], 'paragraph-01')

    def test_html_injection_and_structures(self):
        self.put('a.html', '<title>Page</title><script>alert("SECRET")</script><style>SECRET</style><h1>Heading</h1><p>Hello &amp; bye.</p><ul><li>Item</li></ul><blockquote><p>Quoted secret.</p></blockquote><pre><code>print("code")</code></pre>')
        doc = analysis.load_documents(self.source)[0]
        self.assertNotIn('SECRET', json.dumps(doc))
        self.assertEqual({b['type'] for b in doc['blocks']}, {'heading', 'paragraph', 'list', 'quote', 'code'})
        metrics = analysis.analyze_documents([doc])
        self.assertEqual(metrics['counts']['prose_paragraphs'], 1)
        self.assertEqual(metrics['counts']['list_items'], 1)

    def test_html_nested_list_prose_is_excluded(self):
        self.put('nested.html', '<ul><li><p>List! Not prose?</p></li></ul><code>code!</code><p>Actual prose.</p>')
        docs = analysis.load_documents(self.source)
        self.assertEqual([b['type'] for b in docs[0]['blocks']], ['list', 'code', 'paragraph'])
        self.assertEqual(analysis.analyze_documents(docs)['counts']['sentences'], 1)

    def test_markdown_fences_quotes_and_denominators(self):
        self.put('a.md', '# Heading!\n\nI write? Yes!\n\n> Quote!\n\n```python\nprint("!")\n\n# not heading\n```\n\n- item!')
        docs = analysis.load_documents(self.source)
        self.assertEqual([b['type'] for b in docs[0]['blocks']], ['heading', 'paragraph', 'quote', 'code', 'list'])
        metrics = analysis.analyze_documents(docs)
        self.assertEqual(metrics['counts']['sentences'], 2)
        self.assertEqual(metrics['counts']['prose_characters'], len('I write? Yes!'))
        self.assertEqual(metrics['counts']['whitespace_units'], 3)
        self.assertEqual(metrics['punctuation']['!']['count'], 1)
        self.assertEqual(metrics['distributions']['sentences_per_paragraph']['median'], 2)
        self.assertEqual(metrics['korean_endings']['unmatched'], 2)

    def test_duplicate_groups_determinism(self):
        text = 'The quick brown fox jumps over a lazy dog. ' * 20
        self.put('a.txt', text)
        self.put('b.txt', text.upper())
        self.put('c.txt', text + ' The quick brown fox jumps.')
        for i in range(12):
            self.put(f'unique-{i}.txt', chr(0xAC00 + i) * 100)
        docs = analysis.load_documents(self.source)
        splits = analysis.split_documents(docs, seed=42)
        self.assertEqual(splits, analysis.split_documents(list(reversed(docs)), seed=42))
        duplicates = {d['id'] for d in docs if d['path'] in ('a.txt', 'b.txt', 'c.txt')}
        self.assertIn(sorted(duplicates), splits['duplicate_groups'])
        self.assertTrue(any(duplicates <= set(splits[role]) for role in ('profile', 'validation', 'held_out')))
        self.assertEqual(splits['status'], 'ready')
        self.assertTrue(splits['validation'])
        self.assertTrue(splits['held_out'])

    def test_transitive_duplicates(self):
        base = ''.join(chr(0xAC00 + i) for i in range(100))
        self.put('a.txt', 'abcdefgh' + base[8:])
        self.put('b.txt', base)
        self.put('c.txt', base[:-8] + 'ijklmnop')
        docs = analysis.load_documents(self.source)
        splits = analysis.split_documents(docs)
        self.assertEqual(splits['independent_groups'], 1)
        self.assertEqual(splits['duplicate_groups'], [sorted(d['id'] for d in docs)])

    def test_korean_quantiles_and_zero_denominators(self):
        self.put('a.txt', '저는 씁니다. 하지만 좋아요!\n\n나는 간다?')
        metrics = analysis.analyze_documents(analysis.load_documents(self.source))
        self.assertEqual(metrics['first_person']['count'], 2)
        self.assertEqual(metrics['connectives']['count'], 1)
        self.assertEqual(metrics['korean_endings']['denominator'], 3)
        self.assertEqual(metrics['korean_endings']['unmatched'], 0)
        distribution = analysis._distribution([0, 10])
        self.assertEqual(distribution, {'count': 2, 'min': 0, 'p10': 1, 'median': 5, 'p90': 9, 'max': 10})
        self.assertIsNone(analysis.analyze_documents([])['questions']['rate'])

    def test_fence_length_and_unclosed_fence(self):
        self.put('a.md', '````python\n```\nsecret!\n````\n\nPublic.\n\n~~~\nunclosed!')
        docs = analysis.load_documents(self.source)
        self.assertEqual([b['type'] for b in docs[0]['blocks']], ['code', 'paragraph', 'code'])
        self.assertEqual(analysis.analyze_documents(docs)['counts']['sentences'], 1)

    def test_invalid_assignment_rejected_before_writes(self):
        self.put('a.txt', 'Hello.')
        docs = analysis.load_documents(self.source)
        splits = analysis.split_documents(docs)
        splits['held_out'] = splits['profile'][:]
        output = self.root / 'bad'
        with self.assertRaises(ValueError):
            analysis.write_outputs(output, docs, splits)
        self.assertFalse(output.exists())

    def test_quarantine_excluded_from_references(self):
        self.put('a.txt', 'QUARANTINE_ONLY_SENTINEL')
        docs = analysis.load_documents(self.source)
        splits = analysis.split_documents(docs)
        splits['quarantine'] = splits['profile']
        splits['profile'] = []
        output = self.root / 'quarantined'
        analysis.write_outputs(output, docs, splits)
        metrics = json.loads((output / 'references/style-metrics.json').read_text())
        self.assertEqual(metrics['counts']['documents'], 0)
        for path in (output / 'references').iterdir():
            self.assertNotIn('QUARANTINE_ONLY_SENTINEL', path.read_text())

    def test_frequency_and_formatting_signals(self):
        self.put('a.md', 'Short. Another!\n\n*Italic* and _also_.\n')
        docs = analysis.load_documents(self.source)
        metrics = analysis.analyze_documents(docs)
        self.assertEqual(metrics['short_sentences']['count'], 3)
        self.assertEqual(metrics['short_sentences']['denominator'], 3)
        self.assertEqual(metrics['short_sentences']['threshold_characters'], 40)
        self.assertEqual(metrics['single_sentence_paragraphs']['rate'], .5)
        self.assertEqual(metrics['formatting']['italic_spans']['count'], 2)
        self.assertEqual(metrics['formatting']['blank_lines']['count'], 1)
        self.assertEqual(metrics['formatting']['blank_lines']['denominator'], 3)
        self.assertIsNone(analysis.analyze_documents([])['formatting']['blank_lines']['rate'])
        boundary_docs = [{'id': 'boundary', 'blocks': [
            {'type': 'paragraph', 'text': 'a' * 39 + '.'},
            {'type': 'paragraph', 'text': 'b' * 40 + '.'}]}]
        boundary = analysis.analyze_documents(boundary_docs)
        self.assertEqual(boundary['short_sentences']['rate'], .5)
        self.assertEqual(boundary['formatting']['blank_lines']['documents_with_metadata'], 0)
        self.assertIsNone(boundary['formatting']['blank_lines']['rate'])

    def test_html_inline_code_preserves_sentence(self):
        self.put('inline.html', '<p>Call <code>start()</code> before exit.</p><p><code>stop()</code> ends it.</p>')
        docs = analysis.load_documents(self.source)
        self.assertEqual([b['type'] for b in docs[0]['blocks']], ['paragraph', 'paragraph'])
        self.assertEqual(docs[0]['blocks'][0]['text'], 'Call start() before exit.')
        self.assertEqual(docs[0]['blocks'][1]['text'], 'stop() ends it.')
        self.assertEqual(analysis.analyze_documents(docs)['counts']['sentences'], 2)

    def test_cli_profile_only_and_refusal(self):
        for i in range(12):
            self.put(f'{i}.txt', chr(0xAC00 + i) * 100)
        output = self.root / 'output'
        command = [sys.executable, str(SCRIPT), str(self.source), '--output', str(output)]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        splits = json.loads((output / 'splits.json').read_text())
        metrics = json.loads((output / 'references/style-metrics.json').read_text())
        self.assertEqual(metrics['document_ids'], splits['profile'])
        profile = json.loads((output / 'references/style-profile.json').read_text())
        self.assertEqual(profile['status'], 'awaiting_qualitative_analysis')
        self.assertEqual(profile['global_rules'], [])
        self.assertEqual(profile['genre_rules'], {})
        self.assertEqual(profile['weak_observations'], [])
        self.assertEqual(profile['anti_patterns'], [])
        self.assertEqual(profile['metrics_reference'], 'style-metrics.json')
        self.assertIn('evaluation', profile)
        examples = (output / 'references/examples.md').read_text()
        for role in ('opening', 'problem-framing', 'explanation', 'example', 'transition', 'counterargument', 'qualification', 'emphasis', 'ending'):
            self.assertIn('## ' + role + '\n', examples)
        self.assertFalse((output / 'examples.md').exists())
        references = '\n'.join(p.read_text() for p in (output / 'references').iterdir())
        docs = analysis.load_documents(self.source)
        for doc in docs:
            if doc['id'] in splits['held_out']:
                self.assertNotIn(doc['blocks'][0]['text'], references)
                self.assertNotIn(doc['id'], references)
        self.assertNotEqual(subprocess.run(command, capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
