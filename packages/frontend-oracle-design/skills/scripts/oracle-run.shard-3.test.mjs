// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { oracleRunCases } from './oracle-run.cases.mjs'

for (const args of oracleRunCases(3, 4)) test(...args)
