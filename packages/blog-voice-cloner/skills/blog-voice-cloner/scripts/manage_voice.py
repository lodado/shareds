#!/usr/bin/env python3
"""Local-only voice corpus storage (Python 3.10+).

Snapshots never activate themselves. Activation requires an externally reviewed
profile, at least one supported rule, and successful evidence validation.
Insufficient splits require explicit profile mode "exploratory", with only weak
rules and no medium/high confidence claim. Exploration is not validated fidelity.
Writes are atomic and cooperating commands serialize per author. Symlinks and
traversal are rejected, but the root must still be trusted against hostile
concurrent filesystem replacement. No crawler, reference edits, or automatic
correction-to-override promotion is performed.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import difflib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import tempfile
from urllib.parse import urlsplit
import uuid

CATEGORIES = ('STYLE_CORRECTION', 'CONTENT_CORRECTION', 'PERSONAL_PREFERENCE', 'FACT_CORRECTION')
SLUG = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\Z')
EXTENSIONS = {'.md', '.txt', '.html'}


def safe_path(value):
    """Check every existing ancestor without resolving away symlinks."""
    path = Path(value).expanduser()
    if '..' in path.parts:
        raise ValueError('path traversal is not allowed')
    path = path.absolute()
    for component in (path, *path.parents):
        if component.is_symlink():
            raise ValueError(f'symlink path is not allowed: {component}')
    return path


def author_path(root, author):
    if not SLUG.fullmatch(author):
        raise ValueError('author must be a lowercase alphanumeric hyphenated slug')
    return safe_path(safe_path(root) / author)


def relative_path(base, value):
    relative = Path(value)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('unsafe stored path')
    return safe_path(base / relative)


def aware_time(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except (TypeError, AttributeError, ValueError) as exc:
        raise ValueError('timestamp must be timezone-aware ISO 8601') from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError('timestamp must include a timezone')
    return parsed.astimezone(timezone.utc)


def iso(value):
    return aware_time(value).isoformat().replace('+00:00', 'Z')


def document_id(url):
    parsed = urlsplit(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password:
        raise ValueError('article URL must be an HTTP(S) URL without credentials')
    return hashlib.sha256(url.encode('utf-8')).hexdigest()


def read_json(path):
    return json.loads(safe_path(path).read_text(encoding='utf-8'))


def atomic_write(path, data, *, immutable=False):
    path = safe_path(path)
    safe_path(path.parent).mkdir(parents=True, exist_ok=True)
    if isinstance(data, str):
        data = data.encode('utf-8')
    fd, temporary = tempfile.mkstemp(prefix='.write-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        safe_path(path)
        if immutable:
            try:
                os.link(temporary, path)
            except FileExistsError:
                if safe_path(path).read_bytes() != data:
                    raise ValueError(f'immutable content differs: {path}')
        else:
            os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def write_json(path, data, *, immutable=False):
    atomic_write(path, json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n', immutable=immutable)


@contextmanager
def author_lock(folder):
    lock = safe_path(folder / '.storage-lock')
    try:
        lock.mkdir()
    except FileExistsError as exc:
        raise ValueError('author storage is busy (or has a stale .storage-lock)') from exc
    try:
        yield
    finally:
        lock.rmdir()


def init_author(root, author, url=None):
    folder = author_path(root, author)
    if url is not None:
        document_id(url)
    folder.mkdir(parents=True, exist_ok=True)
    with author_lock(folder):
        for name in ('corpus/documents', 'profiles', 'corrections', 'runs', 'history'):
            safe_path(folder / name).mkdir(parents=True, exist_ok=True)
        overrides = folder / 'user-overrides.json'
        if not safe_path(overrides).exists():
            write_json(overrides, {'schema_version': 1, 'overrides': []}, immutable=True)
        config = folder / 'author.json'
        if not safe_path(config).exists():
            write_json(config, {'schema_version': 1, 'author': author, 'url': url}, immutable=True)
        manifest = folder / 'corpus/manifest.json'
        if not safe_path(manifest).exists():
            write_json(manifest, {'schema_version': 1, 'documents': {}})
    return str(folder)


def require_author(root, author):
    folder = author_path(root, author)
    if not safe_path(folder / 'author.json').is_file():
        raise ValueError('author is not initialized')
    return folder


def import_article(root, author, file, url, published_at, collected_at, genre=None, title=None):
    folder = require_author(root, author)
    source = safe_path(file)
    extension = source.suffix.lower()
    if extension not in EXTENSIONS:
        raise ValueError('article file must be .md, .txt, or .html')
    stable_id = document_id(url)
    event = {'published_at': iso(published_at), 'collected_at': iso(collected_at), 'genre': genre, 'title': title}
    raw = source.read_bytes()
    raw.decode('utf-8')  # The analysis engine consumes UTF-8, never silently replace bytes.
    digest = hashlib.sha256(raw).hexdigest()
    version_id = f'{stable_id}-{digest}{extension}'
    with author_lock(folder):
        manifest_path = folder / 'corpus/manifest.json'
        manifest = read_json(manifest_path)
        documents = manifest['documents']
        relative = f'corpus/documents/{stable_id}/{digest}{extension}'
        atomic_write(relative_path(folder, relative), raw, immutable=True)
        entry = documents.setdefault(version_id, {'document_id': stable_id, 'version_id': version_id, 'url': url, 'sha256': digest, 'raw_path': relative, 'extension': extension, 'collections': []})
        if not any(all(existing.get(key) == value for key, value in event.items()) for existing in entry['collections']):
            event['sequence'] = 1 + max((c.get('sequence', 0) for d in documents.values() for c in d['collections']), default=0)
            entry['collections'].append(event)
            write_json(manifest_path, manifest)
    return version_id


def select_documents(root, author, as_of, days=30):
    folder = require_author(root, author)
    cutoff = aware_time(as_of)
    if isinstance(days, bool) or not isinstance(days, int) or days <= 0:
        raise ValueError('days must be a positive integer')
    lower = cutoff - timedelta(days=days)
    manifest = read_json(folder / 'corpus/manifest.json')
    latest = {}
    for entry in manifest['documents'].values():
        for event in entry['collections']:
            collected = aware_time(event['collected_at'])
            if collected > cutoff:
                continue
            order = (collected, event.get('sequence', 0), entry['version_id'])
            if entry['url'] not in latest or order > latest[entry['url']][0]:
                selected_entry = {key: value for key, value in entry.items() if key != 'collections'}
                latest[entry['url']] = (order, dict(selected_entry, **event))
    selected = []
    for _, entry in latest.values():
        publication = entry.get('published_at')
        if publication is None:
            continue
        if lower <= aware_time(publication) < cutoff:
            selected.append(entry)
    return sorted(selected, key=lambda entry: entry['url'])


def load_sibling(name):
    path = safe_path(Path(__file__).with_name(name + '.py'))
    spec = importlib.util.spec_from_file_location('_voice_' + name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def reconcile_splits(docs, splits, history):
    """Preserve historical roles, quarantining any connected conflicting group.

    History can be ID -> role(s), or {assignments, documents, duplicate_groups}.
    Historical article versions participate in grouping even outside this window.
    This helper is invoked by analyze_style before write_outputs calculates metrics.
    """
    roles = ('profile', 'validation', 'held_out', 'quarantine')
    assignments = history.get('assignments', history)
    old_docs = history.get('documents', []) if 'assignments' in history else []
    old_groups = history.get('duplicate_groups', []) if 'assignments' in history else []
    current = {d['id'] for d in docs}
    baseline = {identifier: role for role in roles for identifier in splits.get(role, [])}
    if set(baseline) != current:
        raise ValueError('current split does not cover documents')
    parent = {identifier: identifier for identifier in current | set(assignments)}

    def root(identifier):
        parent.setdefault(identifier, identifier)
        if parent[identifier] != identifier:
            parent[identifier] = root(parent[identifier])
        return parent[identifier]

    def join(group):
        for identifier in group[1:]:
            parent[root(identifier)] = root(group[0])

    for group in [*splits.get('duplicate_groups', []), *old_groups]:
        join(group)
    if old_docs:
        # Unique synthetic IDs permit multiple content versions of the same URL.
        combined = {}
        originals = {}
        for doc in [*old_docs, *docs]:
            fingerprint = hashlib.sha256(json.dumps(doc['blocks'], sort_keys=True, ensure_ascii=False).encode('utf-8')).hexdigest()
            key = doc['id'] + ':' + fingerprint
            combined[key] = dict(doc, id=key)
            originals[key] = doc['id']
        groups = load_sibling('analyze_style').split_documents(list(combined.values()))
        for group in groups.get('duplicate_groups', []):
            join([originals[key] for key in group])
    labels = {}
    for identifier, previous in assignments.items():
        values = previous if isinstance(previous, list) else [previous]
        if any(value not in roles for value in values):
            raise ValueError('unknown historical split assignment')
        labels.setdefault(root(identifier), set()).update(values)
    components = {}
    for identifier in sorted(current):
        components.setdefault(root(identifier), []).append(identifier)
    result = dict(splits)
    result.update({role: [] for role in roles})
    result['warnings'] = list(splits.get('warnings', []))
    for component, members in components.items():
        previous = labels.get(component, set())
        role = ('quarantine' if len(previous) > 1 or 'quarantine' in previous else
                next(iter(previous)) if previous else baseline[members[0]])
        result[role].extend(members)
    for role in roles:
        result[role].sort()
    result['duplicate_groups'] = sorted(members for members in components.values() if len(members) > 1)
    result['independent_groups'] = sum(not set(members).intersection(result['quarantine']) for members in components.values())
    if result['quarantine']:
        result['warnings'].append('Historical split conflict: connected documents quarantined and excluded from references and evaluation.')
    if result['independent_groups'] < 10 or not result['validation'] or not result['held_out']:
        result['status'] = 'insufficient_independent_groups'
    return result


def historical_assignments(folder):
    assignments, documents, duplicate_groups = {}, {}, []
    for version in sorted(safe_path(folder / 'profiles').iterdir()):
        safe_path(version)
        if not version.is_dir() or version.name.startswith('.'):
            continue
        manifest = read_json(version / 'splits.json')
        for role in ('profile', 'validation', 'held_out', 'quarantine'):
            for identifier in manifest.get(role, []):
                assignments.setdefault(identifier, set()).add(role)
        duplicate_groups.extend(manifest.get('duplicate_groups', []))
        for doc in read_json(version / 'documents.json'):
            fingerprint = hashlib.sha256(json.dumps(doc['blocks'], sort_keys=True).encode()).hexdigest()
            documents[(doc['id'], fingerprint)] = doc
    return {'assignments': {identifier: sorted(values) for identifier, values in assignments.items()},
            'documents': list(documents.values()), 'duplicate_groups': duplicate_groups}


def stage_article(entry, raw, inputs):
    """Preserve bytes and extension so native parser block types remain intact."""
    if entry['document_id'] != document_id(entry['url']) or entry['extension'] not in EXTENSIONS:
        raise ValueError('invalid stored document identity or extension')
    atomic_write(inputs / (entry['document_id'] + entry['extension']), raw, immutable=True)


def create_snapshot(root, author, as_of, days=30):
    folder = require_author(root, author)
    with author_lock(folder):
        documents = select_documents(root, author, as_of, days)
        history = historical_assignments(folder)
        version = 'v-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S') + '-' + uuid.uuid4().hex
        destination = safe_path(folder / 'profiles' / version)
        with tempfile.TemporaryDirectory(prefix='.snapshot-', dir=folder) as temporary:
            inputs = Path(temporary) / 'input'
            inputs.mkdir()
            output = Path(temporary) / 'output'
            for entry in documents:
                raw = relative_path(folder, entry['raw_path']).read_bytes()
                if hashlib.sha256(raw).hexdigest() != entry['sha256']:
                    raise ValueError('stored raw content hash mismatch')
                stage_article(entry, raw, inputs)
            analyzer = load_sibling('analyze_style')
            analyzed = analyzer.load_documents(inputs)
            by_path = {entry['document_id'] + entry['extension']: entry for entry in documents}
            for doc in analyzed:
                entry = by_path[doc['path']]
                # Preserve existing storage IDs without forcing a Markdown parser.
                # Standalone analyzer path-derived IDs are deliberately unchanged.
                doc['id'] = hashlib.sha256((entry['document_id'] + '.md').encode('utf-8')).hexdigest()[:12]
                doc.update({key: entry.get(key) for key in ('url', 'genre', 'published_at', 'collected_at')})
                doc['original_sha256'] = entry['sha256']
                if entry.get('title'):
                    doc['title'] = entry['title']
            splits = reconcile_splits(analyzed, analyzer.split_documents(analyzed), history)
            analyzer.write_outputs(output, analyzed, splits)
            for artifact in output.rglob('*'):
                safe_path(artifact)
            write_json(output / 'snapshot.json', {'schema_version': 1, 'version': version, 'author': author, 'as_of': iso(as_of), 'days': days, 'documents': documents, 'historical_assignments': history}, immutable=True)
            profile_path = output / 'references/style-profile.json'
            profile_data = read_json(profile_path)
            profile_ids = set(splits['profile'])
            profile_data['source_metadata'] = [{key: doc.get(key) for key in ('id', 'title', 'url', 'genre', 'published_at')} for doc in analyzed if doc['id'] in profile_ids]
            write_json(profile_path, profile_data)
            os.rename(output, destination)
    return version


def activate_profile(root, author, profile):
    folder = require_author(root, author)
    if not re.fullmatch(r'v-[A-Za-z0-9-]+', profile):
        raise ValueError('invalid profile version')
    with author_lock(folder):
        path = safe_path(folder / 'profiles' / profile)
        data = read_json(path / 'references/style-profile.json')
        if data.get('status') != 'reviewed':
            raise ValueError('activation requires reviewed profile status')
        splits = read_json(path / 'splits.json')
        errors = load_sibling('validate_style').validate_profile(data, read_json(path / 'documents.json'), splits)
        if errors:
            raise ValueError(f'profile evidence validation failed: {errors}')
        rules = [*data['global_rules'], *data['weak_observations'], *data['anti_patterns'],
                 *(rule for items in data['genre_rules'].values() for rule in items)]
        if not rules:
            raise ValueError('activation requires at least one evidence-supported rule')
        exploratory = data.get('mode') == 'exploratory'
        sufficient = (splits.get('status') == 'ready' and splits.get('independent_groups', 0) >= 10
                      and splits.get('validation') and splits.get('held_out'))
        if (not sufficient or data.get('confidence') == 'insufficient') and not exploratory:
            raise ValueError('insufficient evidence requires explicit profile mode exploratory')
        if exploratory and (data.get('confidence') not in (None, 'weak', 'insufficient')
                            or any(rule['confidence'] != 'weak' for rule in rules)):
            raise ValueError('exploratory activation permits only weak-confidence rules and claims')
        write_json(folder / 'active-profile.json', {'profile': profile, 'mode': 'exploratory' if exploratory else 'reviewed', 'activated_at': datetime.now(timezone.utc).isoformat()})
    return profile


def record_correction(root, author, generated, edited, category, reason=None):
    if category not in CATEGORIES:
        raise ValueError('unsupported correction category')
    folder = require_author(root, author)
    original = safe_path(generated).read_bytes()
    revised = safe_path(edited).read_bytes()
    diff = ''.join(difflib.unified_diff(original.decode('utf-8').splitlines(keepends=True), revised.decode('utf-8').splitlines(keepends=True), fromfile='generated', tofile='edited'))
    version = 'c-' + uuid.uuid4().hex
    with author_lock(folder):
        destination = safe_path(folder / 'corrections' / version)
        with tempfile.TemporaryDirectory(prefix='.correction-', dir=folder) as temporary:
            staged = Path(temporary) / 'record'
            staged.mkdir()
            atomic_write(staged / 'generated.txt', original, immutable=True)
            atomic_write(staged / 'edited.txt', revised, immutable=True)
            atomic_write(staged / 'changes.diff', diff, immutable=True)
            atomic_write(staged / 'reason.txt', reason or '', immutable=True)
            write_json(staged / 'metadata.json', {'version': version, 'category': category, 'created_at': datetime.now(timezone.utc).isoformat(), 'generated_sha256': hashlib.sha256(original).hexdigest(), 'edited_sha256': hashlib.sha256(revised).hexdigest()}, immutable=True)
            os.rename(staged, destination)
    return version


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('init', 'import', 'snapshot', 'activate', 'correction'):
        command = commands.add_parser(name)
        command.add_argument('--root', default='.blog-voice')
        command.add_argument('--author', required=True)
        if name == 'init':
            command.add_argument('--url')
        elif name == 'import':
            for flag in ('file', 'url', 'published-at', 'collected-at'):
                command.add_argument('--' + flag, required=True)
            command.add_argument('--genre')
            command.add_argument('--title')
        elif name == 'snapshot':
            command.add_argument('--as-of', required=True)
            command.add_argument('--days', type=int, default=30)
        elif name == 'activate':
            command.add_argument('--profile', required=True)
        else:
            command.add_argument('--generated', required=True)
            command.add_argument('--edited', required=True)
            command.add_argument('--category', choices=CATEGORIES, required=True)
            command.add_argument('--reason')
    args = vars(parser.parse_args(argv))
    operation = args.pop('command')
    functions = {'init': init_author, 'import': import_article, 'snapshot': create_snapshot, 'activate': activate_profile, 'correction': record_correction}
    try:
        result = functions[operation](**args)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.exit(2, f'error: {exc}\n')
    print(json.dumps({'command': operation, 'result': result}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
