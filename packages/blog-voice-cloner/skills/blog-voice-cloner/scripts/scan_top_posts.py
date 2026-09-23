#!/usr/bin/env python3
"""Measure blog posts that rank for one search phrase, from HTML files already on disk.

Reads Naver (SmartEditor ONE, saved from m.blog.naver.com) and Tistory post pages.
Name files by rank (01.html, 02.html); `find_top_posts.py` does this for Tistory.
This script never fetches anything. The counts describe what already ranks. They
are not targets, not ranking causes and not a quality score. Parsing is best effort;
other platforms, old editors and unknown skins are reported as not parsed.
"""
from __future__ import annotations

import argparse
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import re
import statistics
import sys

ROOTS = frozenset(('se-main-container', 'contents_style'))  # Naver, Tistory body containers
NAVER_KINDS = {'text': 'text', 'image': 'image', 'imageStrip': 'image', 'imageGroup': 'image',
               'sectionTitle': 'heading', 'quotation': 'quote', 'table': 'table', 'video': 'video',
               'oembed': 'video', 'oglink': 'link_card', 'placesMap': 'map', 'map': 'map',
               'sticker': 'sticker', 'code': 'code', 'horizontalLine': 'divider'}
TAG_KINDS = {'p': 'text', 'div': 'text', 'span': 'text', 'ul': 'text', 'ol': 'text', 'blockquote': 'quote',
             'table': 'table', 'pre': 'code', 'hr': 'divider', 'img': 'image', 'iframe': 'video',
             **{f'h{n}': 'heading' for n in range(1, 7)}}
EXTERNAL = frozenset(('link_card', 'map'))  # text the author did not write
NOT_PHOTO = EXTERNAL | {'sticker', 'video'}
HOOK = frozenset(('text', 'quote'))
VOID = frozenset(('img', 'hr', 'br', 'input', 'source', 'embed'))
BREAKS = frozenset(('p', 'br', 'li', 'div', 'tr', 'td', 'th', 'blockquote', 'figcaption', 'pre'))
INVISIBLE = str.maketrans('', '', '​‌‍﻿')  # editors fill empty lines with these
NO_BODY = ('No post body found (Naver se-main-container or Tistory contents_style). For Naver, save the '
           'm.blog.naver.com page: blog.naver.com shows the post inside an iframe. Other platforms, old editors '
           'and custom skins without contents_style are not supported.')
CAVEAT = ('One query, one moment, one small sample. These counts describe what already ranks; they are not targets, '
          'not ranking causes and not a quality score. Ranking also reflects each blog\'s history and topic focus.')
COLUMNS = ('characters', 'images', 'headings', 'quotes', 'tables', 'videos', 'link_cards')


def _kind(tag, classes, attrs):
    if 'se-component' in classes:
        name = next((c[3:] for c in classes if c.startswith('se-') and c != 'se-component'
                     and not c.startswith('se-l-')), '')
        return NAVER_KINDS.get(name, 'other')
    ke = attrs.get('data-ke-type')
    if ke == 'opengraph':
        return 'link_card'
    if ke == 'video':
        return 'video'
    if tag == 'figure':
        return 'image' if {'imageblock', 'imagegridblock', 'imageslideblock'} & set(classes) else 'other'
    return TAG_KINDS.get(tag, 'other')


class _Post(HTMLParser):
    """Passive extraction. Only classes, data-ke-type, two meta tags and the Naver date are read."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = 0  # open <div> count inside the body container; 0 is outside
        self.block = None  # [tag, open count of that tag, kind] of the current top-level block
        self.kinds = []
        self.chunks = []
        self.images = 0
        self.hidden = 0
        self.title = self.date = None
        self.in_date = False

    def _current(self):
        return self.block[2] if self.block else 'text'

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = (attrs.get('class') or '').split()
        if tag == 'meta' and attrs.get('property') == 'og:title':
            self.title = attrs.get('content')
        elif tag == 'meta' and attrs.get('property') == 'article:published_time':
            self.date = attrs.get('content')
        elif 'blog_date' in classes and self.date is None:
            self.in_date = True
        if tag in ('script', 'style', 'noscript'):
            self.hidden += 1
        if self.hidden:
            return
        if not self.root:
            self.root = int(tag == 'div' and bool(ROOTS & set(classes)))
            return
        if tag == 'div':
            self.root += 1
        kind = None
        if self.block is None and tag != 'br':
            kind = _kind(tag, classes, attrs)
            self.kinds.append(kind)
            if tag not in VOID:
                self.block = [tag, 0, kind]
        if self.block and tag == self.block[0]:
            self.block[1] += 1
        if tag == 'img' and (kind or self._current()) not in NOT_PHOTO:
            self.images += 1
        if tag in BREAKS:
            self.chunks.append((self._current(), '\n'))

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript'):
            self.hidden = max(0, self.hidden - 1)
            return
        if self.hidden or not self.root:
            return
        if tag in BREAKS:
            self.chunks.append((self._current(), '\n'))
        if self.block and tag == self.block[0]:
            self.block[1] -= 1
            if not self.block[1]:
                self.block = None
        if tag == 'div':
            self.root -= 1
            if not self.root:
                self.block = None

    def handle_data(self, data):
        if self.hidden:
            return
        if self.in_date and data.strip():
            self.date, self.in_date = data.strip(), False
        if self.root:
            self.chunks.append((self._current(), data))


def measure(html, keyword):
    """Describe one saved post. The keyword matches with its spaces ignored."""
    if not keyword.strip():
        raise ValueError('keyword must not be empty')
    post = _Post()
    post.feed(html)
    post.close()
    if not post.kinds:
        return {'error': NO_BODY}
    body = ''.join(t for kind, t in post.chunks if kind not in EXTERNAL).translate(INVISIBLE)
    hook = ''.join(t for kind, t in post.chunks if kind in HOOK).translate(INVISIBLE)
    sentences = [s for s in re.split(r'(?<=[.!?。！？])\s+|\n+', hook) if s.strip()]
    phrase = re.compile(r'\s*'.join(map(re.escape, re.sub(r'\s+', '', keyword))), re.I)
    title = post.title or ''
    at = phrase.search(title)
    kinds = Counter(post.kinds)
    return {'title': title, 'date': post.date, 'characters': sum(not c.isspace() for c in body),
            'images': post.images, 'headings': kinds['heading'], 'quotes': kinds['quote'], 'tables': kinds['table'],
            'videos': kinds['video'], 'link_cards': kinds['link_card'], 'opens_with': post.kinds[0],
            'title_keyword_at': at.start() if at else None,
            'keyword_in_first_3': any(phrase.search(s) for s in sentences[:3])}


def _cell(value):
    # Titles are untrusted page data: keep them from breaking the table or rendering as HTML.
    return re.sub(r'\s+', ' ', str(value)).strip().replace('|', '\\|').replace('<', '&lt;')


def _number(value):
    return f'{value:,.0f}' if value == int(value) else f'{value:,.1f}'


def render(rows, keyword):
    parsed = [r for r in rows if 'error' not in r]
    lines = [f'# Top posts for "{_cell(keyword)}"', '',
             f'{len(parsed)} of {len(rows)} saved posts parsed. Rank is the number that starts each file name, '
             'otherwise the order the files were given.', '',
             '| Rank | Title | Date | Characters | Images | Headings | Quotes | Tables | Videos | Link cards '
             '| Opens with | Keyword in title at | Keyword in first 3 sentences |',
             '|' + ' --- |' * 13]
    for r in parsed:
        cells = [r['rank'], _cell(r['title']), _cell(r['date'] or '?'), *(_number(r[c]) for c in COLUMNS),
                 r['opens_with'], '-' if r['title_keyword_at'] is None else r['title_keyword_at'],
                 'yes' if r['keyword_in_first_3'] else 'no']
        lines.append('| ' + ' | '.join(map(str, cells)) + ' |')
    if parsed:
        lines += ['', 'Range over parsed posts, min / median / max:', '']
        for column in COLUMNS:
            values = [r[column] for r in parsed]
            label = column.replace('_', ' ').capitalize()
            lines.append(f'- {label}: {_number(min(values))} / {_number(statistics.median(values))} / {_number(max(values))}')
        in_title = sum(r['title_keyword_at'] is not None for r in parsed)
        in_hook = sum(r['keyword_in_first_3'] for r in parsed)
        lines.append(f'- Keyword in title: {in_title} of {len(parsed)}; in the first 3 sentences: {in_hook} of {len(parsed)}')
    missing = [r for r in rows if 'error' in r]
    if missing:
        lines += ['', 'Not parsed:', '', *(f'- {_cell(r["file"])} (rank {r["rank"]}): {r["error"]}' for r in missing)]
    lines += ['', 'Characters are non-whitespace characters in the post body, including captions, tables and code, '
              'excluding link cards and maps. Images exclude link-card thumbnails, stickers and video. Videos include '
              'embeds. Keyword in title at is the character offset in the title, 0 meaning it opens the title.', '',
              CAVEAT, '']
    return '\n'.join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('posts', nargs='+', type=Path, help='Saved post HTML, named by rank (01.html) or given in rank order.')
    parser.add_argument('--keyword', required=True, help='The search phrase the posts rank for.')
    parser.add_argument('--output', type=Path, help='Write the Markdown report here instead of stdout.')
    args = parser.parse_args(argv)
    try:
        rows = []
        for position, path in enumerate(args.posts, 1):
            if not path.is_file() or path.suffix.lower() not in {'.html', '.htm'}:
                raise ValueError(f'{path} is not an existing HTML file')
            number = re.match(r'\d+', path.name)
            rows.append({'rank': int(number[0]) if number else position, 'file': path.name,
                         **measure(path.read_text(encoding='utf-8-sig'), args.keyword)})
    except (OSError, ValueError, UnicodeDecodeError) as exc:
        parser.error(str(exc))
    report = render(rows, args.keyword)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(report, encoding='utf-8')
    else:
        sys.stdout.write(report)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
