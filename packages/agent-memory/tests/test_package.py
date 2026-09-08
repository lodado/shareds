import json
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).parents[1]
NAMES = {'agent-memory-' + suffix for suffix in (
    'log', 'generalize', 'todayilearned', 'p0-rules', 'recall', 'maintenance')}


class PackageTests(unittest.TestCase):
    def test_six_independently_discoverable_skills(self):
        skills = list((ROOT / 'skills').glob('*/SKILL.md'))
        self.assertEqual({p.parent.name for p in skills}, NAMES)
        for path in skills:
            text = path.read_text()
            self.assertTrue(text.startswith('---\n'))
            frontmatter = text.split('---', 2)[1]
            self.assertRegex(frontmatter, rf'(?m)^name: {path.parent.name}$')
            self.assertRegex(frontmatter, r'(?m)^description: .+')

    def test_manifests_and_marketplace_agree(self):
        manifests = [json.loads((ROOT / f'.{host}-plugin/plugin.json').read_text())
                     for host in ('claude', 'codex')]
        market = json.loads((ROOT.parents[1] / '.claude-plugin/marketplace.json').read_text())
        entries = [p for p in market['plugins'] if p['name'] == 'agent-memory']
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]['source'], './packages/agent-memory')
        for manifest in manifests:
            self.assertEqual(manifest['version'], entries[0]['version'])
            self.assertEqual(manifest['name'], 'agent-memory')
        self.assertEqual(manifests[1]['skills'], './skills/')

    def test_preserves_ingest_parser_contract(self):
        text = (ROOT / 'skills/agent-memory-log/SKILL.md').read_text()
        for heading in ('작업 요약', '변경 파일', '중요한 결정', '막힌 점 / 해결',
                        '배운 점', '다음부터 적용할 규칙 후보', '승격 여부'):
            self.assertIn('# ' + heading, text)

    def test_no_machine_specific_paths_or_broken_local_references(self):
        for path in (ROOT / 'skills').rglob('*.md'):
            text = path.read_text()
            self.assertNotRegex(text, r'/Users/[^/\s]+/')
            for target in re.findall(r'\]\(([^)]+)\)', text):
                if target.startswith(('http:', 'https:', '#')):
                    continue
                self.assertTrue((path.parent / target.split('#')[0]).exists(), target)


if __name__ == '__main__':
    unittest.main()
