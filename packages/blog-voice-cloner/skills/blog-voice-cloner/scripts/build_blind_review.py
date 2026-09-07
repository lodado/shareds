#!/usr/bin/env python3
"""Build a local human-review packet using Python 3.10+ and the stdlib.

Manifest schema: {"title": str, "reference_url": str (optional), "cases": [
  {"id": str, "title": str, "brief": str,
   "outputs": [{"variant": str, "path": str}, ...]}, ...]}.
Case IDs are unique safe identifiers. Variants are unique within each case.
Paths are relative to the manifest parent. All strings/texts must be nonblank.

Outputs: review.html, editable ratings.json, and PRIVATE private/key.json.
The HTML has an offline Korean ratings form, browser-local autosave, and JSON
download/import. Browser storage is best-effort, especially for file:// URLs.
Download ratings.json to submit or back up ratings. The original file is never
updated by the browser. Only share review.html and ratings.json, not the folder.
Ratings contain a content-specific packet_id, human_preference="pending", and cases with case_id,
preferred_sample=null (or sample ID / "tie" / "cannot_judge"), notes="",
and samples with sample_id, voice_match=null (1-5), meaning_errors="",
over_imitation="". Completion requires a preference (including tie/cannot_judge)
for every case. Voice scores are optional when the reviewer cannot judge them.
The private key records seed and case/sample identities, variant and source path.
Never distribute the key or seed to reviewers. Seeded shuffling is reproducible,
not cryptographic concealment. Metadata is hidden, but identifying content in
texts, titles, briefs or references is NOT detected or removed. Review these
inputs separately before claiming a blinded evaluation.
"""
import argparse
import hashlib
import html
import json
from pathlib import Path
import random
import re
import secrets
import shutil
from urllib.parse import urlsplit


# No network access or external dependencies. Only the public ratings template
# is embedded below, never the private key, variants, source paths, or seed.
REVIEW_SCRIPT = r'''
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const template = JSON.parse(el('initial-ratings').textContent);
  const storageKey = 'blind-review:v1:' + template.packet_id;
  const status = message => { el('save-status').textContent = message; };
  let storageOkay = true;
  let lastExport;

  function validate(data) {
    if (!data || data.packet_id !== template.packet_id ||
        !['pending', 'completed'].includes(data.human_preference) ||
        !Array.isArray(data.cases) || data.cases.length !== template.cases.length) {
      throw Error('이 검토 파일의 평가 JSON이 아닙니다.');
    }
    // Whitelist fields and validate the whole file before touching any controls.
    const cases = template.cases.map((original, i) => {
      const c = data.cases[i];
      const allowed = [null, 'tie', 'cannot_judge', ...original.samples.map(s => s.sample_id)];
      if (!c || c.case_id !== original.case_id || !allowed.includes(c.preferred_sample) ||
          typeof c.notes !== 'string' || !Array.isArray(c.samples) ||
          c.samples.length !== original.samples.length) throw Error('사례 평가 형식이 올바르지 않습니다.');
      const samples = original.samples.map((sample, j) => {
        const s = c.samples[j];
        if (!s || s.sample_id !== sample.sample_id ||
            !(s.voice_match === null || (Number.isInteger(s.voice_match) && s.voice_match >= 1 && s.voice_match <= 5)) ||
            typeof s.meaning_errors !== 'string' || typeof s.over_imitation !== 'string') {
          throw Error('글 평가 형식이 올바르지 않습니다.');
        }
        return {sample_id: sample.sample_id, voice_match: s.voice_match,
                meaning_errors: s.meaning_errors, over_imitation: s.over_imitation};
      });
      return {case_id: original.case_id, preferred_sample: c.preferred_sample, notes: c.notes, samples};
    });
    if (data.human_preference === 'completed' && cases.some(c => c.preferred_sample === null)) {
      throw Error('완료 평가에는 모든 사례의 선호 선택이 필요합니다.');
    }
    return {packet_id: template.packet_id, human_preference: data.human_preference, cases};
  }

  function collect() {
    const cases = template.cases.map((c, i) => ({
      case_id: c.case_id, preferred_sample: el(`case-${i}-preference`).value || null,
      notes: el(`case-${i}-notes`).value,
      samples: c.samples.map(s => ({
        sample_id: s.sample_id,
        voice_match: el(s.sample_id + '-voice_match').value === '' ? null : Number(el(s.sample_id + '-voice_match').value),
        meaning_errors: el(s.sample_id + '-meaning_errors').value,
        over_imitation: el(s.sample_id + '-over_imitation').value,
      })),
    }));
    const done = cases.filter(c => c.preferred_sample !== null).length;
    el('review-progress').textContent = `선호 선택: ${done}/${cases.length}개 사례`;
    el('review-complete').disabled = done !== cases.length;
    if (done !== cases.length) el('review-complete').checked = false;
    return {packet_id: template.packet_id,
            human_preference: el('review-complete').checked ? 'completed' : 'pending', cases};
  }

  function apply(data) {
    data.cases.forEach((c, i) => {
      el(`case-${i}-preference`).value = c.preferred_sample || '';
      el(`case-${i}-notes`).value = c.notes;
      c.samples.forEach(s => {
        el(s.sample_id + '-voice_match').value = s.voice_match === null ? '' : String(s.voice_match);
        el(s.sample_id + '-meaning_errors').value = s.meaning_errors;
        el(s.sample_id + '-over_imitation').value = s.over_imitation;
      });
    });
    el('review-complete').checked = data.human_preference === 'completed';
    collect();
  }

  function save() {
    const data = collect();
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      storageOkay = true;
      status('브라우저에 자동 저장됨. 제출·백업하려면 ratings.json을 내려받으세요.');
    } catch (_) {
      storageOkay = false;
      status('브라우저 자동 저장 불가. 창을 닫기 전에 반드시 ratings.json을 내려받으세요.');
    }
    return data;
  }

  apply(template);
  lastExport = JSON.stringify(collect());
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved !== null) {
      try {
        apply(validate(JSON.parse(saved)));
        status('이 브라우저에 저장된 평가를 복원했습니다. 제출하려면 JSON을 내려받으세요.');
      } catch (_) {
        status('저장된 평가 복원 실패. 원본 저장값은 유지됩니다. 백업 JSON을 불러오거나 새로 평가하세요.');
      }
    } else {
      status('입력하면 이 브라우저에 자동 저장을 시도합니다. 제출·백업은 JSON 내려받기를 이용하세요.');
    }
  } catch (_) {
    storageOkay = false;
    status('브라우저 자동 저장 불가. 평가 후 반드시 ratings.json을 내려받으세요.');
  }
  el('rating-fields').disabled = false;
  el('export-ratings').disabled = false;
  el('import-ratings').disabled = false;
  el('ratings-form').addEventListener('submit', event => event.preventDefault());
  el('ratings-form').addEventListener('input', save);
  el('ratings-form').addEventListener('change', save);
  el('export-ratings').addEventListener('click', () => {
    const data = save();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], {type: 'application/json;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ratings.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    lastExport = JSON.stringify(data);
    status('JSON 다운로드를 요청했습니다. 저장된 파일을 확인하세요. 기존 ratings.json은 덮어쓰지 않습니다.');
  });
  el('import-ratings').addEventListener('change', async event => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = validate(JSON.parse(await file.text()));
      if (!window.confirm('현재 입력한 평가를 선택한 JSON의 평가로 바꿀까요?')) return;
      apply(data);
      save();
    } catch (_) {
      status('평가 불러오기 실패. 이 검토 파일에서 내려받은 올바른 JSON인지 확인하세요. 현재 입력은 유지됩니다.');
    } finally {
      event.target.value = '';
    }
  });
  window.addEventListener('beforeunload', event => {
    if (!storageOkay && JSON.stringify(collect()) !== lastExport) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
})();
'''


def nonblank(value, label):
    """Validate strings without changing original content or whitespace."""
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a nonempty string")
    value.encode("utf-8")
    return value


def load_manifest(path):
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("manifest must be an object")
    nonblank(manifest.get("title"), "title")
    if "reference_url" in manifest:
        nonblank(manifest["reference_url"], "reference_url")
    cases = manifest.get("cases")
    if not isinstance(cases, list) or not cases:
        raise ValueError("cases must be a nonempty array")
    seen = set()
    for case in cases:
        if not isinstance(case, dict):
            raise ValueError("each case must be an object")
        case_id = nonblank(case.get("id"), "case id")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", case_id):
            raise ValueError("case id must be a safe identifier (letters, digits, _ or -)")
        if case_id in seen:
            raise ValueError("duplicate case id")
        seen.add(case_id)
        nonblank(case.get("title"), "case title")
        nonblank(case.get("brief"), "case brief")
        outputs = case.get("outputs")
        if not isinstance(outputs, list) or len(outputs) < 2:
            raise ValueError("each case needs at least two outputs")
        variants = set()
        for sample in outputs:
            if not isinstance(sample, dict):
                raise ValueError("each output must be an object")
            variant = nonblank(sample.get("variant"), "variant")
            if variant in variants:
                raise ValueError("duplicate variant within case")
            variants.add(variant)
            source = Path(nonblank(sample.get("path"), "output path"))
            if source.is_absolute():
                raise ValueError("output paths must be relative to manifest parent")
            # newline='' avoids modifying original line endings during decoding.
            with (path.parent / source).open(encoding="utf-8", newline="") as stream:
                sample["text"] = nonblank(stream.read(), "output text")
    return manifest


def pre(text):
    # An empty span prevents HTML's special removal of a leading newline in pre.
    prefix = "<span></span>" if text.startswith(("\n", "\r")) else ""
    return "<pre>" + prefix + html.escape(text) + "</pre>"


def reference_link(url):
    """Keep invalid/non-web references inert rather than guessing their scheme."""
    try:
        parts = urlsplit(url)
        if (parts.scheme.lower() not in ("http", "https") or not parts.hostname
                or parts.username is not None or parts.password is not None
                or any(c.isspace() or ord(c) < 32 or ord(c) == 127 for c in url)
                or any(c in parts.hostname for c in '<>"\'\\')
                or (parts.port is not None and not 1 <= parts.port <= 65535)):
            return ""
    except ValueError:
        return ""
    return '<p><a href="' + html.escape(url, quote=True) + '" target="_blank" rel="noopener noreferrer">참고 자료 열기</a></p>'


def build_packet(manifest, seed):
    rng = random.Random(seed)
    ratings = {"human_preference": "pending", "cases": []}
    key = {"seed": seed, "cases": []}
    page = ['<!doctype html><html lang="ko"><meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            "<title>익명 글 검토</title><style>",
            "body{max-width:960px;margin:2rem auto;padding:0 1rem;font-family:sans-serif}",
            "pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;tab-size:4}",
            "article{border:1px solid #aaa;padding:1rem;margin:1rem 0}h3{overflow-wrap:anywhere}",
            "label{display:block;margin-top:1rem}select,textarea,button,input{font:inherit}",
            "select,textarea{box-sizing:border-box;width:100%;padding:.5rem}textarea{min-height:5rem}",
            "button{padding:.6rem 1rem}fieldset{border:0;padding:0;min-width:0}nav a{display:inline-block;margin:.4rem}",
            "small{display:block;overflow-wrap:anywhere;color:#555}section{margin:2rem 0}",
            "</style><body><h1>" + html.escape(manifest["title"]) + "</h1>",
            "<p>같은 요청에 대한 글을 비교해 주세요. 아래 글은 원문 그대로 표시됩니다.</p>",
            "<p>표시 정보만 익명화됩니다. 본문이나 요청에 포함된 작성자·모델 단서는 제거되지 않습니다.</p>",
            "<p>사례마다 글 1·2·3 등을 비교하고 선호하는 글, 동률 또는 판단 불가를 선택하세요. "
            "글 번호는 각 사례 안에서만 유효하며, 다른 사례의 같은 번호와 작성자가 같다는 뜻이 아닙니다.</p>",
            "<p>말투 일치도는 1~5점입니다. 1은 매우 낮음, 5는 매우 높음입니다. 판단할 수 없으면 점수는 비워 두세요. "
            "의미 오류, 과도한 모방, 종합 의견은 선택 입력입니다.</p>",
            "<p>입력은 이 브라우저에만 자동 저장됩니다. 파일 이동·브라우저 변경·저장 차단 시 복원되지 않을 수 있습니다. "
            "제출하거나 창을 닫기 전에 <strong>ratings.json 내려받기</strong>로 백업하세요. "
            "다운로드는 원본 파일을 수정하지 않습니다. 백업 파일을 불러와 이어서 평가할 수 있습니다.</p>",
            "<p>검토자에게는 review.html과 ratings.json만 전달하세요. private 폴더는 공유하지 마세요.</p>",
            '<noscript><p>JavaScript가 꺼져 평가 폼을 사용할 수 없습니다. 별도 ratings.json을 텍스트 편집기로 '
            '편집하세요. preferred_sample은 sample ID, tie 또는 cannot_judge, 미평가는 null입니다.</p></noscript>',
            '<button type="button" id="export-ratings" disabled>ratings.json 내려받기</button>',
            '<label for="import-ratings">평가 JSON 불러오기 (현재 입력 교체)</label>'
            '<input type="file" id="import-ratings" accept=".json,application/json" disabled>',
            '<p id="save-status" role="status" aria-live="polite">평가 폼 준비 중</p>',
            '<p id="review-progress"></p>',
            '<nav aria-label="사례 바로가기">' + ' '.join(
                f'<a href="#review-case-{i}">사례 {i + 1}</a>' for i in range(len(manifest["cases"]))) + '</nav>']
    if "reference_url" in manifest:
        page.append("<h2>참고 자료</h2>" + reference_link(manifest["reference_url"]) + pre(manifest["reference_url"]))
    page.append('<form id="ratings-form" autocomplete="off"><fieldset id="rating-fields" disabled><legend>익명 글 평가</legend>')
    used_ids = set()
    for case_index, case in enumerate(manifest["cases"]):
        public_case = {"case_id": case["id"], "preferred_sample": None, "notes": "", "samples": []}
        private_case = {"case_id": case["id"], "samples": []}
        page.append(f'<section id="review-case-{case_index}"><h2>사례 {case_index + 1}: ' + html.escape(case["title"]) + "</h2>")
        page.append("<p>평가 항목: " + html.escape(case["id"]) + "</p><h3>요청</h3>" + pre(case["brief"]))
        # Canonicalize before shuffling so input order cannot encode presentation
        # order or IDs. Generate opaque IDs AFTER shuffling, never from variants.
        samples = sorted(case["outputs"], key=lambda sample: sample["variant"])
        rng.shuffle(samples)
        for sample_index, sample in enumerate(samples):
            sample_id = f"sample-{rng.getrandbits(128):032x}"
            while sample_id in used_ids:
                sample_id = f"sample-{rng.getrandbits(128):032x}"
            used_ids.add(sample_id)
            public_case["samples"].append({"sample_id": sample_id, "voice_match": None,
                                           "meaning_errors": "", "over_imitation": ""})
            private_case["samples"].append({"sample_id": sample_id, "variant": sample["variant"],
                                            "path": sample["path"]})
            page.append(f'<article><h3>글 {sample_index + 1}</h3><small>평가 ID: {sample_id}</small>' + pre(sample["text"]))
            page.append(f'<label for="{sample_id}-voice_match">글 {sample_index + 1} 말투 일치도 (1~5)</label>'
                        f'<select id="{sample_id}-voice_match"><option value="">미평가 / 판단 불가</option>' +
                        ''.join(f'<option value="{score}">{score}</option>' for score in range(1, 6)) + '</select>')
            for field, label in (("meaning_errors", "의미 오류"), ("over_imitation", "과도한 모방")):
                page.append(f'<label for="{sample_id}-{field}">글 {sample_index + 1} {label} (선택)</label>'
                            f'<textarea id="{sample_id}-{field}" rows="2"></textarea>')
            page.append("</article>")
        page.append(f'<label for="case-{case_index}-preference">사례 {case_index + 1} 선호하는 글</label>'
                    f'<select id="case-{case_index}-preference"><option value="">미평가</option>' +
                    ''.join(f'<option value="{s["sample_id"]}">글 {i + 1}</option>' for i, s in enumerate(public_case["samples"])) +
                    '<option value="tie">동률</option><option value="cannot_judge">판단 불가</option></select>')
        page.append(f'<label for="case-{case_index}-notes">사례 {case_index + 1} 종합 의견 (선택)</label>'
                    f'<textarea id="case-{case_index}-notes" rows="3"></textarea>')
        page.append("</section>")
        ratings["cases"].append(public_case)
        key["cases"].append(private_case)
    page.append('<label for="review-complete"><input type="checkbox" id="review-complete" disabled> '
                '평가 완료 (모든 사례의 선호 선택 후 체크)</label></fieldset></form>')
    # Include visible content, not just seeded IDs, to isolate autosaves when a
    # packet is rebuilt with the same seed but different texts or instructions.
    ratings["packet_id"] = hashlib.sha256("\n".join(page).encode("utf-8")).hexdigest()
    embedded = json.dumps(ratings, ensure_ascii=False).replace("<", "\\u003c").replace("&", "\\u0026")
    page.append('<script type="application/json" id="initial-ratings">' + embedded + '</script>')
    page.append('<script id="review-app">' + REVIEW_SCRIPT + '</script></body></html>\n')
    return {"review.html": "\n".join(page),
            "ratings.json": json.dumps(ratings, ensure_ascii=False, indent=2) + "\n",
            "private/key.json": json.dumps(key, ensure_ascii=False, indent=2) + "\n"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="검토용 익명 HTML, 평가 JSON 및 비공개 키를 생성합니다.",
                                     epilog="본문의 식별 단서는 제거하지 않습니다. private/key.json은 공유하지 마세요.")
    parser.add_argument("manifest", metavar="MANIFEST", type=Path, help="UTF-8 JSON manifest")
    parser.add_argument("--output", metavar="NEW_DIR", required=True, type=Path,
                        help="new output directory, never overwritten")
    parser.add_argument("--seed", type=int, help="audit seed (default: randomly generated, stored privately)")
    args = parser.parse_args(argv)
    try:
        if args.output.exists() or args.output.is_symlink():
            raise ValueError("output already exists, refusing to overwrite")
        manifest = load_manifest(args.manifest)
        seed = args.seed if args.seed is not None else secrets.randbits(128)
        packet = build_packet(manifest, seed)
        # Validate and render everything before creating any output artifact.
        args.output.mkdir()
        try:
            (args.output / "private").mkdir(mode=0o700)
            for name, content in packet.items():
                with (args.output / name).open("x", encoding="utf-8", newline="") as stream:
                    stream.write(content)
            (args.output / "private/key.json").chmod(0o600)
        except (OSError, UnicodeError):
            shutil.rmtree(args.output)
            raise
    except (OSError, ValueError, UnicodeError) as exc:
        parser.exit(2, f"error: {exc}\n")
    print("Created review.html and ratings.json. Keep private/key.json private.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
