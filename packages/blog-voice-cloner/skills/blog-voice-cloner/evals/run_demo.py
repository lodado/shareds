#!/usr/bin/env python3
"""Reproduce the local storage/profile/check smoke test, not a voice benchmark."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import sys

SKILL = Path(__file__).resolve().parents[1]
SCRIPTS = SKILL / 'scripts'


def run(script, *args):
    result = subprocess.run([sys.executable, str(SCRIPTS / script), *map(str, args)], check=True, capture_output=True, text=True)
    return result.stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New directory for reproducible demo artifacts')
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    root = output / '.blog-voice'
    author = 'synthetic-demo'
    common = ['--root', root, '--author', author]
    run('manage_voice.py', 'init', *common, '--url', 'https://example.invalid/synthetic')
    for index, file in enumerate(sorted((SKILL / 'evals/sample-corpus').iterdir()), 1):
        run('manage_voice.py', 'import', *common, '--file', file,
            '--url', f'https://example.invalid/synthetic/{index}',
            '--published-at', f'2026-08-{20 + index:02d}T09:00:00+09:00',
            '--collected-at', '2026-09-07T00:00:00+09:00', '--genre', 'technical_explanation')
    run('manage_voice.py', 'snapshot', *common, '--as-of', '2026-09-07T00:00:00+09:00', '--days', '30')
    snapshot = next((root / author / 'profiles').iterdir())
    documents = json.loads((snapshot / 'documents.json').read_text())
    splits = json.loads((snapshot / 'splits.json').read_text())
    assert len(documents) == 3 and splits['status'] != 'ready'
    profile_path = snapshot / 'references/style-profile.json'
    profile = json.loads(profile_path.read_text())
    evidence = [f"{doc['id']}:{[b for b in doc['blocks'] if b['type'] == 'paragraph'][-1]['id']}" for doc in documents]
    # Explicit human/agent-reviewed observation about these bundled fixtures only.
    rule = {'id': 'ENDING-01', 'dimension': 'endings',
            'instruction': '조건을 설명한 뒤 그 조건에 주의를 돌리는 짧은 문장으로 마무리한다.',
            'scope': {'genres': ['technical_explanation'], 'roles': ['ending']},
            'evidence': evidence, 'confidence': 'weak',
            'exceptions': ['원문에 없는 조건이나 권고를 추가하지 않는다.', '세 합성 문서의 관찰이며 일반화 검증은 불충분하다.']}
    profile.update(status='reviewed', mode='exploratory', global_rules=[], genre_rules={'technical_explanation': [rule]}, weak_observations=[], anti_patterns=[])
    profile_path.write_text(json.dumps(profile, ensure_ascii=False, indent=2) + '\n')
    (snapshot / 'references/style-profile.md').write_text('# Synthetic exploratory profile\n\nNot a real influencer profile. Three source fixtures, no reliable validation or held-out evaluation.\n\n## ENDING-01\n\n' + rule['instruction'] + '\n\nConfidence: weak.\n\n' + '\n'.join('- ' + e for e in evidence) + '\n', encoding='utf-8')
    sys.path.insert(0, str(SCRIPTS))
    from validate_style import validate_profile
    findings = validate_profile(profile, documents, splits)
    assert not findings, findings
    run('manage_voice.py', 'activate', *common, '--profile', snapshot.name)
    assert (root / author / 'active-profile.json').exists()
    # Saved model outputs are reused, never claimed to be a fresh LLM invocation.
    draft = SKILL / 'evals/demo-draft.md'
    if not draft.exists():
        raise ValueError('Missing saved demo output')
    shutil.copyfile(draft, output / 'draft.md')
    run('validate_style.py', output / 'draft.md', '--corpus', SKILL / 'evals/sample-corpus', '--output', output / 'overlap-review.json', '--ledger', SKILL / 'evals/demo-ledger.json')
    report = {'status': 'local_workflow_passed', 'snapshot': snapshot.name,
              'documents': len(documents), 'split_status': splits['status'],
              'profile_rules': 1, 'profile_mode': 'exploratory',
              'active_pointer_verified': True, 'profile_evidence_findings': findings,
              'human_preference': 'not_run', 'editing_effort': 'not_run',
              'live_collection': 'not_run', 'fresh_model_generation': False,
              'limitations': ['Synthetic fixtures only.', 'Saved demo draft generated once by coordinator using the extracted weak ending rule.', 'No real-author style generalization or legal safety conclusion.']}
    (output / 'result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
