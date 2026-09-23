#!/usr/bin/env python3
"""Deterministic AI-tell and format checks for one PR description, thread, or blog draft.

Findings are review input for the host, not AI detection, a quality score or a
similarity score. Pattern lists are dated heuristics (2026-09). Sources and
false-positive notes live in references/ai-tells.md and references/research.md.
A trait supported by an active author profile outranks any finding here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from functools import lru_cache
import importlib.util
import json
import os
from pathlib import Path
import re
import statistics
import sys
import tempfile
import unicodedata

FORMATS = ('pr', 'thread', 'blog', 'general')
POST_LIMITS = {'x': 280, 'threads': 500}  # twitter-text v3 weighted length; Threads API text limit
PROSE_TYPES = frozenset(('paragraph', 'heading', 'list'))
SUFFIXES = frozenset(('.md', '.txt', '.html', '.htm'))
GENRES = ('experience', 'opinion', 'reference')
WINDOW = 3  # sentences; Korean blogs often give each sentence its own paragraph
CAVEAT = ('Heuristic pattern counts and format checks. Not AI detection and not a quality or '
          'similarity score. No warnings does not prove natural prose, and a trait supported by '
          'an active author profile outranks any finding.')
I = re.IGNORECASE


def _family(strength, patterns, problem, suggestion, source, genres=None):
    return {'strength': strength, 'patterns': [re.compile(p, I) for p in patterns], 'genres': genres,
            'problem': problem, 'suggestion': suggestion, 'source': source}


# strong: one sighting warns. recurrent: warns at >= 2 hits and > 8% of sentences (hanlint's
# measured Korean threshold). weak: warns only when another family appears nearby
# (Wikipedia "Signs of AI writing"), counted within WINDOW sentences. Word lists drift with each
# model generation.
TELLS = {
    'staged_opener': _family('strong', [
        r"\b(?:let's|let us) (?:dive|delve) in(?:to)?\b", r"\bin today's (?:fast-paced|ever-changing|rapidly|digital)",
        r"\bhere's the thing\b", r"\bit(?:'s| is) (?:worth noting|important to note) that\b",
        r'\bin this (?:article|post|guide|blog post),? (?:we|i)(?: will|\'ll)\b',
        r'(?:알아|살펴)(?:보겠습니다|보도록 하겠습니다|볼게요|봅시다)', r'결론부터 (?:짧게 )?말하(?:자면|면)\s*[:：]'],
        'The sentence announces what comes next instead of saying it.',
        'Start with the claim or result itself.', 'humanizer 3.0.0 §1-5; Wikipedia:Signs of AI writing; 나무위키'),
    'chat_leftover': _family('strong', [
        r'\bgreat question\b', r'\bi hope this helps\b', r'\bhope this helps\b', r'\bcertainly!', r'\bas an ai\b',
        r'\blet me know if you (?:have|need|want)\b', r'\bfeel free to (?:ask|reach out)\b',
        r'좋은 질문', r'도움이 되(?:셨|었)으면', r'도움이 되길 바랍니다', r'궁금한 (?:점|것)이 있으(?:면|시면)'],
        'Chat-reply wording that was never meant for the reader.', 'Delete it.',
        'Wikipedia:Signs of AI writing; humanizer 3.0.0'),
    'engagement_bait': _family('strong', [
        r'\b(?:like|rt|retweet|repost|share) (?:this )?if\b', r'\bcomment (?:yes|below)\b', r'\btag (?:a friend|someone)\b',
        r'\bfollow (?:me )?for more\b', r'좋아요\s*(?:부탁|눌러|꾹)', r'공감(?:하시|되시|하)면', r'스하리', r'맞팔',
        r'댓글로?\s*[^\n.!?]{0,15}(?:남겨|달아)\s*주세요'],
        'Explicit request for likes, comments, tags or follows. Meta demotes this as engagement bait.',
        'Delete it. Ask a question the reader can answer in one line instead.',
        'Meta Transparency Center: Engagement Bait; Mosseri 2024'),
    'contrast_frame': _family('recurrent', [
        r'\bnot (?:just|only|merely|simply) [^.!?\n]{1,80}?\bbut\b',
        r"\b(?:it|this|that)(?:'s| is)(?:n't| not) (?:just |only |merely |about )?[^.!?\n]{1,60}?[,;:—–]\s*(?:it|this|that)(?:'s| is)\b",
        r'\S+\s+(?<!뿐만 )(?<!뿐 )아니라'],
        'Repeated "not X but Y" framing adds emphasis without adding a fact.',
        'State Y directly with its evidence. Keep the frame only to refute a belief the reader holds.',
        'Wikipedia:Signs of AI writing; hanlint (Korean recurrence threshold)'),
    'formatting_by_rule': _family('recurrent', [
        r'^\*\*[^*\n]{1,40}\*\*\s*[:：]', r'^[\U0001F300-\U0001FAFF☀-➿]'],
        'Bold labels or emoji bullets applied to every item.',
        'Use plain sentences. Bold a name or figure at most once.',
        'Pangram 2025 (bold 43x); Wikipedia WP:AIBOLD'),
    'announcer': _family('weak', [
        r'(?:핵심|답|이유|결론|방법|원리|비결|요점)(?:은|는) (?:아주 |정말 |생각보다 )?(?:간단|단순)(?:합니다|하다|해요|함|하죠)',
        r"\bthe (?:answer|reason|fix|idea|trick|secret) is (?:simple|straightforward)\b"],
        'Announces that the point is simple before stating it.',
        'State the point. How-to posts may keep "방법은 간단해요" when steps follow at once.',
        'humanizer 3.0.0 (staged run-up); Naver how-to posts use it too, so weak alone'),
    'reader_assumption': _family('weak', [
        r'분들(?:이|도)?\s*많(?:으실|을)\s*(?:겁니다|거예요|것입니다|텐데요|것 같습니다)',
        r'(?:해|고민해|생각해|들어|경험해|느껴)\s*보셨을\s*(?:겁니다|거예요|텐데요|것입니다)',
        r'^오늘은\s.{0,40}(?:정리해|소개해|알아|살펴|이야기해)\s*(?:보려고|보겠|드리)',
        r"^(?:have you ever|are you (?:wondering|curious)|if you're like most)\b"],
        'Assumes what readers wonder instead of telling them something.',
        'Open with the most surprising verified fact. In the hook position this becomes the search snippet.',
        '2026-09 Naver stock-post sample; formats.md hook rules'),
    'summary_closer': _family('weak', [
        r'\bin conclusion\b', r'\bin summary\b', r'\bto sum up\b', r'결론적으로', r'요약하자면', r'종합하(?:자면|면)', r'궁극적으로'],
        'Announces a recap instead of ending on new information.',
        'End on the last new fact, the next step, or the limit of the result.',
        'humanizer 3.0.0; 나무위키'),
    'inflated_vocabulary': _family('weak', [
        r'\b(?:delv(?:e|es|ed|ing)|tapestr(?:y|ies)|testament|underscor(?:e|es|ed|ing)|pivotal|intricate|intricacies'
        r'|meticulous(?:ly)?|realm|multifaceted|showcas(?:e|es|ed|ing)|seamless(?:ly)?|commendable|noteworthy'
        r'|transformative|harness(?:es|ed|ing)?|bolster(?:s|ed|ing)?|garner(?:s|ed|ing)?|fostering|ever-evolving'
        r'|game-changer)\b', r'\bunlock the (?:power|potential)\b', r'\bnavigat(?:e|ing) the complexit',
        r'다양한', r'(?:중요한|핵심적인) 역할', r'시사하는 바', r'시사점', r'주목할 만한', r'혁신적', r'획기적',
        r'원활(?:한|하게)', r'극대화', r'새로운 지평', r'한 단계 (?:더 )?도약', r'필요한 시점'],
        'Inflated or stock vocabulary that most models overuse.',
        'Replace with the specific noun, number or verb, or delete.',
        'Kobak et al. 2025; Liang et al. 2024; Wikipedia:Signs of AI writing; 교실밖 10가지 AI 문투'),
    'translationese': _family('weak', [
        r'(?:을|를)\s*통(?:해서|해|하여|한)', r'(?:에|함에) 있어서', r'에 의해(?:서)?', r'에 의한', r'로부터',
        r'되어지', r'보여지', r'잊혀지', r'쓰여지', r'(?:을|를) 가지고 있', r'할 필요가 있'],
        'Translated-English Korean construction.',
        'Use the plain verb: "AI를 통해 효율을 높일 수 있다" becomes "AI로 효율을 높인다".',
        '이오덕 우리글 바로쓰기; 김정선 2016; 한글문화연대 2023; im-not-ai'),
    'participial_rider': _family('weak', [
        r',\s+(?:highlighting|underscoring|emphasizing|showcasing|reflecting|ensuring|fostering|signall?ing'
        r'|demonstrating|illustrating|paving the way)\b'],
        'Trailing ", highlighting/ensuring ..." clause. GPT-4o uses these about 5x more than people.',
        'Make it its own sentence with a subject, or delete it.', 'Reinhart et al., PNAS 2025'),
    'hedge_stack': _family('weak', [
        r'\b(?:could|may|might) (?:potentially|possibly|perhaps)\b', r'수 있을 것으로 (?:보인|예상|판단|생각)',
        r'수도 있을 것 같', r'일 수도 있을 것'],
        'Stacked hedges.', 'Keep one hedge that matches the source certainty. Never remove it entirely.',
        'SlopMonster; humanizer 3.0.0'),
    'negation_list': _family('weak', [],
        'Two negations in a row ("~이 아닙니다. ~도 아닙니다.") before the actual point.',
        'Say what the thing is, with evidence. One negation is enough when a reader holds the wrong belief.',
        'Wikipedia:Signs of AI writing (negative parallelism)'),
    'before_after': _family('weak', [
        r'\S+에서\s*\S+?(?:으)?로\s*(?:줄|늘|단축|개선|감소|증가|바뀌|떨어|올라|뛰|내려|빨라|느려)',
        r'\bfrom\s+[\w.,$%~]+(?:\s?[a-zA-Z%]{1,4})?\s+(?:down\s+|up\s+)?to\s+[\w.,$%~]+'],
        'A bare before-and-after metric ("A에서 B로 줄었다"), the shape most generated impact statements take.',
        'Say what caused the change and how it felt, if the writer supplied that. Otherwise ask.',
        'velog/Naver/Tistory popular-post comparison 2026-09; humanizer 3.0.0',
        genres=('experience', 'opinion')),  # a PR or reference post should report the numbers
    'dash_density': _family('weak', [r'—[^—\n]*—'],
        'Two em dashes in one sentence.', 'Split the sentence or use a comma.',
        'Pangram 2025; SlopMonster (weak alone, model-specific)'),
}

KO_CONNECTIVE_COMMA = re.compile(
    r'(?:(?<=[가-힣])(?:고|며|지만|는데|은데|해서|어서|아서|니까|하면|되면|으면|다면)'
    r'|^(?:그리고|그러나|하지만|또한|따라서|그래서|그런데|특히|게다가|한편|결국|다만))\s*,')
REASON = re.compile(
    r'\b(?:why|because|since|so that|in order to|caused by|root cause|problem|motivation|background|fails?|failed'
    r'|failing|error|bug|broke|broken|crash|slow|missing|duplicate|regression)\b'
    r'|때문|위해|위한|하려고|려면|원인|문제|이유|배경|동기|탓|실패|오류|에러|버그|깨지|깨졌|느려|누락|중복|안 되|못 ', I)
VERIFY = re.compile(r'\b(?:test(?:s|ed|ing)?|verif(?:y|ied|ication)|repro(?:duce|duced)?|benchmark|qa)\b'
                    r'|검증|테스트|확인|재현|통과', I)
FOCUS = re.compile(r'review focus|please (?:check|look at|review|verify)|reviewers? should|feedback (?:on|wanted)'
                   r'|봐\s?주세요|봐주시|주안점|리뷰 포인트|확인 부탁|중점적으로|유심히', I)
NARRATED = re.compile(r'^(?:this (?:pr|pull request|change)\b|in this (?:pr|pull request)\b'
                      r'|(?:이|본|이번)\s?pr(?:은|에서는|에서)?(?![A-Za-z가-힣]))', I)
WALKTHROUGH = re.compile(r'^`?[\w@./-]+\.(?:tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|rb|php|cs|s?css|html|md|json'
                         r'|ya?ml|toml|sql|sh)`?\s*(?:[:：\-–—(]|$)', I)
IDENTIFIER = re.compile(r'[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?')
DEPRECATED_SCHEMA = re.compile(r'"@type"\s*:\s*"(?:FAQPage|HowTo)"')
NEG_END = re.compile(r'(?:아니다|아닙니다|아니에요|아니야|아님)\W*$')
NEG_ALSO = re.compile(r'도\s*(?:아니다|아닙니다|아니에요|아니야|아님)\W*$')
EN_NOT_IT = re.compile(r"^(?:it|this|that)(?:'s| is)(?:n't| not)\b", I)
EN_IT = re.compile(r"^(?:it|this|that)(?:'s| is)\b(?! not)", I)
HUMAN = {
    'first_person': re.compile(r'(?:^|[\s"“(])(?:나|내가|내|난|나도|저|제가|제|저도|저희|우리)(?=[\s는가도를의랑])'
                               r"|\b(?:I|I'm|I've|my|me|we|our)\b"),
    'feeling': re.compile(r'좋았|싫었|재밌|재미있|재미없|힘들|괴로|아쉬|아까|신기|무섭|무서|불안|기뻤|행복|설레|떨리|억울|속상'
                          r'|황당|어이없|놀랐|당황|짜증|걱정|후회|뿌듯|다행|허무|허탈|민망|부끄|후련|현타|멘붕|빡치|미치겠'
                          r'|\b(?:surprised|annoyed|frustrat\w*|happy|glad|worried|scared|relieved|embarrass\w*|excited'
                          r'|tired|angry)\b', I),
    'uncertainty': re.compile(r'것 같|듯하|듯싶|싶다|싶었|모르겠|잘 모르|아닐까|않을까|일지도|수도 있|반반|못 하겠|확실하진|확인(?:하지|을)? 못|장담 못|자신 없'
                              r"|\b(?:I think|I guess|not sure|probably|maybe)\b", I),
    'spoken': re.compile(r'근데|아무튼|그냥|진짜|솔직히|뭔가|ㅋ|ㅎㅎ|ㅠ|\.\.|~~|!!|\b(?:honestly|anyway|kinda|lol)\b', I),
    'causal_link': re.compile(r'(?:는데|은데|더니|다 보니|어서|아서|해서|라서|져서|워서|니까|길래|느라)(?=[\s,.])'
                              r'|\b(?:because|so I|which is why|turns out)\b', I),
}
PLACEHOLDER = re.compile(r'\[(?:이미지|사진|그림|차트|image|img|photo|todo|tbd)\b[^\]\n]*\]|\(여기에[^)\n]*\)|\bTBD\b', I)
VOLATILE_NUMBER = re.compile(r'\d[\d,.]*\s*(?:달러|원|엔|위안|유로)|\$\s?\d|\d\s?(?:USD|KRW)\b')
NUMBER = re.compile(r'\d[\d,.]*\s*(?:%|퍼센트|달러|원|억|만|배|ms|초|분기|개월|년|GB|MB|x\b)')
TABLE = re.compile(r'(?m)^\s*\|?\s*:?-{3,}:?\s*\|')
X_RANGES = ((0, 4351), (8192, 8205), (8208, 8223), (8242, 8247))  # weight 1; everything else weighs 2
URL = re.compile(r'https?://\S+')


@lru_cache(maxsize=1)
def _sibling(name):
    spec = importlib.util.spec_from_file_location(f'_blog_voice_cloner_{name}', Path(__file__).with_name(f'{name}.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _finding(block, category, rule, problem, suggestion, **extra):
    return _sibling('validate_style')._finding(block, category, rule, problem, suggestion, **extra)


def _blocks(text, suffix):
    with tempfile.TemporaryDirectory(prefix='blog-voice-check-', dir=os.environ.get('JCODE_SCRATCH_DIR')) as temporary:
        (Path(temporary) / f'draft{suffix}').write_text(text, encoding='utf-8')
        docs = _sibling('analyze_style').load_documents(Path(temporary))
    return docs[0]['blocks'] if docs else []


def _sentences(text):
    return [s.strip() for s in re.split(r'(?<=[.!?。！？])\s+|\n+', text) if re.search(r'[A-Za-z가-힣]', s)]


def _posts(text):
    return [p.strip() for p in re.split(r'(?m)^\s*-{3,}\s*$', text) if p.strip()]


def x_weighted_length(text):
    """twitter-text v3 weighting: URLs count 23. Emoji sequences may overcount by code point."""
    text = unicodedata.normalize('NFC', text)
    urls = URL.findall(text)
    return 23 * len(urls) + sum(1 if any(a <= ord(c) <= b for a, b in X_RANGES) else 2 for c in URL.sub('', text))


def _pair_hits(sentences):
    hits = []
    for i in range(1, len(sentences)):
        prev, cur = sentences[i - 1][1], sentences[i][1]
        if NEG_END.search(prev) and NEG_ALSO.search(cur):
            hits.append((i, 'negation_list', f'{prev[-20:]} / {cur[-20:]}'))
        elif EN_NOT_IT.search(prev) and EN_IT.search(cur):
            hits.append((i, 'contrast_frame', f'{prev[:24]} / {cur[:24]}'))
    return hits


def _tell_findings(sentences, genre):
    active = {name: family for name, family in TELLS.items() if family['genres'] is None or genre in family['genres']}
    hits = [(i, name, m.group(0).strip()) for i, (_, text) in enumerate(sentences)
            for name, family in active.items() for pattern in family['patterns'] for m in pattern.finditer(text)]
    hits += _pair_hits(sentences)
    by_index = {}
    for i, name, _ in hits:
        by_index.setdefault(i, set()).add(name)
    findings, covered = [], set()
    for start in sorted(by_index):
        if start in covered:
            continue
        window = range(start, start + WINDOW)
        names = set().union(*(by_index.get(j, set()) for j in window))
        if len(names) >= 2 and any(TELLS[n]['strength'] != 'strong' for n in names):
            findings.append(_finding(sentences[start][0], 'ai_tell', 'co_occurrence',
                f'{len(names)} tell families within {WINDOW} sentences: {", ".join(sorted(names))}.',
                'Rewrite the passage around its one concrete claim. Keep traits the active profile supports.',
                source='Wikipedia:Signs of AI writing (act on co-occurring tells)',
                evidence=[text for i, _, text in hits if i in window][:8], measurement={'families': sorted(names)}))
            covered.update(window)
    for name, family in active.items():
        own = [(i, text) for i, n, text in hits if n == name]
        if not own:
            continue
        common = {'source': family['source']}
        if family['strength'] == 'strong':
            findings.extend(_finding(sentences[i][0], 'ai_tell', name, family['problem'], family['suggestion'],
                                     evidence=[text], **common) for i, text in own)
            continue
        ratio = len(own) / max(1, len(sentences))
        if family['strength'] == 'recurrent' and len(own) >= 2 and ratio > 0.08:
            findings.append(_finding(None, 'ai_tell', name, family['problem'], family['suggestion'],
                evidence=[text for _, text in own][:8], measurement={'hits': len(own), 'sentences': len(sentences),
                                                                      'ratio': round(ratio, 3)}, **common))
            continue
        rest = [(i, text) for i, text in own if i not in covered]
        if rest:
            findings.append(_finding(None, 'ai_tell', name, family['problem'] + ' Weak alone.', family['suggestion'],
                evidence=[text for _, text in rest][:8],
                measurement={'hits': len(rest), 'blocks': sorted({sentences[i][0] for i, _ in rest})},
                severity='info', **common))
    return findings


def _human(sentences):
    counts = {kind: sum(bool(rx.search(s)) for s in sentences) for kind, rx in HUMAN.items()}
    return {'sentences_with': counts, 'kinds': sum(n > 0 for n in counts.values())}


def _human_findings(m, genre):
    kinds = m['human_signals']['kinds']
    if genre not in ('experience', 'opinion') or m['sentences'] < 3 or kinds > 2:
        return []
    return [_finding(None, 'human_signal', 'thin_human_signal',
        f'{kinds} of 5 human-signal kinds appear (first person, feeling, uncertainty, spoken trace, causal link). '
        'Popular experience posts sampled in 2026-09 showed 3 to 5.',
        'Interview the writer with grill-me.md for the stake, a scene, a feeling, a doubt or the real cause. '
        'Never invent them.', source='velog/Naver/Tistory popular-post comparison 2026-09',
        measurement=m['human_signals'], severity='warning' if kinds <= 1 else 'info')]


def _rhythm(sentences):
    lengths = [len(re.sub(r'\s', '', s)) for s in sentences]
    korean = [s for s in sentences if re.search(r'[가-힣]', s)]
    comma = [s for s in korean if KO_CONNECTIVE_COMMA.search(s)]
    endings = Counter(m.group(1) for s in korean if (m := re.search(r'([가-힣]{1,2})\W*$', s)))
    top = endings.most_common(1)[0] if endings else ('', 0)
    mean = statistics.fmean(lengths) if lengths else 0
    return {'sentences': len(sentences), 'mean_sentence_chars': round(mean, 1),
            'sentence_length_cv': round(statistics.pstdev(lengths) / mean, 3) if mean else 0,
            'korean_sentences': len(korean), 'connective_comma_sentences': len(comma),
            'connective_comma_ratio': round(len(comma) / len(korean), 3) if korean else 0,
            'top_korean_ending': {'ending': top[0], 'share': round(top[1] / len(korean), 3) if korean else 0},
            '_comma_examples': comma[:5]}


def _rhythm_findings(m):
    findings = []
    examples = m.pop('_comma_examples')
    # Popular human posts sampled in 2026-09 reached 0.49, so only the LLM-average range warns.
    if m['connective_comma_sentences'] >= 3 and m['connective_comma_ratio'] >= 0.3:
        findings.append(_finding(None, 'ai_tell', 'comma_after_connective',
            'Commas after Korean connective endings (-고, -며, -지만) or sentence-initial conjunctions. '
            'LLM Korean essays put commas in 61% of sentences versus 26% for people.',
            'Drop the comma unless it disambiguates what a modifier attaches to, or split the sentence.',
            source='KatFishNet, ACL 2025; human maximum 0.49 in the 2026-09 popular-post sample', evidence=examples,
            measurement={k: m[k] for k in ('korean_sentences', 'connective_comma_sentences', 'connective_comma_ratio')},
            severity='warning' if m['connective_comma_ratio'] >= 0.6 else 'info'))
    if m['sentences'] >= 8 and m['sentence_length_cv'] < 0.25:
        findings.append(_finding(None, 'measurement', 'rhythm_uniform',
            'Sentence lengths barely vary. No validated threshold exists, so this is a prompt to reread, not a tell.',
            'Vary length where the content changes pace. Do not add filler sentences to vary it.',
            source='GPTZero burstiness (abandoned 2023); hanlint declined this check',
            measurement={'sentence_length_cv': m['sentence_length_cv'], 'top_korean_ending': m['top_korean_ending']},
            severity='info'))
    return findings


def _pr_findings(units, diff):
    text = '\n'.join(t for _, t in units)
    findings = []
    if not REASON.search(text):
        findings.append(_finding(None, 'format', 'missing_reason', 'No problem, cause or reason is stated.',
            'Say what was wrong or what triggered the change before describing the fix.',
            source='Tian et al., ICSE 2022 (44% of messages lack why); Linux kernel submitting-patches'))
    if not VERIFY.search(text):
        findings.append(_finding(None, 'format', 'missing_verification', 'No verification is described.',
            'List the commands actually run and their result, or say what was not run.',
            source='GitHub Docs: helping others review; Google eng-practices'))
    if not FOCUS.search(text):
        findings.append(_finding(None, 'format', 'missing_review_focus', 'The reviewer is not told where to look.',
            'Name the file, function or decision to check and the kind of feedback you want.',
            source='Pirouzkhah et al., MSR 2026 (feedback-type statement: merge OR 1.65-1.72)', severity='info'))
    paragraphs = [(b, t) for b, t in units if b.startswith('paragraph')]
    if paragraphs and NARRATED.search(_sentences(paragraphs[0][1])[0] if _sentences(paragraphs[0][1]) else ''):
        findings.append(_finding(paragraphs[0][0], 'format', 'narrated_opening',
            'The first sentence narrates the document ("This PR ...") instead of stating the change.',
            'Open with what changes for the user or system.', source='BLUF (AR 25-50); Google eng-practices',
            severity='info'))
    walkthrough = [b for b, t in units if b.startswith('list') and WALKTHROUGH.search(t)]
    if len(walkthrough) >= 3:
        findings.append(_finding(None, 'format', 'file_walkthrough', 'Per-file walkthrough bullets.',
            'Describe the behavior change once. Reviewers can read the file list in the diff.',
            source='Xiao et al., FSE 2024 (developers deleted generated walkthroughs)', evidence=walkthrough,
            severity='info'))
    if diff is not None:
        for token in dict.fromkeys(re.findall(r'`([^`\n]{2,120})`', text)):
            name = token[:-2] if token.endswith('()') else token
            path_like = re.fullmatch(r'[\w@./-]+\.\w{1,6}', name)
            code_like = IDENTIFIER.fullmatch(name) and re.search(r'[a-z][A-Z]|_|\.', name)
            if (path_like or code_like) and (name.rsplit('/', 1)[-1] if path_like else name) not in diff:
                findings.append(_finding(None, 'claim_consistency', 'phantom_reference',
                    'The description names something the diff does not contain.',
                    'Remove the claim or add the change. Every claimed change must exist in the diff.',
                    source='Gong et al., MSR 2026 (phantom changes: 45% of inconsistent agent PRs)', evidence=[token]))
    return findings


def _hook_findings(hook_block, hook, keyword, body):
    findings = []
    if hook and any(p.search(hook) for p in TELLS['reader_assumption']['patterns'] + TELLS['staged_opener']['patterns']):
        findings.append(_finding(hook_block, 'format', 'generic_hook',
            'The first sentence assumes what readers wonder or announces the topic. It carries no fact.',
            'Open with the most surprising verified fact and the keyword. Move the assumption out or delete it.',
            source='formats.md hook rules; Aubin Le Quéré & Matias 2025', evidence=[hook]))
    if keyword:
        first = next(((b, s) for b, s in body if keyword.lower() in s.lower()), None)
        if first and any(p.search(first[1]) for p in TELLS['reader_assumption']['patterns']):
            findings.append(_finding(first[0], 'format', 'weak_snippet_sentence',
                'The first sentence with the keyword is generic. Naver showed the sentence around the query term as '
                'the snippet in the 2026-09 sample.',
                'Put the keyword in a sentence that states a concrete fact.',
                source='2026-09 Naver search snippet observation', evidence=[first[1]]))
        if not any(keyword.lower() in s.lower() for _, s in body[:3]):
            findings.append(_finding(None, 'format', 'keyword_late', 'The keyword is not in the first three sentences.',
                'State the keyword with the answer near the top.', source='Indig 2026 (first 30% of page)',
                evidence=[keyword], severity='info'))
    return findings


def _thread_findings(posts, platform):
    findings, sizes = [], []
    for index, post in enumerate(posts, 1):
        block = f'post-{index:02d}'
        size = {'x': x_weighted_length(post), 'threads': len(post)}
        sizes.append({'block': block, 'x_weighted': size['x'], 'threads_chars': size['threads']})
        if size[platform] > POST_LIMITS[platform]:
            findings.append(_finding(block, 'platform_limit', 'post_too_long',
                f'{size[platform]} counted characters exceed the {platform} limit of {POST_LIMITS[platform]}.',
                'Split at a clause boundary into the next post.',
                source='twitter-text v3 config (Hangul weighs 2)' if platform == 'x' else 'Meta Threads API overview',
                measurement={'counted': size[platform], 'limit': POST_LIMITS[platform]}))
    hook = posts[0].splitlines()[0].strip() if posts else ''
    if hook.endswith(('?', '？')):
        findings.append(_finding('post-01', 'format', 'question_hook', 'The hook is a question.',
            'Default to a declarative claim. Keep a question only if it addresses the reader and the answer is not obvious.',
            source='Fang & Wheeler 2026; Lai & Farbrot 2014', evidence=[hook], severity='info'))
    return findings, sizes


def _blog_findings(text, suffix, blocks, units, keyword=None):
    findings = []
    raw = re.sub(r'(?ms)^ {0,3}(`{3,}|~{3,}).*?^ {0,3}\1\s*$', '', text)
    if suffix in {'.html', '.htm'}:
        h1 = re.findall(r'<h1\b[^>]*>(.*?)</h1>', raw, re.I | re.S)
    elif suffix == '.md':
        h1 = re.findall(r'(?m)^#\s+(.+?)\s*#*\s*$', raw) + re.findall(r'(?m)^(\S[^\n]*)\n=+\s*$', raw)
    else:
        h1 = None
    if h1 is not None and len(h1) > 1:
        findings.append(_finding(None, 'format', 'multiple_h1', f'{len(h1)} top-level headings.',
            'Keep one main title. Where the platform has a separate title field (velog, Naver, Tistory), '
            'start body headings at level 2.', source='Google Search Central: title links', evidence=h1[:5],
            severity='info'))
    if h1:
        title = re.sub(r'<[^>]+>', '', h1[0]).strip()
        repeated = [w for w, n in Counter(re.findall(r'[A-Za-z0-9]+|[가-힣]{2,}', title.lower())).items() if n > 1]
        if repeated:
            findings.append(_finding(None, 'format', 'title_keyword_repeat', 'The title repeats a keyword.',
                'Say it once. Repeated keywords make Google rewrite the title and read as stuffing.',
                source='Google Search Central: title links; SEO Starter Guide', evidence=repeated, severity='info'))
        if title.endswith(('?', '？')):
            findings.append(_finding(None, 'format', 'question_title', 'The title is a question.',
                'Default to a declarative title that states the answer.', source='Fang & Wheeler 2026',
                evidence=[title], severity='info'))
        if VOLATILE_NUMBER.search(title):
            findings.append(_finding(None, 'format', 'volatile_title_number',
                'The title carries a price or amount that changes daily and will soon be outdated.',
                'Use a dated or lasting number, such as a quarter result or a multiple, unless the post is dated news.',
                source='Google Search Central: title links (outdated titles get rewritten)', evidence=[title],
                severity='info'))
        if keyword and keyword.lower() not in title.lower():
            findings.append(_finding(None, 'format', 'keyword_missing_in_title', 'The title lacks the keyword.',
                'Put the phrase readers type, taken from search autocomplete, near the start of the title.',
                source='claude-seo quality gates (primary keyword near the beginning)', evidence=[keyword, title]))
    if DEPRECATED_SCHEMA.search(text):
        findings.append(_finding(None, 'format', 'deprecated_schema', 'FAQPage or HowTo structured data.',
            'Remove it. FAQ and HowTo rich results no longer appear, and schema alone did not move AI citations.',
            source='Google Search Central changelog (2023-09, 2026-05); Ahrefs 2026 schema study'))
    for i, block in enumerate(blocks):
        if block['type'] != 'heading' or not block['text'].rstrip().endswith(('?', '？')):
            continue
        after = next((b for b in blocks[i + 1:] if b['type'] not in {'code', 'quote'}), None)
        first = _sentences(after['text'])[:1] if after and after['type'] == 'paragraph' else []
        if not first or first[0].endswith(('?', '？')):
            findings.append(_finding(block['id'], 'format', 'question_heading_unanswered',
                'A question heading is not followed by a direct one-sentence answer.',
                'Answer in the first sentence under the heading, then give the detail.',
                source='Semrush 2026 AI search study; Indig 2026 (secondary)', evidence=[block['text']], severity='info'))
    prose = '\n'.join(t for _, t in units)
    if len(NUMBER.findall(prose)) >= 8 and not TABLE.search(text) and '<table' not in text.lower():
        findings.append(_finding(None, 'format', 'numbers_without_table',
            f'{len(NUMBER.findall(prose))} figures sit in prose with no table.',
            'Gather comparable figures into one table with periods as columns. Keep the reasoning in prose.',
            source='Semrush 2026 AI search study (structured sections)', severity='info'))
    if not re.search(r'\d|https?://|\]\(', prose):
        findings.append(_finding(None, 'format', 'no_citable_evidence', 'No number, link or source in the prose.',
            'Add real measurements, citations or quotations where you have them. Never invent them.',
            source='Aggarwal et al., KDD 2024 (GEO)', severity='info'))
    return findings


def check_text(text, fmt='general', *, suffix='.md', platform='threads', diff=None, genre=None, keyword=None):
    if fmt not in FORMATS:
        raise ValueError(f'format must be one of {", ".join(FORMATS)}')
    if genre is not None and genre not in GENRES:
        raise ValueError(f'genre must be one of {", ".join(GENRES)}')
    if platform not in POST_LIMITS:
        raise ValueError(f'platform must be one of {", ".join(POST_LIMITS)}')
    if suffix not in SUFFIXES:
        raise ValueError(f'suffix must be one of {", ".join(sorted(SUFFIXES))}')
    text = unicodedata.normalize('NFC', text)
    if fmt == 'thread':
        posts = _posts(text)
        blocks, units = [], [(f'post-{i:02d}', p) for i, p in enumerate(posts, 1)]
    else:
        blocks = _blocks(text, suffix)
        units = [(b['id'], b['text']) for b in blocks if b['type'] in PROSE_TYPES]
    sentences = [(b, s) for b, t in units for s in _sentences(t)]
    measurements = _rhythm([s for _, s in sentences])
    measurements['human_signals'] = _human([s for _, s in sentences])
    findings = (_tell_findings(sentences, genre) + _rhythm_findings(measurements)
                + _human_findings(measurements, genre))
    if fmt in ('thread', 'blog'):
        skipped = {b for b, t in units if t.lstrip().startswith(('※', '*')) or PLACEHOLDER.fullmatch(t.strip())}
        body = [(b, s) for b, s in sentences if not b.startswith('heading') and b not in skipped]
        findings += _hook_findings(body[0][0] if body else None, body[0][1] if body else '', keyword, body)
        placeholders = PLACEHOLDER.findall(text)
        if placeholders:
            findings.append(_finding(None, 'format', 'placeholder_left', 'Placeholder text is still in the draft.',
                'Replace it with the real image, chart or fact before publishing, or delete it.',
                source='publishing checklist', evidence=placeholders[:5]))
    if fmt == 'pr':
        findings += _pr_findings(units, diff)
    elif fmt == 'thread':
        thread, measurements['posts'] = _thread_findings(posts, platform)
        findings += thread
    elif fmt == 'blog':
        findings += _blog_findings(text, suffix, blocks, units, keyword)
    if any(f['severity'] == 'warning' for f in findings):
        status = 'review_required'
    else:
        status = 'too_short' if len(sentences) < 3 else 'no_warnings'
    return {'format': fmt, 'platform': platform if fmt == 'thread' else None, 'genre': genre, 'keyword': keyword,
            'status': status,
            'findings': findings, 'measurements': measurements, 'caveat': CAVEAT}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('draft', type=Path, help='Markdown, text or HTML draft. Separate thread posts with a --- line.')
    parser.add_argument('--format', choices=FORMATS, default='general')
    parser.add_argument('--platform', choices=tuple(POST_LIMITS), default='threads', help='Post limit for --format thread.')
    parser.add_argument('--genre', choices=GENRES,
                        help='experience or opinion adds the human-signal check; reference skips it.')
    parser.add_argument('--keyword', help='Search phrase for a blog post or thread. Checks the title, hook and snippet.')
    parser.add_argument('--diff', type=Path, help='Unified diff for --format pr. Flags named identifiers absent from it.')
    parser.add_argument('--output', type=Path, help='Write the JSON report here instead of stdout.')
    args = parser.parse_args(argv)
    try:
        suffix = args.draft.suffix.lower()
        if not args.draft.is_file() or suffix not in SUFFIXES:
            raise ValueError('DRAFT must be an existing Markdown, text, or HTML file')
        diff = args.diff.read_text(encoding='utf-8') if args.diff else None
        report = check_text(args.draft.read_text(encoding='utf-8-sig'), args.format, suffix=suffix,
                            platform=args.platform, diff=diff, genre=args.genre, keyword=args.keyword)
    except (OSError, ValueError, UnicodeDecodeError) as exc:
        parser.error(str(exc))
    rendered = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding='utf-8')
    else:
        sys.stdout.write(rendered)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
