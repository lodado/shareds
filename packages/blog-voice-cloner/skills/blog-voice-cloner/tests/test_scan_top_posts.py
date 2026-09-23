"""Top-post measurement on synthetic Naver and Tistory markup, not real posts."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/scan_top_posts.py'
spec = importlib.util.spec_from_file_location('scan_top_posts', SCRIPT)
scanner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scanner)

POST = '''<html><head><meta property="og:title" content="&ldquo;실적은 좋은데&rdquo; 엔비디아 주가 전망 정리"></head><body>
<p class="blog_date"><span class="txt">2026. 9. 2. 10:00</span></p>
<div class="se-viewer">
<div class="se-component se-documentTitle"><p class="se-text-paragraph">제목은 본문이 아니다</p></div>
<div class="se-main-container">
  <div class="se-component se-image se-l-default"><div class="se-component-content">
    <img class="se-image-resource" src="a.jpg"><p class="se-image-caption">직접 찍은 사진</p></div></div>
  <div class="se-component se-text se-l-default"><div class="se-component-content">
    <p class="se-text-paragraph">&#8203;</p>
    <p class="se-text-paragraph">엔비디아 주가 전망부터 말하면</p>
    <p class="se-text-paragraph">단기 변동성이 크다.</p></div></div>
  <div class="se-component se-sectionTitle"><div><p>1. 실적</p></div></div>
  <div class="se-component se-imageStrip"><div><img class="se-image-resource"><img class="se-image-resource"></div></div>
  <div class="se-component se-oglink"><div><p>외부 링크 카드의 긴 제목은 세지 않는다</p></div></div>
  <div class="se-component se-quotation"><blockquote><p>인용문</p></blockquote></div>
  <div class="se-component se-table"><table><tr><td>매출</td></tr></table></div>
  <div class="se-component se-video"><div></div></div>
  <script>var ignored = "스크립트";</script>
</div>
<div class="comment">댓글은 본문이 아니다</div>
</div></body></html>'''
TISTORY = '''<html><head><meta property="og:title" content="엔비디아 주가 전망 | 블로그">
<meta property="article:published_time" content="2026-09-18T11:21:52+09:00"></head><body>
<div class="sidebar"><h2>인기 글</h2><img src="side.png"></div>
<div class="tt_article_useless_p_margin contents_style">
<p data-ke-size="size16">엔비디아 주가 전망은 흐림.</p>
<figure class="imageblock alignCenter"><span data-url="x"><img src="a.png"></span><figcaption>캡션</figcaption></figure>
<h3 data-ke-size="size23">실적</h3>
<figure data-ke-type="opengraph"><div class="og-image"><img src="og.png"></div><div class="og-text"><p>링크 카드 제목</p></div></figure>
<p><span class="imageblock"><img src="b.png"></span></p>
<blockquote>인용</blockquote>
<hr>
<figure data-ke-type="video"><iframe src="https://www.youtube.com/embed/x"></iframe></figure>
<table><tr><td>표</td></tr></table>
<pre data-ke-type="codeblock">code</pre>
</div>
<div class="another_category"><p>관련 글 제목</p></div>
</body></html>'''
DESKTOP = '<html><head><title>블로그</title></head><body><iframe id="mainFrame" src="/PostView.naver"></iframe></body></html>'


class MeasureTests(unittest.TestCase):
    def test_counts_body_blocks_and_skips_chrome_link_cards_and_scripts(self):
        post = scanner.measure(POST, '엔비디아 주가 전망')
        # 직접찍은사진 6 + 엔비디아주가전망부터말하면 13 + 단기변동성이크다. 9 + 1.실적 4 + 인용문 3 + 매출 2
        self.assertEqual(post['characters'], 37)
        self.assertEqual(post['images'], 3)
        self.assertEqual((post['headings'], post['quotes'], post['tables'], post['videos'], post['link_cards']),
                         (1, 1, 1, 1, 1))
        self.assertEqual(post['opens_with'], 'image')
        self.assertEqual(post['title'], '“실적은 좋은데” 엔비디아 주가 전망 정리')
        self.assertEqual(post['date'], '2026. 9. 2. 10:00')

    def test_tistory_body_skips_sidebar_related_posts_and_link_cards(self):
        post = scanner.measure(TISTORY, '엔비디아 주가 전망')
        # 엔비디아주가전망은흐림. 12 + 캡션 2 + 실적 2 + 인용 2 + 표 1 + code 4
        self.assertEqual(post['characters'], 23)
        self.assertEqual(post['images'], 2)
        self.assertEqual((post['headings'], post['quotes'], post['tables'], post['videos'], post['link_cards']),
                         (1, 1, 1, 1, 1))
        self.assertEqual(post['opens_with'], 'text')
        self.assertEqual(post['date'], '2026-09-18T11:21:52+09:00')
        self.assertEqual(post['title_keyword_at'], 0)
        self.assertTrue(post['keyword_in_first_3'])

    def test_keyword_position_ignores_spacing(self):
        for keyword in ('엔비디아 주가 전망', '엔비디아주가전망'):
            post = scanner.measure(POST, keyword)
            self.assertEqual(post['title_keyword_at'], post['title'].index('엔비디아'))
            self.assertTrue(post['keyword_in_first_3'])
        missing = scanner.measure(POST, '테슬라')
        self.assertIsNone(missing['title_keyword_at'])
        self.assertFalse(missing['keyword_in_first_3'])

    def test_page_without_smarteditor_body_is_not_parsed(self):
        self.assertIn('m.blog.naver.com', scanner.measure(DESKTOP, '엔비디아')['error'])
        self.assertIn('error', scanner.measure(TISTORY.replace('contents_style', 'entry'), '엔비디아'))


class ReportTests(unittest.TestCase):
    def test_report_takes_rank_from_file_name_and_lists_unparsed_files(self):
        piped = POST.replace('정리"', '| <b>정리</b>"')
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            files = [folder / '01.html', folder / '02.html', folder / '04.html']
            files[0].write_text(POST, encoding='utf-8')
            files[1].write_text(DESKTOP, encoding='utf-8')
            files[2].write_text(piped, encoding='utf-8')
            output = folder / 'report.md'
            result = subprocess.run([sys.executable, str(SCRIPT), *map(str, files), '--keyword', '엔비디아 주가 전망',
                                     '--output', str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = output.read_text(encoding='utf-8')
        self.assertIn('2 of 3', report)
        ranks = [line.split(' | ')[0] for line in report.splitlines() if line.startswith('| ') and line[2].isdigit()]
        self.assertEqual(ranks, ['| 1', '| 4'])
        self.assertIn('02.html', report)
        self.assertIn('37 / 37 / 37', report)
        self.assertIn('\\| &lt;b>정리', report)
        self.assertIn('not targets', report)

    def test_cli_requires_keyword_and_existing_files(self):
        missing = subprocess.run([sys.executable, str(SCRIPT), 'nope.html', '--keyword', 'x'], capture_output=True, text=True)
        self.assertEqual(missing.returncode, 2)
        no_keyword = subprocess.run([sys.executable, str(SCRIPT), 'nope.html'], capture_output=True, text=True)
        self.assertEqual(no_keyword.returncode, 2)


if __name__ == '__main__':
    unittest.main()
