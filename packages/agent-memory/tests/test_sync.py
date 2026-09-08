import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).parents[1] / 'scripts' / 'sync_skills.py'


class SyncTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('sync_skills', SCRIPT)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'source'
        self.source.mkdir()
        (self.source / 'SKILL.md').write_text('new')
        self.target = self.root / 'target'
        self.backup = self.root / 'backup'

    def test_dry_run_does_not_write(self):
        self.module.sync(self.source, self.target, self.backup, False)
        self.assertFalse(self.target.exists())
        self.assertFalse(self.backup.exists())

    def test_replacement_backed_up_and_retry_unchanged(self):
        self.target.mkdir()
        (self.target / 'SKILL.md').write_text('old')
        (self.target / 'custom.txt').write_text('keep in backup')
        self.module.sync(self.source, self.target, self.backup, True)
        self.assertEqual((self.backup / 'SKILL.md').read_text(), 'old')
        self.assertEqual((self.backup / 'custom.txt').read_text(), 'keep in backup')
        self.assertEqual((self.target / 'SKILL.md').read_text(), 'new')
        self.assertEqual(self.module.sync(self.source, self.target, self.backup, True), 'current')

    def test_symlink_target_not_modified(self):
        elsewhere = self.root / 'elsewhere'
        elsewhere.mkdir()
        (elsewhere / 'SKILL.md').write_text('external')
        self.target.symlink_to(elsewhere, target_is_directory=True)
        self.module.sync(self.source, self.target, self.backup, True)
        self.assertEqual((elsewhere / 'SKILL.md').read_text(), 'external')
        self.assertTrue(self.backup.is_symlink())
        self.assertFalse(self.target.is_symlink())

    def test_backup_collision_fails_without_changes(self):
        self.target.mkdir()
        (self.target / 'SKILL.md').write_text('old')
        self.backup.mkdir()
        with self.assertRaises(FileExistsError):
            self.module.sync(self.source, self.target, self.backup, True)
        self.assertEqual((self.target / 'SKILL.md').read_text(), 'old')


if __name__ == '__main__':
    unittest.main()
