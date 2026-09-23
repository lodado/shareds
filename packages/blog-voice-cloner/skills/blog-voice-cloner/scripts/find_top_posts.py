#!/usr/bin/env python3
"""List the blog posts that rank for one search phrase, and save the Tistory ones.

The list comes from the official Naver blog search API (--engine naver, needs
NAVER_CLIENT_ID and NAVER_CLIENT_SECRET), the Kakao Daum blog search API (--engine daum,
needs KAKAO_REST_API_KEY) or --urls in rank order. API order is relevance order and can
differ from the search page. Only *.tistory.com posts are fetched: robots.txt first, one
request at a time, a fixed delay between requests. Naver posts are never fetched, because
Naver's robots.txt prohibits bot access for AI retrieval; the list links their
m.blog.naver.com pages to save by hand. Other hosts are listed, not fetched.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import html
import json
import os
from pathlib import Path
import re
import shlex
import sys
import time
import urllib.error
from urllib.parse import urlencode, urlsplit
import urllib.request
import urllib.robotparser

UA = 'blog-voice-cloner/0.3 (+https://github.com/lodado/my-Vibe-Coding-Helper)'
NAVER_API = 'https://openapi.naver.com/v1/search/blog.json'
DAUM_API = 'https://dapi.kakao.com/v2/search/blog'
KEYS = {'naver': ('NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'), 'daum': ('KAKAO_REST_API_KEY',)}
KEY_PAGES = {'naver': 'https://developers.naver.com/apps (검색 API)', 'daum': 'https://developers.kakao.com (REST API 키)'}


class _SameHost(urllib.request.HTTPRedirectHandler):
    """Follow redirects only within the host whose robots.txt was checked."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).hostname != urlsplit(req.full_url).hostname:
            raise urllib.error.HTTPError(newurl, code, f'redirect to another host: {newurl}', headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SameHost)


def _get(url, headers=None):
    request = urllib.request.Request(url, headers={'User-Agent': UA, **(headers or {})})
    with _OPENER.open(request, timeout=15) as response:
        return response.read()


def _plain(text):
    return html.unescape(re.sub(r'<[^>]+>', '', text or '')).strip()


def search(engine, keyword, size, env):
    if engine == 'naver':
        query = urlencode({'query': keyword, 'display': size, 'start': 1, 'sort': 'sim'})
        data = json.loads(_get(f'{NAVER_API}?{query}', {'X-Naver-Client-Id': env['NAVER_CLIENT_ID'],
                                                        'X-Naver-Client-Secret': env['NAVER_CLIENT_SECRET']}))
        return [{'title': _plain(i.get('title')), 'url': i.get('link', ''), 'blog': _plain(i.get('bloggername')),
                 'date': re.sub(r'^(\d{4})(\d{2})(\d{2})$', r'\1-\2-\3', i.get('postdate', ''))}
                for i in data.get('items', [])]
    query = urlencode({'query': keyword, 'size': size, 'page': 1, 'sort': 'accuracy'})
    data = json.loads(_get(f'{DAUM_API}?{query}', {'Authorization': f'KakaoAK {env["KAKAO_REST_API_KEY"]}'}))
    return [{'title': _plain(d.get('title')), 'url': d.get('url', ''), 'blog': _plain(d.get('blogname')),
             'date': d.get('datetime', '')[:10]} for d in data.get('documents', [])]


def platform(url):
    parts = urlsplit(url)
    host = (parts.hostname or '').lower()
    if parts.scheme not in ('http', 'https'):
        return 'other'
    for name, domain in (('tistory', 'tistory.com'), ('naver', 'naver.com')):
        if host == domain or host.endswith('.' + domain):
            return name
    return 'other'


def collect(rows, out, delay):
    """Set each row's status. Save allowed Tistory pages as NN.html in out, which must exist."""
    robots, requested = {}, False

    def fetch(url, wait):
        nonlocal requested
        if requested:
            time.sleep(wait)
        requested = True
        return _get(url)

    for rank, row in enumerate(rows, 1):
        row['rank'], row['file'] = rank, f'{rank:02d}.html'
        kind = platform(row['url'])
        if kind == 'naver':
            row['status'] = 'save_manually'
            row['open'] = re.sub(r'^(https?://)(?:m\.)?blog\.naver\.com', r'https://m.blog.naver.com', row['url'])
            continue
        if kind != 'tistory':
            row['status'] = 'not_fetched'
            continue
        host = urlsplit(row['url']).hostname
        if host not in robots:
            parser = urllib.robotparser.RobotFileParser()
            try:
                parser.parse(fetch(f'https://{host}/robots.txt', delay).decode('utf-8', 'replace').splitlines())
            except urllib.error.HTTPError as exc:
                exc.close()
                parser = parser if exc.code in (404, 410) else None  # no robots.txt means no restriction
                if parser:
                    parser.parse([])
            except (urllib.error.URLError, OSError, ValueError):
                parser = None
            robots[host] = parser
        parser = robots[host]
        if parser is None:
            row['status'] = 'robots_unavailable'
        elif not parser.can_fetch(UA, row['url']):
            row['status'] = 'robots_disallowed'
        else:
            try:
                (out / row['file']).write_bytes(fetch(row['url'], max(delay, parser.crawl_delay(UA) or 0)))
                row['status'] = 'saved'
            except (urllib.error.URLError, OSError, ValueError) as exc:
                if isinstance(exc, urllib.error.HTTPError):
                    exc.close()
                row['status'] = f'failed: {exc}'
    return rows


def _cell(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip().replace('|', '\\|').replace('<', '&lt;')


def render(keyword, source, collected_at, rows, out):
    scan = Path(__file__).with_name('scan_top_posts.py')
    lines = [f'# Posts ranking for "{_cell(keyword)}"', '',
             f'Source: {source}, collected {collected_at}. API order is relevance order and can differ from the '
             'search page.', '', '| Rank | Status | File | Title | Blog | Date | URL |', '|' + ' --- |' * 7]
    for r in rows:
        lines.append('| ' + ' | '.join(_cell(v) for v in (r['rank'], r['status'], r['file'], r.get('title'),
                                                            r.get('blog'), r.get('date'), r.get('open', r['url']))) + ' |')
    manual = [r for r in rows if r['status'] == 'save_manually']
    if manual:
        lines += ['', 'Naver posts are not fetched automatically. Open each link in a browser and save the page as '
                  'the file name in its row, in this folder (Save Page As, HTML only):', '',
                  *(f'- {r["file"]}: {r["open"]}' for r in manual)]
    lines += ['', 'Then measure what was saved:', '', '```bash',
              f'python3 {shlex.quote(str(scan))} {shlex.quote(str(out))}/*.html --keyword {shlex.quote(keyword)} '
              f'--output {shlex.quote(str(out / "report.md"))}', '```', '']
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('keyword', help='The search phrase readers type.')
    parser.add_argument('--out', type=Path, required=True, help='New folder for list.md, list.json and saved posts.')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--engine', choices=tuple(KEYS), help='naver or daum search API. Keys come from environment variables.')
    source.add_argument('--urls', nargs='+', help='Post URLs in rank order, instead of a search API.')
    parser.add_argument('--size', type=int, default=10, help='Results to list, 1 to 50 (default 10).')
    parser.add_argument('--delay', type=float, default=3.0,
                        help='Seconds between Tistory requests, at least 1 (default 3). A longer robots.txt Crawl-delay wins.')
    args = parser.parse_args(argv)
    if not args.keyword.strip():
        parser.error('keyword must not be empty')
    if not 1 <= args.size <= 50:
        parser.error('--size must be between 1 and 50')
    if args.delay < 1:
        parser.error('--delay must be at least 1 second')
    if args.out.exists():
        parser.error(f'{args.out} exists. Choose a new folder so earlier saves are kept.')
    if args.engine:
        missing = [k for k in KEYS[args.engine] if not os.environ.get(k)]
        if missing:
            parser.error(f'set {", ".join(missing)} first. Get a key at {KEY_PAGES[args.engine]}, or pass --urls.')
        try:
            rows = search(args.engine, args.keyword, args.size, os.environ)
        except urllib.error.HTTPError as exc:
            exc.close()
            parser.exit(2, f'error: {args.engine} search API returned HTTP {exc.code}. Check the key and the daily quota.\n')
        except (urllib.error.URLError, OSError, ValueError) as exc:
            parser.exit(2, f'error: {args.engine} search API failed: {exc}\n')
    else:
        rows = [{'url': url} for url in args.urls]
    args.out.mkdir(parents=True)
    collect(rows, args.out, args.delay)
    collected_at = datetime.now().astimezone().isoformat(timespec='seconds')
    source_name = f'{args.engine} search API' if args.engine else 'urls'
    (args.out / 'list.json').write_text(json.dumps({'keyword': args.keyword, 'source': args.engine or 'urls',
                                                    'collected_at': collected_at, 'posts': rows},
                                                   ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (args.out / 'list.md').write_text(render(args.keyword, source_name, collected_at, rows, args.out), encoding='utf-8')
    counts = {}
    for row in rows:
        counts[row['status'].split(':')[0]] = counts.get(row['status'].split(':')[0], 0) + 1
    sys.stdout.write(f'{len(rows)} posts listed: {", ".join(f"{k} {v}" for k, v in counts.items())}. See {args.out / "list.md"}\n')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
