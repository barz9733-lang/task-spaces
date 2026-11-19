import assert from "node:assert/strict";
import { test } from "node:test";
import { needsConfirmation, opChangedAnything, opCount, type Operation } from "../src/lib/agent/tools";
import { ApiError, isUUID, parseSpace, parseTask } from "../src/lib/validate";

const SPACE = "9785bdb5-0fe9-4d20-8fa2-a50773c5e00e";
const add = (n: number): Operation => ({
  kind: "add",
  items: Array.from({ length: n }, (_, i) => ({ space_id: SPACE, title: `t${i}` })),
  titles: [],
  summary: "",
});
const update = (n: number): Operation => ({
  kind: "update",
  updates: Array.from({ length: n }, (_, i) => ({ id: String(i), title: `t${i}`, patch: { status: "done" } })),
  titles: [],
  summary: "",
});
const del = (n: number): Operation => ({ kind: "delete", ids: Array.from({ length: n }, (_, i) => String(i)), titles: [], summary: "" });

test("agent: every deletion needs the user's approval, even of a single task", () => {
  assert.equal(needsConfirmation(del(1)), true);
  assert.equal(needsConfirmation(del(10)), true);
});

test("agent: adding or updating up to 3 tasks runs directly, more than 3 asks first", () => {
  for (const make of [add, update]) {
    assert.equal(needsConfirmation(make(1)), false);
    assert.equal(needsConfirmation(make(3)), false);
    assert.equal(needsConfirmation(make(4)), true);
    assert.equal(opCount(make(7)), 7);
  }
});

test("agent: an operation that touches nothing never asks", () => {
  assert.equal(needsConfirmation(del(0)), false);
  assert.equal(needsConfirmation(update(0)), false);
});

test("agent: opChangedAnything reads the tool result", () => {
  assert.equal(opChangedAnything({ ok: true, updated: 2 }), true);
  assert.equal(opChangedAnything({ ok: true, deleted: 1 }), true);
  assert.equal(opChangedAnything({ ok: true, updated: 0 }), false);
  assert.equal(opChangedAnything({ error: "x" }), false);
});

test("parseTask: a new task needs a title and a valid space", () => {
  assert.throws(() => parseTask({ space_id: SPACE }, false), ApiError);
  assert.throws(() => parseTask({ title: "  ", space_id: SPACE }, false), ApiError);
  assert.throws(() => parseTask({ title: "x", space_id: "nope" }, false), ApiError);
  assert.deepEqual(parseTask({ title: "  לקנות חלב ", space_id: SPACE }, false), { title: "לקנות חלב", space_id: SPACE });
});

test("parseTask: partial updates keep only the fields that were sent", () => {
  assert.deepEqual(parseTask({ status: "done" }, true), { status: "done" });
  assert.deepEqual(parseTask({ due_date: "" }, true), { due_date: null });
  assert.deepEqual(parseTask({ recurrence: null }, true), { recurrence: null });
  assert.throws(() => parseTask({ status: "finished" }, true), ApiError);
  assert.throws(() => parseTask({ priority: "critical" }, true), ApiError);
  assert.throws(() => parseTask({ due_date: "2026-02-30" }, true), ApiError);
  assert.throws(() => parseTask({ recurrence: "hourly" }, true), ApiError);
});

test("parseTask: subtasks are trimmed, get ids, and empty ones are rejected", () => {
  const out = parseTask({ subtasks: [{ text: " שלב א ", done: true }, { id: "k1", text: "שלב ב" }] }, true);
  assert.equal(out.subtasks?.length, 2);
  assert.equal(out.subtasks?.[0].text, "שלב א");
  assert.equal(out.subtasks?.[0].done, true);
  assert.ok(out.subtasks?.[0].id);
  assert.deepEqual(out.subtasks?.[1], { id: "k1", text: "שלב ב", done: false });
  assert.throws(() => parseTask({ subtasks: [{ text: "   " }] }, true), ApiError);
  assert.throws(() => parseTask({ subtasks: Array.from({ length: 51 }, () => ({ text: "x" })) }, true), ApiError);
});

test("parseSpace and isUUID", () => {
  assert.deepEqual(parseSpace({ name: " בית ", color: "#10b981", view: "todo" }, false), { name: "בית", color: "#10b981", view: "todo" });
  assert.throws(() => parseSpace({ name: "בית", color: "green", view: "todo" }, false), ApiError);
  assert.throws(() => parseSpace({ name: "בית", color: "#10b981", view: "table" }, false), ApiError);
  assert.equal(isUUID(SPACE), true);
  assert.equal(isUUID("123"), false);
});
