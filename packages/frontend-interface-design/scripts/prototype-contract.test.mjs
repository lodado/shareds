import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'reference-driven-figma-design');
const read = (file) => readFile(join(root, file), 'utf8');

test('interactive design requires scoped prototype creation and reaction readback', async () => {
  const skill = await read('SKILL.md');
  const workflow = await read('references/prototype-workflow.md');
  assert.match(skill, /Prototype the approved flow/);
  assert.match(skill, /Preserve existing connections/);
  assert.match(workflow, /Readback gate/);
  assert.match(workflow, /success.*error.*recovery/i);
  assert.match(workflow, /cancel\/back/);
  assert.match(workflow, /unverified/);
});

test('static-only work and independent diagram invocation remain explicit boundaries', async () => {
  const workflow = await read('references/prototype-workflow.md');
  assert.match(workflow, /static-only.*small visual edits.*static/i);
  assert.match(workflow, /explicit `ux-flow-diagram`/);
  assert.match(workflow, /never silently converted/);
  assert.match(workflow, /backend.*usability testing.*separate/i);
});

test('prototype evaluation cases validate required shape and forbidden behavior', async () => {
  const cases = JSON.parse(await readFile(join(root, 'evals', 'prototype-cases.json'), 'utf8'));
  assert.equal(cases.schema_version, '1.0');
  assert.ok(cases.cases.length >= 5);
  for (const item of cases.cases) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.equal(typeof item.prompt, 'string');
    assert.ok(item.expected_invariants.length >= 2);
    assert.ok(item.forbidden.length >= 1);
  }
  assert.ok(cases.cases.some((item) => item.id === 'static-only-no-prototype'));
  assert.ok(cases.cases.some((item) => item.id === 'preserve-existing-reactions'));
});
