"""Top-post listing and Tistory saving with the network replaced by a fake. No real requests."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/find_top_posts.py'
spec = importlib.util.spec_from_file_location('find_top_posts', SCRIPT)
finder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(finder)

NAVER = {'items': [{'title': '<b>엔비디아</b> 주가 &amp; 전망', 'link': 'https://blog.naver.com/abc/224397968578',
                    'bloggername': '이코', 'postdate': '20260902'}]}
DAUM = {'documents': [{'title': '<b>가을</b> 꽃', 'url': 'https://a.tistory.com/424', 'blogname': '유하우스',
                       'datetime': '2026-09-17T17:53:48.000+09:00'}]}


class FakeNetwork:
    def __init__(self, pages):
        self.pages, self.requests, self.sleeps = pages, [], []

    def get(self, url, headers=None):
        self.requests.append((url, headers or {}))
        page = self.pages.get(url.split('?')[0])
        if page is None:
            raise urllib.error.HTTPError(url, 404, 'Not Found', {}, None)
        return page.encode('utf-8')

    def __enter__(self):
        self.saved = finder._get, finder.time.sleep
        finder._get, finder.time.sleep = self.get, self.sleeps.append
        return self

    def __exit__(self, *exc):
        finder._get, finder.time.sleep = self.saved


class SearchTests(unittest.TestCase):
    def test_naver_api_row_is_plain_text_with_iso_date(self):
        with FakeNetwork({finder.NAVER_API: json.dumps(NAVER)}) as net:
            rows = finder.search('naver', '엔비디아 주가 전망', 10, {'NAVER_CLIENT_ID': 'id', 'NAVER_CLIENT_SECRET': 'secret'})
        self.assertEqual(rows, [{'title': '엔비디아 주가 & 전망', 'url': 'https://blog.naver.com/abc/224397968578',
                                 'blog': '이코', 'date': '2026-09-02'}])
        url, headers = net.requests[0]
        self.assertIn('sort=sim', url)
        self.assertIn('display=10', url)
        self.assertEqual((headers['X-Naver-Client-Id'], headers['X-Naver-Client-Secret']), ('id', 'secret'))

    def test_daum_api_uses_kakao_key(self):
        with FakeNetwork({finder.DAUM_API: json.dumps(DAUM)}) as net:
            rows = finder.search('daum', '가을', 5, {'KAKAO_REST_API_KEY': 'key'})
        self.assertEqual(rows[0]['title'], '가을 꽃')
        self.assertEqual(rows[0]['date'], '2026-09-17')
        url, headers = net.requests[0]
        self.assertIn('size=5', url)
        self.assertEqual(headers['Authorization'], 'KakaoAK key')

    def test_platform_rejects_lookalike_hosts_and_schemes(self):
        cases = {'https://a.tistory.com/1': 'tistory', 'http://a.tistory.com/1': 'tistory',
                 'https://tistory.com.evil.io/1': 'other', 'https://eviltistory.com/1': 'other',
                 'ftp://a.tistory.com/1': 'other', 'https://blog.naver.com/x/1': 'naver',
                 'https://m.blog.naver.com/x/1': 'naver', 'https://brunch.co.kr/@a/1': 'other'}
        for url, expected in cases.items():
            self.assertEqual(finder.platform(url), expected, url)


class CollectTests(unittest.TestCase):
    def test_saves_allowed_tistory_posts_and_never_requests_naver_or_other_hosts(self):
        rows = [{'url': 'https://a.tistory.com/1'}, {'url': 'https://blog.naver.com/x/2'},
                {'url': 'https://a.tistory.com/private/3'}, {'url': 'https://brunch.co.kr/@b/4'},
                {'url': 'https://b.tistory.com/5'}]
        pages = {'https://a.tistory.com/robots.txt': 'User-agent: *\nDisallow: /private\n',
                 'https://a.tistory.com/1': '<div class="contents_style"><p>첫 글</p></div>',
                 'https://b.tistory.com/robots.txt': 'User-agent: *\nCrawl-delay: 10\n',
                 'https://b.tistory.com/5': '<div class="contents_style"><p>다섯째</p></div>'}
        with tempfile.TemporaryDirectory() as directory, FakeNetwork(pages) as net:
            out = Path(directory)
            finder.collect(rows, out, 3)
            saved = sorted(p.name for p in out.iterdir())
        self.assertEqual(saved, ['01.html', '05.html'])
        self.assertEqual([r['status'] for r in rows],
                         ['saved', 'save_manually', 'robots_disallowed', 'not_fetched', 'saved'])
        self.assertEqual(rows[1]['open'], 'https://m.blog.naver.com/x/2')
        requested = [url for url, _ in net.requests]
        self.assertFalse([u for u in requested if 'naver' in u or 'brunch' in u], requested)
        # robots(a), post 1, robots(b), post 5: no wait before the first request, Crawl-delay wins when longer.
        self.assertEqual(net.sleeps, [3, 3, 10])

    def test_unreadable_robots_means_not_fetched_and_missing_robots_means_allowed(self):
        rows = [{'url': 'https://a.tistory.com/1'}, {'url': 'https://c.tistory.com/2'}]
        pages = {'https://c.tistory.com/2': '<p>ok</p>'}
        def get(url, headers=None):
            if url.startswith('https://a.'):
                raise urllib.error.URLError('timed out')
            return FakeNetwork.get(net, url, headers)
        with tempfile.TemporaryDirectory() as directory, FakeNetwork(pages) as net:
            finder._get = get
            finder.collect(rows, Path(directory), 3)
        self.assertEqual([r['status'] for r in rows], ['robots_unavailable', 'saved'])

    def test_redirect_to_another_host_is_refused(self):
        handler = finder._SameHost()
        request = urllib.request.Request('https://a.tistory.com/1')
        with self.assertRaises(urllib.error.HTTPError) as refused:
            handler.redirect_request(request, None, 302, 'Found', {}, 'https://custom.example/1')
        refused.exception.close()
        self.assertIsNotNone(handler.redirect_request(request, None, 301, 'Moved', {}, 'https://a.tistory.com/m/1'))


class CliTests(unittest.TestCase):
    def test_urls_run_writes_list_with_manual_naver_links(self):
        pages = {'https://a.tistory.com/robots.txt': 'User-agent: *\nDisallow: /search\n',
                 'https://a.tistory.com/1': '<div class="contents_style"><p>본문</p></div>'}
        with tempfile.TemporaryDirectory() as directory, FakeNetwork(pages):
            out = Path(directory) / 'new'
            with contextlib.redirect_stdout(io.StringIO()):
                code = finder.main(['엔비디아 "$(x)', '--urls', 'https://a.tistory.com/1', 'https://blog.naver.com/x/2',
                                    '--out', str(out)])
            listing = (out / 'list.md').read_text(encoding='utf-8')
            data = json.loads((out / 'list.json').read_text(encoding='utf-8'))
        self.assertEqual(code, 0)
        self.assertIn('https://m.blog.naver.com/x/2', listing)
        self.assertIn('02.html', listing)
        self.assertIn('scan_top_posts.py', listing)
        self.assertIn("--keyword '엔비디아 \"$(x)'", listing)
        self.assertEqual([r['status'] for r in data['posts']], ['saved', 'save_manually'])
        self.assertEqual(data['source'], 'urls')

    def test_cli_refuses_missing_keys_and_existing_folder(self):
        env = {k: v for k, v in os.environ.items() if k not in ('NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'KAKAO_REST_API_KEY')}
        with tempfile.TemporaryDirectory() as directory:
            keys = subprocess.run([sys.executable, str(SCRIPT), '가을', '--engine', 'naver', '--out', str(Path(directory) / 'n')],
                                  capture_output=True, text=True, env=env)
            self.assertEqual(keys.returncode, 2)
            self.assertIn('NAVER_CLIENT_ID', keys.stderr)
            self.assertFalse((Path(directory) / 'n').exists())
            exists = subprocess.run([sys.executable, str(SCRIPT), '가을', '--urls', 'https://a.tistory.com/1', '--out', directory],
                                    capture_output=True, text=True, env=env)
            self.assertEqual(exists.returncode, 2)
            self.assertIn('exists', exists.stderr)


if __name__ == '__main__':
    unittest.main()
