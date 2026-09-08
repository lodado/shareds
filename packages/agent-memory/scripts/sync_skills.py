"""Audit/install this package's skills; never follows an installed skill symlink."""
import argparse
from datetime import datetime, timezone
import filecmp
from pathlib import Path
import shutil
import tempfile

HOSTS = ('claude', 'codex', 'jcode', 'cursor', 'agents')


def same_tree(source, target):
    if not target.is_dir() or target.is_symlink():
        return False
    comparison = filecmp.dircmp(source, target)
    if comparison.left_only or comparison.right_only or comparison.funny_files:
        return False
    if any(not filecmp.cmp(source / name, target / name, shallow=False)
           for name in comparison.common_files):
        return False
    return all(same_tree(source / name, target / name)
               for name in comparison.common_dirs)


def sync(source, target, backup, apply):
    if same_tree(source, target):
        return 'current'
    if not apply:
        return 'would-update' if target.exists() or target.is_symlink() else 'would-install'
    # Stage before moving the old copy; preserve old symlinks rather than their targets.
    target.parent.mkdir(parents=True, exist_ok=True)
    if backup.exists() or backup.is_symlink():
        raise FileExistsError(backup)
    with tempfile.TemporaryDirectory(prefix='.skill-sync-', dir=target.parent) as tmp:
        staged = Path(tmp) / target.name
        shutil.copytree(source, staged)
        had_old = target.exists() or target.is_symlink()
        if had_old:
            backup.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(target), str(backup))
        try:
            staged.rename(target)
        except OSError:
            if had_old:
                shutil.move(str(backup), str(target))
            raise
    if not same_tree(source, target):
        raise RuntimeError(f'Installed content mismatch: {target}')
    return 'updated' if had_old else 'installed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Default is read-only audit')
    parser.add_argument('--home', type=Path, default=Path.home())
    parser.add_argument('--hosts', nargs='+', choices=HOSTS, default=list(HOSTS))
    args = parser.parse_args()
    source_root = Path(__file__).resolve().parents[1] / 'skills'
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup_root = args.home / '.local' / 'state' / 'agent-memory-skill-backups' / stamp
    for host in args.hosts:
        for source in sorted(source_root.iterdir()):
            if not (source / 'SKILL.md').is_file():
                continue
            target = args.home / f'.{host}' / 'skills' / source.name
            status = sync(source, target, backup_root / host / source.name, args.apply)
            print(f'{host}/{source.name}: {status}')
    if args.apply:
        print(f'Backup root (created only for replacements): {backup_root}')


if __name__ == '__main__':
    main()
