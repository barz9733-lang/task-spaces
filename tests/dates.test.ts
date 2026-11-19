import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  addMonths,
  diffDays,
  isISODate,
  isOverdue,
  isoToLocalDate,
  monthGrid,
  nextOccurrence,
  relativeLabel,
  todayISO,
  weekStart,
  weekday,
} from "../src/lib/dates";

test("todayISO uses Israel time, not UTC", () => {
  // 22:30 UTC on Nov 16 is already Nov 17 in Israel (winter, UTC+2)
  assert.equal(todayISO(new Date("2026-11-16T22:30:00Z")), "2026-11-17");
  // 20:30 UTC on Jul 1 is still Jul 1 in Israel (summer, UTC+3)
  assert.equal(todayISO(new Date("2026-07-01T20:30:00Z")), "2026-07-01");
  assert.equal(isoToLocalDate("2026-07-01T21:30:00Z"), "2026-07-02");
});

test("isISODate rejects malformed and impossible dates", () => {
  assert.equal(isISODate("2026-02-28"), true);
  assert.equal(isISODate("2026-02-30"), false);
  assert.equal(isISODate("2026-2-3"), false);
  assert.equal(isISODate("tomorrow"), false);
  assert.equal(isISODate(null), false);
});

test("addDays / diffDays cross month, year and leap-day boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(diffDays("2026-11-20", "2026-11-16"), 4);
  assert.equal(diffDays("2026-11-10", "2026-11-16"), -6);
});

test("the week starts on Sunday", () => {
  assert.equal(weekday("2026-11-15"), 0); // Sunday
  assert.equal(weekStart("2026-11-18"), "2026-11-15");
  assert.equal(weekStart("2026-11-15"), "2026-11-15");
  assert.equal(weekStart("2026-11-21"), "2026-11-15"); // Saturday
});

test("monthGrid is 6 full weeks starting on a Sunday and covering the month", () => {
  const g = monthGrid("2026-11-01");
  assert.equal(g.length, 42);
  assert.equal(weekday(g[0]), 0);
  assert.ok(g.includes("2026-11-01") && g.includes("2026-11-30"));
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
});

test("relativeLabel", () => {
  const today = "2026-11-16";
  assert.equal(relativeLabel("2026-11-16", today), "היום");
  assert.equal(relativeLabel("2026-11-17", today), "מחר");
  assert.equal(relativeLabel("2026-11-15", today), "אתמול");
  assert.equal(relativeLabel("2026-11-13", today), "לפני 3 ימים");
});

test("isOverdue ignores completed tasks and tasks without a date", () => {
  const today = "2026-11-16";
  assert.equal(isOverdue("2026-11-15", "new", today), true);
  assert.equal(isOverdue("2026-11-15", "done", today), false);
  assert.equal(isOverdue("2026-11-16", "new", today), false);
  assert.equal(isOverdue(null, "new", today), false);
});

test("nextOccurrence: basic steps", () => {
  const today = "2026-11-16";
  assert.equal(nextOccurrence("2026-11-16", "daily", today), "2026-11-17");
  assert.equal(nextOccurrence("2026-11-16", "weekly", today), "2026-11-23");
  assert.equal(nextOccurrence("2026-11-10", "monthly", today), "2026-12-10");
  assert.equal(nextOccurrence("2026-11-10", "yearly", today), "2027-11-10");
});

test("nextOccurrence: month ends are clamped, and the original day is kept afterwards", () => {
  assert.equal(nextOccurrence("2026-01-31", "monthly", "2026-01-31"), "2026-02-28");
  assert.equal(nextOccurrence("2028-01-31", "monthly", "2028-01-31"), "2028-02-29");
  assert.equal(nextOccurrence("2028-02-29", "yearly", "2028-02-29"), "2029-02-28");
  assert.equal(nextOccurrence("2026-12-15", "monthly", "2026-12-15"), "2027-01-15");
});

test("nextOccurrence: a task completed late never lands in the past", () => {
  const today = "2026-11-16";
  const weekly = nextOccurrence("2026-09-01", "weekly", today); // a Tuesday
  assert.ok(weekly >= today);
  assert.equal(weekday(weekly), weekday("2026-09-01"));
  assert.equal(nextOccurrence("2026-06-10", "monthly", today), "2026-12-10");
  assert.equal(nextOccurrence("2026-11-01", "daily", today), "2026-11-16");
});
