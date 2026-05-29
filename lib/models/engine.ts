// Operating Models — pure formula engine.
//
// Tokenize → parse → evaluate. Supports scalars and vectors tied to a horizon.
// In a vector formula, bare refs to other vectors on the SAME horizon resolve
// element-wise at the implicit period index `T`; refs to scalars broadcast;
// refs to vectors on a DIFFERENT horizon must be indexed explicitly (e.g.
// `monthly[T*12]`) or aggregated via SUM/AT/SLICE.
//
// Built-ins:
//   SUM(a, b, ...) | SUM(vec) | SUM(vec, start, len)
//   MAX/MIN(a, b, ...) | MAX(vec) | MIN(vec)
//   ROUND(x, decimals) | ABS(x)
//   IF(cond, then, else)
//   IFERROR(expr, fallback)
//   AT(vec, i)               — element access (1-based or 0-based? we use 0-based)
//   SLICE(vec, start, len)
//   NPV(rate, vec)           — sum of v[i] / (1+rate)^(i+1)
//   T                        — current period index in a vector formula

import type {
  ComputeResult,
  Horizon,
  InstanceInputs,
  ModelNode,
  ModelTemplate,
  NodeShape,
  NodeValue,
} from "./types";

// ─── Tokenizer ───────────────────────────────────────────────────────────────

type TokKind =
  | "num"
  | "ident"
  | "str"
  | "op"
  | "lparen"
  | "rparen"
  | "lbrack"
  | "rbrack"
  | "comma"
  | "colon"
  | "eof";

type Token = { kind: TokKind; value: string; pos: number };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const len = src.length;
  while (i < len) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c >= "0" && c <= "9") {
      const start = i;
      while (i < len && ((src[i] >= "0" && src[i] <= "9") || src[i] === ".")) i++;
      out.push({ kind: "num", value: src.slice(start, i), pos: start });
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      const start = i;
      while (i < len && ((src[i] >= "a" && src[i] <= "z") || (src[i] >= "A" && src[i] <= "Z") || (src[i] >= "0" && src[i] <= "9") || src[i] === "_" || src[i] === ".")) i++;
      out.push({ kind: "ident", value: src.slice(start, i), pos: start });
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c; const start = i; i++;
      while (i < len && src[i] !== quote) i++;
      if (i >= len) throw new ParseError(`unterminated string at ${start}`);
      out.push({ kind: "str", value: src.slice(start + 1, i), pos: start });
      i++; continue;
    }
    if (c === "(") { out.push({ kind: "lparen", value: c, pos: i++ }); continue; }
    if (c === ")") { out.push({ kind: "rparen", value: c, pos: i++ }); continue; }
    if (c === "[") { out.push({ kind: "lbrack", value: c, pos: i++ }); continue; }
    if (c === "]") { out.push({ kind: "rbrack", value: c, pos: i++ }); continue; }
    if (c === ",") { out.push({ kind: "comma", value: c, pos: i++ }); continue; }
    if (c === ":") { out.push({ kind: "colon", value: c, pos: i++ }); continue; }
    // Multi-char operators
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "==" || two === "!=" || two === "&&" || two === "||") {
      out.push({ kind: "op", value: two, pos: i }); i += 2; continue;
    }
    if ("+-*/%<>=!^".includes(c)) {
      out.push({ kind: "op", value: c, pos: i++ }); continue;
    }
    throw new ParseError(`unexpected '${c}' at ${i}`);
  }
  out.push({ kind: "eof", value: "", pos: len });
  return out;
}

// ─── AST ─────────────────────────────────────────────────────────────────────

type Expr =
  | { type: "num"; v: number }
  | { type: "str"; v: string }
  | { type: "ref"; name: string }
  | { type: "index"; target: Expr; idx: Expr }
  | { type: "slice"; target: Expr; start: Expr; end: Expr | null } // [s:e] or [s:]
  | { type: "call"; name: string; args: Expr[] }
  | { type: "unop"; op: string; rhs: Expr }
  | { type: "binop"; op: string; lhs: Expr; rhs: Expr };

class ParseError extends Error {}
class EvalError extends Error {}

// ─── Parser (Pratt) ──────────────────────────────────────────────────────────

const BINOP_PREC: Record<string, number> = {
  "||": 1, "&&": 2,
  "==": 3, "!=": 3, "<": 3, "<=": 3, ">": 3, ">=": 3,
  "+": 4, "-": 4,
  "*": 5, "/": 5, "%": 5,
  "^": 6, // right-assoc; handled in parser
};

function parse(src: string): Expr {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const eat = () => toks[pos++];
  const expect = (k: TokKind, val?: string) => {
    const t = eat();
    if (t.kind !== k || (val !== undefined && t.value !== val)) {
      throw new ParseError(`expected ${val ?? k}, got '${t.value}' (${t.kind}) at ${t.pos}`);
    }
    return t;
  };

  function parsePrimary(): Expr {
    const t = peek();
    if (t.kind === "num") { eat(); return { type: "num", v: Number(t.value) }; }
    if (t.kind === "str") { eat(); return { type: "str", v: t.value }; }
    if (t.kind === "op" && (t.value === "-" || t.value === "+" || t.value === "!")) {
      eat(); const rhs = parseUnary(); return { type: "unop", op: t.value, rhs };
    }
    if (t.kind === "lparen") {
      eat(); const e = parseExpr(0); expect("rparen"); return e;
    }
    if (t.kind === "ident") {
      eat();
      if (peek().kind === "lparen") {
        eat();
        const args: Expr[] = [];
        if (peek().kind !== "rparen") {
          args.push(parseExpr(0));
          while (peek().kind === "comma") { eat(); args.push(parseExpr(0)); }
        }
        expect("rparen");
        return { type: "call", name: t.value, args };
      }
      return { type: "ref", name: t.value };
    }
    throw new ParseError(`unexpected '${t.value}' at ${t.pos}`);
  }

  function parsePostfix(e: Expr): Expr {
    while (peek().kind === "lbrack") {
      eat();
      const start = parseExpr(0);
      if (peek().kind === "colon") {
        eat();
        const end = peek().kind === "rbrack" ? null : parseExpr(0);
        expect("rbrack");
        e = { type: "slice", target: e, start, end };
      } else {
        expect("rbrack");
        e = { type: "index", target: e, idx: start };
      }
    }
    return e;
  }

  function parseUnary(): Expr {
    return parsePostfix(parsePrimary());
  }

  function parseExpr(minPrec: number): Expr {
    let lhs = parseUnary();
    while (true) {
      const t = peek();
      if (t.kind !== "op") break;
      const prec = BINOP_PREC[t.value];
      if (prec === undefined || prec < minPrec) break;
      eat();
      const rightAssoc = t.value === "^";
      const rhs = parseExpr(rightAssoc ? prec : prec + 1);
      lhs = { type: "binop", op: t.value, lhs, rhs };
    }
    return lhs;
  }

  const e = parseExpr(0);
  if (peek().kind !== "eof") throw new ParseError(`trailing tokens at ${peek().pos}`);
  return e;
}

// ─── Topological sort + cycle detection ──────────────────────────────────────

/** Returns refs (other node keys) used in `formula`. */
export function refsInFormula(formula: string): string[] {
  const refs = new Set<string>();
  let expr: Expr;
  try { expr = parse(formula); } catch { return []; }
  const walk = (e: Expr) => {
    switch (e.type) {
      case "ref":
        if (e.name !== "T" && e.name !== "true" && e.name !== "false") refs.add(e.name);
        break;
      case "index": walk(e.target); walk(e.idx); break;
      case "slice": walk(e.target); walk(e.start); if (e.end) walk(e.end); break;
      case "call": e.args.forEach(walk); break;
      case "unop": walk(e.rhs); break;
      case "binop": walk(e.lhs); walk(e.rhs); break;
    }
  };
  walk(expr);
  return [...refs];
}

export type ValidationError = { nodeKey: string; message: string };

/**
 * Validates a template: parseable formulas, refs resolve, no cycles, horizons
 * exist. Returns errors; empty array = valid.
 */
export function validateTemplate(t: ModelTemplate): ValidationError[] {
  const errs: ValidationError[] = [];
  const byKey = new Map(t.nodes.map(n => [n.key, n] as const));
  const horizonKeys = new Set(t.horizons.map(h => h.key));

  for (const n of t.nodes) {
    if (n.shape.kind === "vector" && !horizonKeys.has(n.shape.horizon)) {
      errs.push({ nodeKey: n.key, message: `unknown horizon '${n.shape.horizon}'` });
    }
    if (n.kind === "formula") {
      if (!n.formula) { errs.push({ nodeKey: n.key, message: "formula node has no formula" }); continue; }
      try {
        const refs = refsInFormula(n.formula);
        for (const r of refs) {
          if (!byKey.has(r)) errs.push({ nodeKey: n.key, message: `unknown ref '${r}'` });
        }
      } catch (e) {
        errs.push({ nodeKey: n.key, message: `parse error: ${(e as Error).message}` });
      }
    }
  }

  // Cycle check via DFS with three-color marking.
  const color = new Map<string, 0 | 1 | 2>(); // 0=white, 1=gray, 2=black
  const stack: string[] = [];
  const dfs = (key: string): boolean => {
    const c = color.get(key) ?? 0;
    if (c === 2) return true;
    if (c === 1) {
      const cycle = [...stack.slice(stack.indexOf(key)), key].join(" → ");
      errs.push({ nodeKey: key, message: `cycle: ${cycle}` });
      return false;
    }
    color.set(key, 1); stack.push(key);
    const n = byKey.get(key);
    if (n?.kind === "formula" && n.formula) {
      for (const dep of refsInFormula(n.formula)) {
        if (byKey.has(dep)) if (!dfs(dep)) { stack.pop(); color.set(key, 2); return false; }
      }
    }
    stack.pop(); color.set(key, 2);
    return true;
  };
  for (const n of t.nodes) if ((color.get(n.key) ?? 0) === 0) dfs(n.key);

  return errs;
}

/** Returns node keys in evaluation order. Throws on cycle. */
export function topoOrder(t: ModelTemplate): string[] {
  const byKey = new Map(t.nodes.map(n => [n.key, n] as const));
  const order: string[] = [];
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const dfs = (key: string) => {
    const c = color.get(key) ?? 0;
    if (c === 2) return;
    if (c === 1) throw new EvalError(`cycle through ${[...stack, key].join(" → ")}`);
    color.set(key, 1); stack.push(key);
    const n = byKey.get(key);
    if (n?.kind === "formula" && n.formula) {
      for (const dep of refsInFormula(n.formula)) {
        if (byKey.has(dep)) dfs(dep);
      }
    }
    stack.pop(); color.set(key, 2);
    order.push(key);
  };
  for (const n of t.nodes) dfs(n.key);
  return order;
}

// ─── Evaluator ───────────────────────────────────────────────────────────────

type Ctx = {
  template: ModelTemplate;
  byKey: Map<string, ModelNode>;
  horizonByKey: Map<string, Horizon>;
  /** Already-computed node values. */
  values: Record<string, NodeValue>;
  /** When evaluating a vector formula, the horizon being walked. */
  currentHorizon?: string;
  /** When evaluating a vector formula at period i, T = i. Otherwise undefined. */
  t?: number;
};

function asNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (Array.isArray(v)) throw new EvalError("expected scalar, got vector");
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isNaN(n)) throw new EvalError(`cannot coerce '${v}' to number`);
    return n;
  }
  throw new EvalError(`cannot coerce ${typeof v} to number`);
}

function asArray(v: unknown): number[] {
  if (Array.isArray(v)) return v;
  throw new EvalError("expected array");
}

function evalExpr(e: Expr, ctx: Ctx): NodeValue {
  switch (e.type) {
    case "num": return e.v;
    case "str": return e.v;
    case "ref": return resolveRef(e.name, ctx);
    case "unop": {
      const r = evalExpr(e.rhs, ctx);
      if (e.op === "-") return -asNumber(r);
      if (e.op === "+") return asNumber(r);
      if (e.op === "!") return !asNumber(r);
      throw new EvalError(`unknown unop ${e.op}`);
    }
    case "binop": return evalBinop(e.op, evalExpr(e.lhs, ctx), evalExpr(e.rhs, ctx));
    case "index": {
      const arr = asArray(evalExpr(e.target, ctx));
      const i = Math.trunc(asNumber(evalExpr(e.idx, ctx)));
      if (i < 0 || i >= arr.length) throw new EvalError(`index ${i} out of bounds (len ${arr.length})`);
      return arr[i];
    }
    case "slice": {
      const arr = asArray(evalExpr(e.target, ctx));
      const s = Math.trunc(asNumber(evalExpr(e.start, ctx)));
      const eIdx = e.end ? Math.trunc(asNumber(evalExpr(e.end, ctx))) : arr.length;
      return arr.slice(s, eIdx);
    }
    case "call": return callBuiltin(e.name, e.args, ctx);
  }
}

function evalBinop(op: string, lhs: NodeValue, rhs: NodeValue): NodeValue {
  switch (op) {
    case "+": return asNumber(lhs) + asNumber(rhs);
    case "-": return asNumber(lhs) - asNumber(rhs);
    case "*": return asNumber(lhs) * asNumber(rhs);
    case "/": {
      const d = asNumber(rhs);
      if (d === 0) throw new EvalError("division by zero");
      return asNumber(lhs) / d;
    }
    case "%": return asNumber(lhs) % asNumber(rhs);
    case "^": return Math.pow(asNumber(lhs), asNumber(rhs));
    case "==": return asNumber(lhs) === asNumber(rhs);
    case "!=": return asNumber(lhs) !== asNumber(rhs);
    case "<": return asNumber(lhs) < asNumber(rhs);
    case "<=": return asNumber(lhs) <= asNumber(rhs);
    case ">": return asNumber(lhs) > asNumber(rhs);
    case ">=": return asNumber(lhs) >= asNumber(rhs);
    case "&&": return Boolean(asNumber(lhs)) && Boolean(asNumber(rhs));
    case "||": return Boolean(asNumber(lhs)) || Boolean(asNumber(rhs));
  }
  throw new EvalError(`unknown binop ${op}`);
}

function resolveRef(name: string, ctx: Ctx): NodeValue {
  if (name === "T") {
    if (ctx.t === undefined) throw new EvalError("T only valid inside a vector formula");
    return ctx.t;
  }
  if (name === "true") return true;
  if (name === "false") return false;
  const node = ctx.byKey.get(name);
  if (!node) throw new EvalError(`unknown ref '${name}'`);
  if (!(name in ctx.values)) throw new EvalError(`'${name}' has no value yet (topo bug?)`);
  const v = ctx.values[name];

  // In a vector context, a same-horizon vector resolves to its element at T.
  if (Array.isArray(v) && ctx.currentHorizon && node.shape.kind === "vector" && node.shape.horizon === ctx.currentHorizon) {
    return v[ctx.t!];
  }
  return v;
}

function callBuiltin(name: string, args: Expr[], ctx: Ctx): NodeValue {
  const upper = name.toUpperCase();
  switch (upper) {
    case "SUM": {
      // SUM(vec) | SUM(vec, start, len) | SUM(a, b, c, ...)
      if (args.length === 1) {
        const v = evalExpr(args[0], ctx);
        if (Array.isArray(v)) return v.reduce((a, b) => a + b, 0);
        return asNumber(v);
      }
      if (args.length === 3) {
        const first = evalExpr(args[0], ctx);
        if (Array.isArray(first)) {
          const start = Math.trunc(asNumber(evalExpr(args[1], ctx)));
          const len = Math.trunc(asNumber(evalExpr(args[2], ctx)));
          return first.slice(start, start + len).reduce((a, b) => a + b, 0);
        }
      }
      let total = 0;
      for (const a of args) {
        const v = evalExpr(a, ctx);
        if (Array.isArray(v)) total += v.reduce((s, x) => s + x, 0);
        else total += asNumber(v);
      }
      return total;
    }
    case "MAX":
    case "MIN": {
      const vals: number[] = [];
      for (const a of args) {
        const v = evalExpr(a, ctx);
        if (Array.isArray(v)) vals.push(...v);
        else vals.push(asNumber(v));
      }
      if (vals.length === 0) throw new EvalError(`${upper} needs at least one value`);
      return upper === "MAX" ? Math.max(...vals) : Math.min(...vals);
    }
    case "ABS": return Math.abs(asNumber(evalExpr(args[0], ctx)));
    case "ROUND": {
      const x = asNumber(evalExpr(args[0], ctx));
      const d = args[1] ? Math.trunc(asNumber(evalExpr(args[1], ctx))) : 0;
      const m = Math.pow(10, d);
      return Math.round(x * m) / m;
    }
    case "IF": {
      const cond = asNumber(evalExpr(args[0], ctx));
      return cond ? evalExpr(args[1], ctx) : evalExpr(args[2], ctx);
    }
    case "IFERROR": {
      try { return evalExpr(args[0], ctx); } catch { return evalExpr(args[1], ctx); }
    }
    case "AT": {
      const arr = asArray(evalExpr(args[0], ctx));
      const i = Math.trunc(asNumber(evalExpr(args[1], ctx)));
      if (i < 0 || i >= arr.length) throw new EvalError(`AT index ${i} out of bounds`);
      return arr[i];
    }
    case "SLICE": {
      const arr = asArray(evalExpr(args[0], ctx));
      const s = Math.trunc(asNumber(evalExpr(args[1], ctx)));
      const len = Math.trunc(asNumber(evalExpr(args[2], ctx)));
      return arr.slice(s, s + len);
    }
    case "NPV": {
      const rate = asNumber(evalExpr(args[0], ctx));
      const vec = asArray(evalExpr(args[1], ctx));
      let total = 0;
      for (let i = 0; i < vec.length; i++) total += vec[i] / Math.pow(1 + rate, i + 1);
      return total;
    }
  }
  throw new EvalError(`unknown function ${name}`);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compute every node in a template, given a sparse set of input overrides.
 * Returns final values and per-node errors. Never throws on bad formulas — the
 * error is recorded against the node and downstream dependents fail with a
 * propagated message.
 */
export function compute(template: ModelTemplate, inputs: InstanceInputs): ComputeResult {
  const byKey = new Map(template.nodes.map(n => [n.key, n] as const));
  const horizonByKey = new Map(template.horizons.map(h => [h.key, h] as const));
  const values: Record<string, NodeValue> = {};
  const errors: Record<string, string> = {};

  let order: string[];
  try { order = topoOrder(template); } catch (e) {
    // Total bust — return everything errored.
    const msg = (e as Error).message;
    for (const n of template.nodes) errors[n.key] = msg;
    return { values, errors };
  }

  for (const key of order) {
    const node = byKey.get(key)!;
    try {
      values[key] = computeNode(node, { template, byKey, horizonByKey, values }, inputs);
    } catch (e) {
      errors[key] = (e as Error).message;
    }
  }
  return { values, errors };
}

function computeNode(node: ModelNode, ctx: Ctx, inputs: InstanceInputs): NodeValue {
  // Inputs/constants: use override → default.
  if (node.kind === "input" || node.kind === "constant") {
    const override = inputs[node.key];
    const raw = override !== undefined ? override : node.default;
    return materializeStatic(node, raw, ctx);
  }

  // Formula nodes.
  if (!node.formula) throw new EvalError("formula node missing formula");
  const expr = parse(node.formula);

  if (node.shape.kind === "scalar") {
    return evalExpr(expr, ctx);
  }

  // Vector: evaluate per period with T set.
  const horizon = ctx.horizonByKey.get(node.shape.horizon);
  if (!horizon) throw new EvalError(`unknown horizon '${node.shape.horizon}'`);
  const out: number[] = [];
  for (let t = 0; t < horizon.length; t++) {
    const v = evalExpr(expr, { ...ctx, currentHorizon: node.shape.horizon, t });
    out.push(asNumber(v));
  }
  return out;
}

function materializeStatic(node: ModelNode, raw: NodeValue | undefined, ctx: Ctx): NodeValue {
  if (raw === undefined || raw === null) {
    // Sensible zero default by shape.
    return shapeZero(node.shape, ctx);
  }
  if (node.shape.kind === "scalar") {
    if (Array.isArray(raw)) throw new EvalError(`'${node.key}' is scalar but default is array`);
    return raw;
  }
  // Vector node: broadcast scalar to full length, or use array as-is (truncated/padded).
  const horizon = ctx.horizonByKey.get(node.shape.horizon);
  if (!horizon) throw new EvalError(`unknown horizon '${node.shape.horizon}'`);
  if (Array.isArray(raw)) {
    if (raw.length === horizon.length) return raw;
    // Pad with last value or truncate.
    if (raw.length === 0) return Array(horizon.length).fill(0);
    const out = raw.slice(0, horizon.length);
    while (out.length < horizon.length) out.push(raw[raw.length - 1]);
    return out;
  }
  const n = typeof raw === "boolean" ? (raw ? 1 : 0) : asNumber(raw);
  return Array(horizon.length).fill(n);
}

function shapeZero(shape: NodeShape, ctx: Ctx): NodeValue {
  if (shape.kind === "scalar") return 0;
  const horizon = ctx.horizonByKey.get(shape.horizon);
  if (!horizon) return 0;
  return Array(horizon.length).fill(0);
}

/**
 * Run the engine `xValues.length * yValues.length` times, varying two input
 * nodes across the grid, and pull a single scalar value from `resultNode` at
 * each cell. Used by sensitivity output kind.
 *
 * If resultNode is a vector, pick `resultIndex` (defaults to 0).
 */
export function computeSensitivity(
  template: ModelTemplate,
  baseInputs: InstanceInputs,
  config: {
    xNode: string; xValues: number[];
    yNode: string; yValues: number[];
    resultNode: string; resultIndex?: number;
  },
): { grid: (number | null)[][]; min: number; max: number } {
  const grid: (number | null)[][] = [];
  let min = Infinity, max = -Infinity;
  for (let yi = 0; yi < config.yValues.length; yi++) {
    const row: (number | null)[] = [];
    for (let xi = 0; xi < config.xValues.length; xi++) {
      const overrides: InstanceInputs = { ...baseInputs, [config.xNode]: config.xValues[xi], [config.yNode]: config.yValues[yi] };
      const r = compute(template, overrides);
      const v = r.values[config.resultNode];
      let scalar: number | null = null;
      if (typeof v === "number") scalar = v;
      else if (Array.isArray(v)) scalar = v[config.resultIndex ?? 0] ?? null;
      if (scalar !== null && Number.isFinite(scalar)) {
        if (scalar < min) min = scalar;
        if (scalar > max) max = scalar;
      }
      row.push(scalar);
    }
    grid.push(row);
  }
  return { grid, min: Number.isFinite(min) ? min : 0, max: Number.isFinite(max) ? max : 0 };
}

// Re-export for tests.
export { parse as _parseForTests, tokenize as _tokenizeForTests, ParseError, EvalError };
