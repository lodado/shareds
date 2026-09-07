#!/usr/bin/env python3
"""Deterministic overlap and profile checks, not an originality certification.

Only prose overlap creates review flags. Quote/code overlap is informational.
Token overlap is the fraction of unique draft n-grams present in a source block.
NFC and collapsed Unicode whitespace are used without changing letter case.
"""
from __future__ import annotations

import argparse
from difflib import SequenceMatcher
from functools import lru_cache
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import tempfile
import unicodedata

DIMENSIONS = frozenset(('title_craft', 'opening', 'argument_structure', 'sentence_architecture',
    'paragraph_architecture', 'lexical_behavior', 'stance', 'rhetoric',
    'explanation_strategy', 'endings', 'formatting'))
GENRES = frozenset(('tutorial', 'technical_explanation', 'opinion', 'retrospective', 'review', 'essay'))
ROLES = frozenset(('title', 'opening', 'problem-framing', 'explanation', 'example', 'transition',
    'counterargument', 'qualification', 'emphasis', 'ending'))
EXCLUDED_TYPES = frozenset(('code', 'quote', 'blockquote', 'fenced_code', 'indented_code'))
MAX_BLOCK_CHARS = 20_000
MAX_PAIR_PRODUCT = 4_000_000
MAX_COMPARISONS = 1000
MAX_TOTAL_PAIR_PRODUCT = 20_000_000
CAVEAT = ('These deterministic checks identify literal overlap and missing protected literals only. '
          'No overlap flags is not a guarantee of originality, attribution, factual accuracy, '
          'semantic fidelity, or stylistic quality. Human review remains necessary.')


def normalize(text):
    """Normalize Unicode canonically and collapse all whitespace."""
    return ' '.join(unicodedata.normalize('NFC', text).split())


@lru_cache(maxsize=1)
def _analysis_module():
    """Resolve the sibling even when this script is imported by absolute path."""
    spec = importlib.util.spec_from_file_location(
        '_blog_voice_cloner_analysis', Path(__file__).with_name('analyze_style.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _finding(block, category, rule, problem, suggestion, *, source=None,
             evidence=None, measurement=None, severity='warning'):
    return {'block': block, 'category': category, 'rule': rule, 'problem': problem,
            'suggestion': suggestion, 'source': source, 'evidence': evidence or [],
            'measurement': measurement or {}, 'severity': severity}


def _blocks(documents):
    for document in documents:
        for block in document.get('blocks', []):
            yield f"{document['id']}:{block['id']}", block


def _ngrams(text, size):
    tokens = re.findall(r'\w+', text, flags=re.UNICODE)
    if len(tokens) < max(10, 2 * size):
        return set(), len(tokens)
    return {tuple(tokens[i:i + size]) for i in range(len(tokens) - size + 1)}, len(tokens)


def validate_documents(drafts, documents, *, min_shared_chars=80, ngram_size=5,
                       overlap_threshold=.35, profile=None, splits=None, ledger=None):
    """Return actionable findings and explicitly unperformed human reviews.

    Expensive or oversized comparisons are skipped with a warning rather than
    silently truncating text or claiming that unchecked text passed.
    """
    if (not isinstance(min_shared_chars, int) or isinstance(min_shared_chars, bool)
            or min_shared_chars < 1 or not isinstance(ngram_size, int)
            or isinstance(ngram_size, bool) or ngram_size < 1):
        raise ValueError('min_shared_chars and ngram_size must be positive integers')
    if not isinstance(overlap_threshold, (int, float)) or not math.isfinite(overlap_threshold) or not 0 < overlap_threshold <= 1:
        raise ValueError('overlap_threshold must be finite and in (0, 1]')
    findings = []
    draft_blocks = list(_blocks(drafts))
    source_blocks = list(_blocks(documents))
    prepared = {}
    for reference, block in draft_blocks + source_blocks:
        text = normalize(block.get('text', ''))
        # Key by object identity as draft/source IDs can legitimately coincide.
        prepared[id(block)] = (text, _ngrams(text, ngram_size) if len(text) <= MAX_BLOCK_CHARS else (set(), 0))
        if len(text) > MAX_BLOCK_CHARS:
            findings.append(_finding(reference, 'coverage', 'block_size_limit',
                'Block exceeds the bounded comparison size and was not checked.',
                'Split this block into smaller paragraphs and rerun validation.',
                measurement={'characters': len(text), 'limit': MAX_BLOCK_CHARS}))
    comparisons = 0
    character_product_used = 0
    budget_exhausted = False
    for draft_ref, draft_block in draft_blocks:
        draft_text, (draft_grams, draft_tokens) = prepared[id(draft_block)]
        for source_ref, source_block in source_blocks:
            source_text, (source_grams, source_tokens) = prepared[id(source_block)]
            if not draft_text or not source_text or max(len(draft_text), len(source_text)) > MAX_BLOCK_CHARS:
                continue
            product = len(draft_text) * len(source_text)
            if comparisons >= MAX_COMPARISONS or character_product_used + product > MAX_TOTAL_PAIR_PRODUCT:
                findings.append(_finding(draft_ref, 'coverage', 'comparison_budget_exhausted',
                    'Overlap review is incomplete because the aggregate comparison budget was exhausted.',
                    'Review the remaining source passages in smaller corpus batches.', source=source_ref,
                    measurement={'comparisons_completed': comparisons,
                                 'comparison_limit': MAX_COMPARISONS,
                                 'character_product_used': character_product_used,
                                 'character_product_limit': MAX_TOTAL_PAIR_PRODUCT,
                                 'incomplete': True}))
                budget_exhausted = True
                break
            comparisons += 1
            character_product_used += product
            informational = draft_block.get('type') in EXCLUDED_TYPES or source_block.get('type') in EXCLUDED_TYPES
            category = 'quoted_or_code_overlap' if informational else 'source_overlap'
            severity = 'info' if informational else 'warning'
            suggestion = ('Check quotation attribution or code licensing in context.' if informational else
                          'Rewrite this passage from the draft facts in fresh wording, or quote and attribute the source explicitly.')
            if len(draft_text) * len(source_text) > MAX_PAIR_PRODUCT:
                findings.append(_finding(draft_ref, 'coverage', 'comparison_size_limit',
                    'Longest shared substring comparison was not run for this large block pair.',
                    'Split the blocks into smaller paragraphs and rerun.', source=source_ref,
                    measurement={'character_product': len(draft_text) * len(source_text), 'limit': MAX_PAIR_PRODUCT}))
            else:
                match = SequenceMatcher(None, draft_text, source_text, autojunk=False).find_longest_match()
                if match.size >= min_shared_chars:
                    findings.append(_finding(draft_ref, category, 'shared_contiguous_text',
                        'Normalized contiguous text overlaps a source. This is not a plagiarism determination.',
                        suggestion, source=source_ref, evidence=[draft_text[match.a:match.a + match.size]],
                        measurement={'shared_characters': match.size, 'threshold': min_shared_chars,
                                     'draft_offset': match.a, 'source_offset': match.b}, severity=severity))
            if draft_grams and source_grams:
                shared = draft_grams & source_grams
                overlap = len(shared) / len(draft_grams)
                if overlap >= overlap_threshold:
                    findings.append(_finding(draft_ref, category, 'token_ngram_overlap',
                        'A substantial fraction of draft token n-grams also occurs in a source block.',
                        suggestion, source=source_ref, evidence=[' '.join(g) for g in sorted(shared)[:5]],
                        measurement={'overlap': overlap, 'threshold': overlap_threshold,
                                     'shared_ngrams': len(shared), 'draft_ngrams': len(draft_grams),
                                     'ngram_size': ngram_size, 'draft_tokens': draft_tokens,
                                     'source_tokens': source_tokens, 'minimum_tokens': max(10, 2 * ngram_size)}, severity=severity))
        if budget_exhausted:
            break
    if profile is not None:
        findings.extend(validate_profile(profile, documents, splits))
    if ledger is not None:
        if not isinstance(ledger, dict) or not isinstance(ledger.get('protected_literals'), list):
            raise ValueError('ledger must contain a protected_literals list of nonempty strings')
        literals = ledger['protected_literals']
        if any(not isinstance(value, str) or not normalize(value) for value in literals):
            raise ValueError('protected_literals must contain only nonempty strings')
        texts = [normalize(block.get('text', '')) for _, block in draft_blocks]
        for value in dict.fromkeys(literals):
            if not any(normalize(value) in text for text in texts):
                findings.append(_finding(None, 'protected_literal', 'missing_protected_literal',
                    'A protected literal is absent. This warning is not proof of semantic loss.',
                    'Check the fact ledger and restore the literal if required, or manually verify an equivalent representation.',
                    evidence=[value], measurement={'present': False}))
    return {'status': 'review_required' if any(f['severity'] != 'info' for f in findings) else 'no_overlap_flags',
            'findings': findings, 'reviews': {name: 'not_run' for name in
                ('content_preservation', 'style_match', 'over_imitation', 'source_leakage', 'generic_ai_signals', 'target_voice_match')},
            'caveat': CAVEAT}


def validate_profile(profile, documents, splits):
    """Return schema/evidence errors, requiring explicit profile-set membership.

    Rule references use ``docid:blockid``. Validation/held-out evidence is never
    accepted, even when a malformed split also lists the ID in the profile set.
    """
    findings = []

    def error(location, problem, evidence=None):
        findings.append(_finding(location, 'profile_validation', 'profile_schema_or_evidence',
            problem, 'Repair the profile using only supported fields and profile-set evidence.', evidence=evidence))

    if not isinstance(profile, dict):
        error('profile', 'Profile must be a JSON object.')
        return findings
    blocks = dict(_blocks(documents))
    refs = {ref: ref.rsplit(':', 1)[0] for ref in blocks}
    # Recompute actual duplicate components so stale/omitted metadata cannot
    # inflate confidence. Also honor declared groups conservatively.
    parents = {document['id']: document['id'] for document in documents}

    def root(identifier):
        while parents[identifier] != identifier:
            parents[identifier] = parents[parents[identifier]]
            identifier = parents[identifier]
        return identifier

    groups = _analysis_module().split_documents(documents)['duplicate_groups']
    declared = splits.get('duplicate_groups', []) if isinstance(splits, dict) else []
    if not isinstance(declared, list):
        error('splits', 'duplicate_groups must be a list of document ID lists.')
        declared = []
    for group in groups + declared:
        if (not isinstance(group, list) or not group
                or any(not isinstance(x, str) or x not in parents for x in group)):
            error('splits', 'Each duplicate group must contain existing document IDs.')
            continue
        for identifier in group[1:]:
            parents[root(identifier)] = root(group[0])
    allowed = set()
    excluded = set()
    if not isinstance(splits, dict) or not isinstance(splits.get('profile'), list) or any(not isinstance(x, str) for x in splits.get('profile', [])):
        error('splits', 'An explicit splits.profile list of document IDs is required.')
    else:
        allowed = set(splits['profile'])
        for key in ('validation', 'held_out', 'heldout', 'quarantine'):
            ids = splits.get(key, [])
            if not isinstance(ids, list) or any(not isinstance(x, str) for x in ids):
                error('splits', f'splits.{key} must be a list of document IDs.')
                allowed.clear()
            else:
                excluded.update(ids)
        excluded_groups = {root(identifier) for identifier in excluded if identifier in parents}
        allowed = {identifier for identifier in allowed if identifier in parents
                   and root(identifier) not in excluded_groups}
    collections = []
    for key in ('global_rules', 'weak_observations', 'anti_patterns'):
        rules = profile.get(key)
        if not isinstance(rules, list):
            error(key, f'{key} must be a list of rule objects.')
        else:
            collections.extend((key, None, rule) for rule in rules)
    genre_rules = profile.get('genre_rules')
    if not isinstance(genre_rules, dict):
        error('genre_rules', 'genre_rules must map known genres to lists of rule objects.')
    else:
        for genre, rules in genre_rules.items():
            if genre not in GENRES:
                error('genre_rules', f'Unknown genre: {genre}.')
            if not isinstance(rules, list):
                error(f'genre_rules.{genre}', 'Genre rules must be a list.')
            else:
                collections.extend(('genre_rules', genre, rule) for rule in rules)
    seen = set()
    required = {'id', 'dimension', 'instruction', 'scope', 'evidence', 'confidence', 'exceptions'}
    for collection, genre, rule in collections:
        if not isinstance(rule, dict):
            error(collection, 'Every rule must be an object.')
            continue
        location = rule.get('id', collection)
        missing = required - rule.keys()
        if missing:
            error(location, 'Missing required fields: ' + ', '.join(sorted(missing)))
        identifier = rule.get('id')
        if not isinstance(identifier, str) or not identifier.strip():
            error(collection, 'Rule id must be a nonempty string.')
        elif identifier in seen:
            error(identifier, 'Rule id must be unique across all collections.')
        else:
            seen.add(identifier)
        if not isinstance(rule.get('dimension'), str) or rule['dimension'] not in DIMENSIONS:
            error(location, 'Unknown style dimension.')
        if not isinstance(rule.get('instruction'), str) or not rule['instruction'].strip():
            error(location, 'Instruction must be a nonempty string.')
        confidence = rule.get('confidence')
        if confidence not in ('high', 'medium', 'weak'):
            error(location, 'Confidence must be high, medium, or weak.')
        exceptions = rule.get('exceptions')
        if not isinstance(exceptions, list) or any(not isinstance(x, str) for x in exceptions):
            error(location, 'Exceptions must be a list of strings.')
        scope = rule.get('scope')
        scoped_genres = []
        if not isinstance(scope, dict):
            error(location, 'Scope must be an object containing genres and roles lists.')
        else:
            for key, whitelist in (('genres', GENRES), ('roles', ROLES)):
                values = scope.get(key)
                if not isinstance(values, list) or any(not isinstance(v, str) or v not in whitelist for v in values):
                    error(location, f'Scope {key} must be a list of whitelisted values.')
                elif key == 'genres':
                    scoped_genres = values
            if genre is not None and genre not in scoped_genres:
                error(location, 'Genre rule scope must include its enclosing genre.')
        evidence = rule.get('evidence')
        roles = scope.get('roles') if isinstance(scope, dict) else None
        title_rule = rule.get('dimension') == 'title_craft' or (
            isinstance(roles, list) and 'title' in roles)
        evidence_docs = set()
        if not isinstance(evidence, list) or not evidence:
            error(location, 'Evidence must be a nonempty list of docid:blockid references.')
        else:
            for reference in evidence:
                if not isinstance(reference, str) or reference not in refs:
                    error(location, 'Evidence reference does not exist.', [reference])
                elif refs[reference] not in allowed:
                    error(location, 'Evidence must belong exclusively to the profile set, never validation or held-out documents.', [reference])
                elif title_rule and blocks[reference].get('type') != 'heading':
                    error(location, 'Title evidence must reference a verified title heading block, not body prose.', [reference])
                else:
                    evidence_docs.add(root(refs[reference]))
        if len(evidence_docs) <= 1:
            if confidence == 'high' or (collection == 'global_rules' and confidence != 'weak'):
                error(location, 'One independent document group cannot support high confidence, and global singleton rules must be weak.')
            if not scoped_genres or set(scoped_genres) == GENRES:
                error(location, 'One independent document group cannot support universal genre scope.')
        if collection == 'weak_observations' and confidence != 'weak':
            error(location, 'Weak observations must have weak confidence.')
    return findings


def _load_corpus(directory):
    """Prefer a snapshot's normalized documents over generated reference files."""
    snapshot = directory / 'documents.json'
    if not snapshot.exists():
        return _analysis_module().load_documents(directory)
    documents = json.loads(snapshot.read_text(encoding='utf-8'))
    if not isinstance(documents, list):
        raise ValueError('documents.json must contain a list of document objects')
    seen = set()
    for document in documents:
        if not isinstance(document, dict) or any(
                not isinstance(document.get(key), str)
                for key in ('id', 'title', 'path', 'version')):
            raise ValueError('Snapshot documents require string id, title, path, and version fields')
        if not document['id'] or document['id'] in seen:
            raise ValueError('Snapshot document IDs must be nonempty and unique')
        seen.add(document['id'])
        blocks = document.get('blocks')
        if not isinstance(blocks, list):
            raise ValueError('Snapshot document blocks must be a list')
        block_ids = set()
        for block in blocks:
            if not isinstance(block, dict) or any(
                    not isinstance(block.get(key), str) for key in ('id', 'type', 'text')):
                raise ValueError('Snapshot blocks require string id, type, and text fields')
            if not block['id'] or block['id'] in block_ids:
                raise ValueError('Snapshot block IDs must be nonempty and unique within each document')
            if block['type'] not in {'paragraph', 'heading', 'list', 'quote', 'code'}:
                raise ValueError('Snapshot block type is not supported')
            block_ids.add(block['id'])
    return documents


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('draft', type=Path)
    parser.add_argument('--corpus', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--min-shared-chars', type=int, default=80)
    parser.add_argument('--ngram-size', type=int, default=5)
    parser.add_argument('--overlap-threshold', type=float, default=.35)
    parser.add_argument('--profile', type=Path)
    parser.add_argument('--ledger', type=Path)
    args = parser.parse_args(argv)
    try:
        # Sibling loader handles supported input formats, independent of metrics.
        load_documents = _analysis_module().load_documents
        profile = json.loads(args.profile.read_text(encoding='utf-8')) if args.profile else None
        ledger = json.loads(args.ledger.read_text(encoding='utf-8')) if args.ledger else None
        splits = profile.get('splits') if isinstance(profile, dict) else None
        split_path = args.corpus / 'splits.json'
        if splits is None and split_path.is_file():
            splits = json.loads(split_path.read_text(encoding='utf-8'))
        if not args.draft.is_file() or args.draft.suffix.lower() not in {'.md', '.txt', '.html', '.htm'}:
            raise ValueError('DRAFT must be an existing Markdown, text, or HTML file')
        with tempfile.TemporaryDirectory(prefix='blog-voice-draft-', dir=os.environ.get('JCODE_SCRATCH_DIR')) as temporary:
            staged = Path(temporary) / args.draft.name
            staged.write_bytes(args.draft.read_bytes())
            drafts = load_documents(Path(temporary))
        report = validate_documents(drafts, _load_corpus(args.corpus),
            min_shared_chars=args.min_shared_chars, ngram_size=args.ngram_size,
            overlap_threshold=args.overlap_threshold, profile=profile, splits=splits, ledger=ledger)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    except (OSError, ValueError, TypeError, KeyError) as exc:
        parser.error(str(exc))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
