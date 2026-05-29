// Run with: npx tsx --test lib/models/engine.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compute,
  refsInFormula,
  topoOrder,
  validateTemplate,
  _parseForTests as parse,
  _tokenizeForTests as tokenize,
} from "./engine";
import type { ModelTemplate } from "./types";

// ── tokenizer/parser ────────────────────────────────────────────────────────

test("tokenize: numbers, idents, ops, parens, brackets", () => {
  const ts = tokenize("revenue * 0.05 + SUM(opex, 0, 12)");
  assert.equal(ts.map(t => t.kind).join(","), "ident,op,num,op,ident,lparen,ident,comma,num,comma,num,rparen,eof");
});

test("parse: precedence + parens", () => {
  const e = parse("1 + 2 * 3");
  assert.deepEqual(e, {
    type: "binop", op: "+",
    lhs: { type: "num", v: 1 },
    rhs: { type: "binop", op: "*", lhs: { type: "num", v: 2 }, rhs: { type: "num", v: 3 } },
  });
});

test("parse: unary minus", () => {
  const e = parse("-x + 1");
  assert.equal(e.type, "binop");
});

test("parse: indexing + slicing", () => {
  const e = parse("vec[T] + SUM(vec[0:12])");
  assert.equal(e.type, "binop");
});

test("parse: nested function calls", () => {
  const e = parse("IF(x > 0, MAX(a, b), MIN(a, b))");
  assert.equal(e.type, "call");
});

// ── refs + validation ───────────────────────────────────────────────────────

test("refsInFormula: skips T and literals", () => {
  const r = refsInFormula("a + b[T] + 5");
  assert.deepEqual(r.sort(), ["a", "b"]);
});

test("validateTemplate: catches unknown ref", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "a", label: "A", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 1 },
      { key: "b", label: "B", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "a + missing" },
    ],
  };
  const errs = validateTemplate(t);
  assert.ok(errs.some(e => e.message.includes("unknown ref 'missing'")));
});

test("validateTemplate: catches cycle", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "a", label: "A", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "b + 1" },
      { key: "b", label: "B", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "a * 2" },
    ],
  };
  const errs = validateTemplate(t);
  assert.ok(errs.some(e => e.message.startsWith("cycle:")));
});

test("topoOrder: input before formula", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "z", label: "Z", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "x + y" },
      { key: "x", label: "X", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 2 },
      { key: "y", label: "Y", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 3 },
    ],
  };
  const order = topoOrder(t);
  assert.ok(order.indexOf("x") < order.indexOf("z"));
  assert.ok(order.indexOf("y") < order.indexOf("z"));
});

// ── scalar evaluation ──────────────────────────────────────────────────────

test("compute: simple scalar chain with override", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "hh", label: "HH", kind: "input", dataType: "int", shape: { kind: "scalar" }, default: 500 },
      { key: "persons", label: "Persons", kind: "input", dataType: "int", shape: { kind: "scalar" }, default: 5 },
      { key: "lpd", label: "L/p/d", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 4 },
      { key: "demand", label: "Demand", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "hh * persons * lpd" },
    ],
  };
  const { values, errors } = compute(t, {});
  assert.deepEqual(errors, {});
  assert.equal(values.demand, 10000);

  const r2 = compute(t, { hh: 800 });
  assert.equal(r2.values.demand, 16000);
});

test("compute: IFERROR catches divide by zero", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "a", label: "A", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 10 },
      { key: "b", label: "B", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 0 },
      { key: "r", label: "R", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "IFERROR(a / b, -1)" },
    ],
  };
  const { values, errors } = compute(t, {});
  assert.deepEqual(errors, {});
  assert.equal(values.r, -1);
});

test("compute: division by zero (no IFERROR) records error", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "a", label: "A", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 10 },
      { key: "b", label: "B", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 0 },
      { key: "r", label: "R", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "a / b" },
    ],
  };
  const { errors } = compute(t, {});
  assert.ok(errors.r);
});

// ── vector evaluation ──────────────────────────────────────────────────────

test("compute: vector with implicit T and scalar broadcast", () => {
  const t: ModelTemplate = {
    key: "t", name: "t",
    horizons: [{ key: "monthly", length: 12 }],
    groups: [], outputs: [],
    nodes: [
      { key: "price", label: "Price", kind: "input", dataType: "currency", shape: { kind: "scalar" }, default: 2 },
      // Linear ramp: t=0 → 100, t=1 → 110, ... t=11 → 210
      { key: "adopters", label: "Adopters", kind: "formula", dataType: "int", shape: { kind: "vector", horizon: "monthly" }, formula: "100 + T * 10" },
      // Revenue: adopters * price * 30 (days)
      { key: "rev", label: "Rev", kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "monthly" }, formula: "adopters * price * 30" },
      // Total annual: SUM(rev)
      { key: "rev_total", label: "Rev Total", kind: "formula", dataType: "currency", shape: { kind: "scalar" }, formula: "SUM(rev)" },
    ],
  };
  const { values, errors } = compute(t, {});
  assert.deepEqual(errors, {});
  const adopters = values.adopters as number[];
  assert.equal(adopters.length, 12);
  assert.equal(adopters[0], 100);
  assert.equal(adopters[11], 210);
  const rev = values.rev as number[];
  assert.equal(rev[0], 100 * 2 * 30);
  assert.equal(values.rev_total, rev.reduce((s, v) => s + v, 0));
});

test("compute: annual rollup from monthly", () => {
  const t: ModelTemplate = {
    key: "t", name: "t",
    horizons: [{ key: "monthly", length: 24 }, { key: "annual", length: 2 }],
    groups: [], outputs: [],
    nodes: [
      { key: "rev_m", label: "Rev M", kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "monthly" }, formula: "100" },
      { key: "rev_y", label: "Rev Y", kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "annual" }, formula: "SUM(rev_m, T*12, 12)" },
    ],
  };
  const { values, errors } = compute(t, {});
  assert.deepEqual(errors, {});
  assert.deepEqual(values.rev_y, [1200, 1200]);
});

test("compute: NPV", () => {
  const t: ModelTemplate = {
    key: "t", name: "t",
    horizons: [{ key: "annual", length: 5 }],
    groups: [], outputs: [],
    nodes: [
      { key: "cf", label: "CF", kind: "formula", dataType: "currency", shape: { kind: "vector", horizon: "annual" }, formula: "100" },
      { key: "npv", label: "NPV", kind: "formula", dataType: "currency", shape: { kind: "scalar" }, formula: "NPV(0.10, cf)" },
    ],
  };
  const { values, errors } = compute(t, {});
  assert.deepEqual(errors, {});
  // Sum_{i=1..5} 100/1.1^i ≈ 379.0786...
  assert.ok(Math.abs((values.npv as number) - 379.0786769) < 1e-3);
});

test("compute: IF gates on a condition", () => {
  const t: ModelTemplate = {
    key: "t", name: "t", horizons: [], groups: [], outputs: [],
    nodes: [
      { key: "x", label: "X", kind: "input", dataType: "number", shape: { kind: "scalar" }, default: 100 },
      { key: "tier", label: "Tier", kind: "formula", dataType: "number", shape: { kind: "scalar" }, formula: "IF(x > 50, 2, 1)" },
    ],
  };
  assert.equal((compute(t, {}).values.tier as number), 2);
  assert.equal((compute(t, { x: 10 }).values.tier as number), 1);
});
