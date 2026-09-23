# 검증 결과

## 0.1.0 → shareds 편입 (2026-09-23)

Python 검사기(`check_contract.py`, `validate_design.py`, `tests/test_contracts.py`)를 레포 관례에 맞춰
Node `node:test` + Ajv 8로 포팅했다. `register_marketplace.py`는 루트 marketplace에 직접 등록했으므로 삭제했다.

- `node scripts/check-contract.mjs`: PASS
- `node --test scripts/*.test.mjs`: 32 tests PASS (Python 36개 중 등록 도우미 3개 제거, 예제·무결성 2개 병합)
- `node scripts/validate-design.mjs .../merge-garden/delivery.json`: PASS
- `eslint scripts`: PASS
- 유지한 원본 참조 3개: 업스트림 `85d39f7`의 Git blob SHA와 로컬 `git hash-object` 결과 일치를 확인하고 SHA-256을 기록.

## 실행하지 않은 것

Claude/Codex 호스트 로딩, `evals/behavior-cases.json` 24개 행동 시나리오, 실제 Figma 편집, 사람 대상 플레이테스트.
