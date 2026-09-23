"""Draft tell and format checks. Synthetic contrast pairs, not author evidence."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/check_draft.py'
spec = importlib.util.spec_from_file_location('check_draft', SCRIPT)
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


def warnings(report, rule=None):
    return [f for f in report['findings'] if f['severity'] == 'warning' and (rule is None or f['rule'] == rule)]


def rules(report, severity=None):
    return {f['rule'] for f in report['findings'] if severity is None or f['severity'] == severity}


AI_KO = ('이번 프로젝트는 단순한 리팩터링이 아니라, 팀의 개발 문화를 재정의하는 중요한 전환점이었습니다. '
         '이를 통해 다양한 문제를 효율적으로 해결할 수 있었으며, 협업의 질 또한 크게 향상되었습니다. '
         '결론적으로, 이번 경험은 시사하는 바가 큽니다.')
PLAIN_KO = ('리팩터링은 3주 걸렸다. 끝나고 나니 PR 하나당 리뷰가 이틀에서 반나절로 줄었다. '
            '파일이 작아져서 리뷰어가 한 번에 읽을 수 있게 된 게 컸다.')
AI_EN = ("In today's fast-paced world, caching plays a pivotal role. Let's dive in. "
         'The new layer reduces latency, highlighting the intricate interplay of memory and disk.')
PLAIN_EN = 'We added a read-through cache in front of the pricing API. p95 latency dropped from 900 ms to 210 ms.'


class TellTests(unittest.TestCase):
    def test_korean_ai_paragraph_warns_and_plain_paragraph_does_not(self):
        self.assertTrue(warnings(checker.check_text(AI_KO, 'general')))
        self.assertEqual(warnings(checker.check_text(PLAIN_KO, 'general')), [])

    def test_english_ai_paragraph_warns_and_plain_paragraph_does_not(self):
        report = checker.check_text(AI_EN, 'general')
        self.assertIn('staged_opener', rules(report, 'warning'))
        self.assertEqual(warnings(checker.check_text(PLAIN_EN, 'general')), [])

    def test_weak_tell_alone_is_info_until_another_family_joins_it(self):
        alone = checker.check_text('캐시를 통해 응답 시간을 900ms에서 210ms로 줄였다.', 'general')
        self.assertEqual(warnings(alone), [])
        self.assertIn('translationese', rules(alone, 'info'))
        joined = checker.check_text('캐시를 통해 다양한 응답 시간을 줄였다.', 'general')
        self.assertTrue(warnings(joined, 'co_occurrence'))

    def test_contrast_frame_warns_only_when_recurrent(self):
        filler = ' '.join(f'{i}번째 설정을 바꿨다.' for i in range(20))
        once = checker.check_text('문제는 코드가 아니라 설정이었다. ' + filler, 'general')
        self.assertEqual(warnings(once, 'contrast_frame'), [])
        self.assertIn('contrast_frame', rules(once, 'info'))
        thrice = checker.check_text('핵심은 속도가 아니라 방향이다. 목표는 기능이 아니라 습관이다. '
                                    '중요한 건 도구가 아니라 사람이다. 그래서 바꿨다.', 'general')
        self.assertTrue(warnings(thrice, 'contrast_frame'))

    def test_korean_comma_after_connective_ending_is_measured(self):
        chained = ('서버를 재시작했고, 로그를 확인했으며, 원인을 찾았다. 설정을 바꿨고, 다시 배포했다. '
                   '지표를 봤지만, 변화가 없었다. 캐시를 껐고, 재시도했다. 결과를 기록했다.')
        self.assertTrue(warnings(checker.check_text(chained, 'general'), 'comma_after_connective'))
        split = '서버를 재시작하고 로그를 확인해서 원인을 찾았다. 설정을 바꾸고 다시 배포했다. 지표는 그대로였다.'
        self.assertEqual(warnings(checker.check_text(split, 'general'), 'comma_after_connective'), [])

    def test_chat_leftovers_and_bait_warn_on_one_sighting(self):
        self.assertTrue(warnings(checker.check_text('설정 방법은 위와 같습니다. 도움이 되었으면 좋겠습니다!', 'general'), 'chat_leftover'))
        self.assertTrue(warnings(checker.check_text('공감하면 좋아요 눌러주세요.', 'thread'), 'engagement_bait'))

    def test_code_fences_and_quotes_are_not_scanned(self):
        text = '설정을 바꿨다.\n\n```\n// Let\'s dive in. 알아보겠습니다\n```\n\n> 결론적으로, 다양한 시사점이 있다.\n'
        self.assertEqual(warnings(checker.check_text(text, 'general')), [])

    def test_passive_voice_and_single_dash_are_not_tells(self):
        report = checker.check_text('The config was loaded before startup — twice, in fact.', 'general')
        self.assertEqual(warnings(report), [])


BARE_RESULTS = '리팩터링은 3주 걸렸다. 리뷰가 이틀에서 반나절로 줄었다. 파일이 작아진 게 컸다.'
VOICED = ('리팩터링 하자 말자로 팀에서 싸우는 중이라 해본 사람으로서 썰 풀어봄.\n'
          '일주일이면 될 줄 알았는데 3주 걸림. 2주차 금요일 밤에 테스트 40개가 한꺼번에 빨간불 떴을 땐 '
          '진짜 롤백할까 했는데 이미 절반 넘게 쪼개놔서 아까워서 못 돌림. 매몰비용 ㅋㅋ\n'
          '끝나고 나니 800줄 넘던 파일이 200줄 안쪽으로 줄었고 이틀씩 걸리던 리뷰가 반나절이면 끝남. '
          '근데 그 사이에 리뷰어도 한 명 늘어서 전부 파일 크기 덕이라고는 못 하겠음.')


class HumanityTests(unittest.TestCase):
    def test_announcer_is_weak_alone_and_warns_next_to_another_tell(self):
        # Naver how-to posts use "방법은 간단해요" before real steps, so it cannot warn alone.
        self.assertEqual(warnings(checker.check_text('방법은 간단해요. 설정에서 캐시를 끄면 됩니다.', 'general')), [])
        self.assertIn('announcer', rules(checker.check_text('The answer is simple. The cache was off.', 'general'), 'info'))
        joined = checker.check_text('핵심은 단순합니다. 이를 통해 다양한 판단을 돌려줍니다.', 'general')
        self.assertTrue(warnings(joined, 'co_occurrence'))

    def test_co_occurrence_spans_one_sentence_paragraphs(self):
        text = 'Jev는 대화용 모델이 아닙니다.\n\n코드 생성용 모델도 아닙니다.\n\n다양한 판단을 빠르게 돌려줍니다.\n'
        report = checker.check_text(text, 'blog')
        self.assertTrue(warnings(report, 'co_occurrence'))
        self.assertIn('negation_list', report['findings'][0]['measurement']['families'])
        alone = checker.check_text('Jev는 대화용 모델이 아닙니다.\n\n코드 생성용 모델도 아닙니다.\n\n판단을 돌려줍니다.\n', 'blog')
        self.assertEqual(warnings(alone, 'negation_list'), [])
        self.assertIn('negation_list', rules(alone, 'info'))

    def test_bare_metric_is_a_tell_only_in_narrative_genres(self):
        self.assertNotIn('before_after', rules(checker.check_text(BARE_RESULTS, 'general')))
        self.assertNotIn('before_after', rules(checker.check_text(BARE_RESULTS, 'pr')))
        self.assertIn('before_after', rules(checker.check_text(BARE_RESULTS, 'blog', genre='experience')))

    def test_experience_without_a_person_warns_and_voiced_draft_does_not(self):
        bare = checker.check_text(BARE_RESULTS, 'blog', genre='experience')
        self.assertTrue(warnings(bare, 'thin_human_signal'))
        voiced = checker.check_text(VOICED, 'blog', genre='experience')
        self.assertEqual(warnings(voiced), [])
        self.assertGreaterEqual(voiced['measurements']['human_signals']['kinds'], 3)
        self.assertNotIn('thin_human_signal', rules(checker.check_text(BARE_RESULTS, 'blog', genre='reference')))

    def test_two_sentences_are_too_short_to_judge(self):
        report = checker.check_text('리팩터링은 3주 걸렸다. 리뷰가 이틀에서 반나절로 줄었다.', 'general')
        self.assertEqual(report['status'], 'too_short')


STOCK_WEAK = ('# 에이코프 주가 52달러, 제가 바이라고 보는 이유\n\n[이미지: 최근 3개월 차트]\n\n'
              '에이코프 주가가 연일 오르면서 지금 사도 되는지 궁금하신 분들이 많으실 겁니다. '
              '에이코프는 어제 52달러로 마감했습니다.\n')
STOCK_HOOKED = ('# 에이코프 주가 전망, 중국 매출 빼고도 다음 분기 30억 달러\n\n'
                '에이코프가 다음 분기 매출을 30억 달러로 내다봤습니다. 중국 매출을 하나도 넣지 않고 낸 숫자입니다.\n\n'
                '※ 저는 에이코프를 보유하고 있습니다.\n\n'
                '| 항목 | 2분기 실적 | 3분기 전망 |\n|---|---|---|\n| 매출 | 27억 달러 | 30억 달러 |\n\n'
                '에이코프 주가 전망을 볼 때 저는 매출보다 이익률을 먼저 봅니다.\n')


class SearchHookTests(unittest.TestCase):
    def test_generic_reader_assumption_hook_warns(self):
        report = checker.check_text(STOCK_WEAK, 'blog', keyword='에이코프 주가')
        self.assertTrue(warnings(report, 'generic_hook'))
        self.assertTrue(warnings(report, 'weak_snippet_sentence'))
        hooked = checker.check_text(STOCK_HOOKED, 'blog', keyword='에이코프 주가 전망')
        self.assertFalse({'generic_hook', 'weak_snippet_sentence'} & rules(hooked))

    def test_disclosure_paragraph_is_not_the_hook(self):
        text = ('# 에이코프 주가 전망\n\n※ 저는 에이코프를 보유하고 있습니다. 이 글은 개인 의견입니다.\n\n'
                '에이코프 주가가 오르면서 궁금하신 분들이 많으실 겁니다.\n')
        report = checker.check_text(text, 'blog', keyword='에이코프 주가')
        self.assertTrue(warnings(report, 'generic_hook'))
        self.assertTrue(warnings(report, 'weak_snippet_sentence'))

    def test_keyword_must_lead_the_title(self):
        missing = checker.check_text(STOCK_HOOKED, 'blog', keyword='에이코프 배당')
        self.assertTrue(warnings(missing, 'keyword_missing_in_title'))
        self.assertNotIn('keyword_missing_in_title', rules(checker.check_text(STOCK_HOOKED, 'blog', keyword='에이코프 주가')))

    def test_placeholder_and_volatile_title_number(self):
        report = checker.check_text(STOCK_WEAK, 'blog')
        self.assertTrue(warnings(report, 'placeholder_left'))
        self.assertIn('volatile_title_number', rules(report, 'info'))
        self.assertNotIn('volatile_title_number', rules(checker.check_text(STOCK_HOOKED, 'blog')))

    def test_many_numbers_want_a_table(self):
        prose = ('# 에이코프 실적\n\n매출은 27억 달러로 18% 늘었습니다. 이익률은 75%입니다. '
                 '전망은 30억 달러이고 이익률 전망은 74%입니다. 배당은 0.25달러이고 한도는 99억 달러입니다. '
                 '주가는 52달러이고 최고가는 54달러입니다.\n')
        self.assertIn('numbers_without_table', rules(checker.check_text(prose, 'blog'), 'info'))
        self.assertNotIn('numbers_without_table', rules(checker.check_text(STOCK_HOOKED, 'blog')))

    def test_thread_hook_uses_the_same_rule(self):
        report = checker.check_text('요즘 이 주식 고민해 보셨을 겁니다.\n3가지만 봅니다.', 'thread')
        self.assertTrue(warnings(report, 'generic_hook'))


class FormatTests(unittest.TestCase):
    def test_pr_without_reason_or_verification_warns(self):
        report = checker.check_text('## 변경 사항\n\n- `auth.ts`: 로직 수정\n- `retry.ts`: 재시도 추가\n- `api.ts`: 정리\n', 'pr')
        self.assertTrue(warnings(report, 'missing_reason'))
        self.assertTrue(warnings(report, 'missing_verification'))
        self.assertIn('file_walkthrough', rules(report))

    def test_complete_pr_has_no_format_warnings(self):
        pr = ('토큰이 만료된 직후 요청이 동시에 나가면 재발급이 두 번 일어나서 둘 다 실패했습니다(#412).\n\n'
              '재발급 요청을 하나로 묶고 끝날 때까지 나머지 요청을 기다리게 했습니다.\n\n'
              '검증: `pnpm test auth` 통과. 만료 직전 토큰으로 요청 3개를 동시에 보내 재발급 1회를 확인했습니다.\n\n'
              '봐 주세요: `retryQueue`가 재발급 실패 때 대기 요청을 모두 reject하는지.\n')
        self.assertEqual(warnings(checker.check_text(pr, 'pr', diff='+export const retryQueue = []\n')), [])

    def test_pr_identifier_missing_from_diff_warns_but_commands_do_not(self):
        pr = '재시도 원인 때문에 `retryQueue`와 `refresh.ts`를 고쳤다. 검증: `pnpm test` 통과.'
        diff = '+++ b/src/refresh.ts\n+const x = 1\n'
        found = warnings(checker.check_text(pr, 'pr', diff=diff), 'phantom_reference')
        self.assertEqual([f['evidence'] for f in found], [['retryQueue']])

    def test_narrated_pr_opening_is_reported(self):
        report = checker.check_text('이 PR은 로그인 로직을 개선합니다. 원인은 중복 요청입니다. 테스트 통과.', 'pr')
        self.assertIn('narrated_opening', rules(report))

    def test_thread_platform_limits(self):
        self.assertEqual(checker.x_weighted_length('가' * 140), 280)
        self.assertEqual(checker.x_weighted_length('a' * 10 + ' https://example.com/very/long/path'), 10 + 1 + 23)
        over_x = checker.check_text('가' * 141, 'thread', platform='x')
        self.assertTrue(warnings(over_x, 'post_too_long'))
        self.assertEqual(warnings(checker.check_text('가' * 140, 'thread', platform='x'), 'post_too_long'), [])
        posts = '첫 글.\n\n---\n\n' + '나' * 501
        found = warnings(checker.check_text(posts, 'thread', platform='threads'), 'post_too_long')
        self.assertEqual([f['block'] for f in found], ['post-02'])

    def test_question_hook_is_info(self):
        self.assertIn('question_hook', rules(checker.check_text('캐시 왜 안 먹힐까?\n\n설정 하나였다.', 'thread'), 'info'))

    def test_blog_structure(self):
        blog = ('# 캐시 설정\n\n# 두 번째 제목\n\n## 왜 느려졌나?\n\n- 목록\n\n'
                '<script type="application/ld+json">{"@type": "FAQPage"}</script>\n')
        report = checker.check_text(blog, 'blog')
        self.assertIn('multiple_h1', rules(report, 'info'))  # velog-style bodies use # headings under a title field
        self.assertTrue(warnings(report, 'deprecated_schema'))
        self.assertIn('question_heading_unanswered', rules(report))
        self.assertIn('no_citable_evidence', rules(report))

    def test_answered_blog_section_is_clean(self):
        blog = ('# Next.js 15 fetch 캐시 기본값\n\nNext.js 15부터 fetch는 기본으로 캐시하지 않는다. '
                '[공식 문서](https://nextjs.org/docs)\n\n## 왜 느려졌나?\n\n요청마다 원본 API를 호출해서 p95가 3초가 됐다.\n')
        report = checker.check_text(blog, 'blog')
        self.assertEqual(warnings(report), [])
        self.assertFalse({'question_heading_unanswered', 'no_citable_evidence', 'multiple_h1'} & rules(report))


class CliTests(unittest.TestCase):
    def test_cli_writes_report_and_rejects_bad_format(self):
        with tempfile.TemporaryDirectory() as directory:
            draft = Path(directory) / 'draft.md'
            draft.write_text(AI_KO, encoding='utf-8')
            output = Path(directory) / 'report.json'
            result = subprocess.run([sys.executable, str(SCRIPT), str(draft), '--format', 'blog', '--output', str(output)],
                                    cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads(output.read_text(encoding='utf-8'))
            self.assertEqual(report['status'], 'review_required')
            self.assertIn('caveat', report)
            bad = subprocess.run([sys.executable, str(SCRIPT), str(draft), '--format', 'tweet'],
                                 cwd=directory, capture_output=True, text=True)
            self.assertEqual(bad.returncode, 2)
            genre = subprocess.run([sys.executable, str(SCRIPT), str(draft), '--format', 'blog', '--genre', 'experience'],
                                   cwd=directory, capture_output=True, text=True)
            self.assertEqual(genre.returncode, 0, genre.stderr)
            self.assertEqual(json.loads(genre.stdout)['genre'], 'experience')
            keyword = subprocess.run([sys.executable, str(SCRIPT), str(draft), '--format', 'blog', '--keyword', '리팩터링'],
                                     cwd=directory, capture_output=True, text=True)
            self.assertEqual(keyword.returncode, 0, keyword.stderr)
            self.assertEqual(json.loads(keyword.stdout)['keyword'], '리팩터링')


if __name__ == '__main__':
    unittest.main()
