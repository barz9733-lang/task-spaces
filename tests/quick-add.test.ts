import assert from "node:assert/strict";
import { test } from "node:test";
import { parseQuickTask } from "../src/lib/quick-add";

const TODAY = "2026-11-18"; // a Wednesday
const p = (s: string) => parseQuickTask(s, TODAY);

test("plain text stays as the title", () => {
  assert.deepEqual(p("לקנות חלב"), { title: "לקנות חלב", due_date: null, priority: null, recurrence: null });
});

test("today / tomorrow / the day after", () => {
  assert.deepEqual(p("לשלם ארנונה מחר"), { title: "לשלם ארנונה", due_date: "2026-11-19", priority: null, recurrence: null });
  assert.equal(p("להתקשר לסבתא היום").due_date, TODAY);
  assert.equal(p("לשלוח דוח עד מחר").title, "לשלוח דוח");
  assert.equal(p("לשלוח דוח עד מחר").due_date, "2026-11-19");
  assert.equal(p("פגישה מחרתיים").due_date, "2026-11-20");
});

test("weekdays mean the next one (never today)", () => {
  assert.equal(p("ספורט ביום חמישי").due_date, "2026-11-19");
  assert.equal(p("ספורט ביום חמישי").title, "ספורט");
  assert.equal(p("לנקות בשבת").due_date, "2026-11-21");
  assert.equal(p("ישיבה יום רביעי").due_date, "2026-11-25"); // today is Wednesday -> next week
  assert.equal(p("שני תפוחים").due_date, null); // "שני" without "יום"/"ב" is just a word
});

test("in N days / weeks", () => {
  assert.equal(p("לבדוק תשובה בעוד 3 ימים").due_date, "2026-11-21");
  assert.equal(p("לבדוק תשובה בעוד שבוע").due_date, "2026-11-25");
  assert.equal(p("חידוש מנוי בעוד שבועיים").due_date, "2026-12-02");
  assert.equal(p("לחשוב על זה בשבוע הבא").due_date, "2026-11-25");
});

test("day of month and explicit dates", () => {
  assert.equal(p("לשלם חשמל עד ה-10").due_date, "2026-12-10"); // the 10th already passed this month
  assert.equal(p("לשלם חשמל עד ה-10").title, "לשלם חשמל");
  assert.equal(p("להגיש טופס ב-25").due_date, "2026-11-25");
  assert.equal(p("יום הולדת 3/12").due_date, "2026-12-03");
  assert.equal(p("טיסה 10.1").due_date, "2027-01-10"); // January already passed -> next year
  assert.equal(p("חתונה 5/6/27").due_date, "2027-06-05");
  assert.equal(p("משהו 31/2").due_date, null); // impossible date is ignored
});

test("priority words", () => {
  assert.equal(p("לחדש ביטוח דחוף").priority, "urgent");
  assert.equal(p("לחדש ביטוח דחוף").title, "לחדש ביטוח");
  assert.equal(p("להחליף נורה לא דחוף").priority, "low");
  assert.equal(p("לסיים מצגת חשוב").priority, "high");
  assert.equal(p("לבדוק עדיפות גבוהה").priority, "high");
});

test("recurrence, and a repeating task always gets a date", () => {
  assert.deepEqual(p("לשלם ארנונה כל חודש ב-10"), { title: "לשלם ארנונה", due_date: "2026-12-10", priority: null, recurrence: "monthly" });
  assert.deepEqual(p("לקחת ויטמין כל יום"), { title: "לקחת ויטמין", due_date: TODAY, priority: null, recurrence: "daily" });
  assert.deepEqual(p("חוג כל יום שני"), { title: "חוג", due_date: "2026-11-23", priority: null, recurrence: "weekly" });
  assert.equal(p("ניקיון כל שבוע").recurrence, "weekly");
});

test("everything together", () => {
  assert.deepEqual(p("לשלוח הצעת מחיר ללקוח מחר דחוף"), {
    title: "לשלוח הצעת מחיר ללקוח",
    due_date: "2026-11-19",
    priority: "urgent",
    recurrence: null,
  });
});

test("words that only contain a keyword are left alone", () => {
  assert.equal(p("לבקר את מחרוזת").due_date, null);
  assert.equal(p("לקרוא את היומן").due_date, null);
  assert.equal(p("לקנות תחבושות").title, "לקנות תחבושות");
});

test("a line that is only keywords keeps the original text as the title", () => {
  assert.equal(p("מחר").title, "מחר");
  assert.equal(p("מחר").due_date, "2026-11-19");
});

test("a bare number is not a date", () => {
  assert.equal(p("לקנות 3 תפוחים").due_date, null);
  assert.equal(p("לקנות 3 תפוחים").title, "לקנות 3 תפוחים");
});
