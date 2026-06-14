"use strict";

// Tests for the public view-model API in public/timelineCalculations.js.
// Run with: node --test
//
// Fixtures are hand-built (not the real dataset) so the expectations stay stable
// as the show's data grows. Each event mirrors the YAML-parsed shape: string
// keys, a `when` object, and a `persons` array of appearances.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Timeline = require("../public/timelineCalculations.js");

// --- builders ---------------------------------------------------------------

function dateEvent(id, season, episode, timestamp, date, order, persons = []) {
  return { id, season, episode, timestamp, title: id,
           when: { kind: "date", date, order }, persons };
}

function travelEvent(id, from, fromOrder, to, toOrder, persons = []) {
  return { id, season: 1, episode: 1, timestamp: "00:00", title: id,
           when: { kind: "time_travel", from, from_order: fromOrder, to, to_order: toOrder }, persons };
}

const ids = (events) => events.map((e) => e.id);

// --- eventsInEpisodeChronology ----------------------------------------------

test("eventsInEpisodeChronology orders by season, episode, timestamp, then id", () => {
  const events = [
    dateEvent("late-ep", 1, 2, "00:10", "2019-01-01", "a"),
    dateEvent("early-ep", 1, 1, "99:00", "2019-01-01", "a"),
    dateEvent("b-tie", 1, 2, "00:10", "2019-01-01", "a"), // same key as late-ep: id breaks tie
    dateEvent("big-minutes", 1, 2, "70:00", "2019-01-01", "a") // 70:00 > 09:00 numerically, not lexically
  ];
  assert.deepEqual(ids(Timeline.eventsInEpisodeChronology(events)),
    ["early-ep", "b-tie", "late-ep", "big-minutes"]);
});

test("eventsInEpisodeChronology returns a copy, leaving the input order untouched", () => {
  const events = [dateEvent("b", 1, 2, "00:00", "2019-01-01", "a"),
                  dateEvent("a", 1, 1, "00:00", "2019-01-01", "a")];
  Timeline.eventsInEpisodeChronology(events);
  assert.deepEqual(ids(events), ["b", "a"]);
});

// --- subjectiveEventsForPerson ----------------------------------------------

test("subjectiveEventsForPerson sorts by byte order of the fractional key, not linguistically", () => {
  // "K" (0x4B) sorts before "e" (0x65) by byte order; localeCompare would flip them.
  const events = [
    dateEvent("second", 1, 1, "00:00", "2019-01-01", "a", [{ id: "p", order: "e" }]),
    dateEvent("first", 1, 1, "00:00", "2019-01-01", "a", [{ id: "p", order: "K" }])
  ];
  const rows = Timeline.subjectiveEventsForPerson(events, "p");
  assert.deepEqual(rows.map((r) => r.event.id), ["first", "second"]);
});

test("subjectiveEventsForPerson walks biological age by world-year difference from the anchor", () => {
  const events = [
    dateEvent("e1", 1, 1, "00:00", "2000-01-01", "a", [{ id: "p", order: "a", confirmed_age: 10 }]),
    dateEvent("e2", 1, 1, "00:00", "2010-01-01", "a", [{ id: "p", order: "b" }]),
    dateEvent("e0", 1, 1, "00:00", "1995-01-01", "a", [{ id: "p", order: "0" }]) // before the anchor
  ];
  const rows = Timeline.subjectiveEventsForPerson(events, "p");
  assert.deepEqual(rows.map((r) => r.age), [5, 10, 20]); // 1995, 2000(anchor), 2010
});

test("subjectiveEventsForPerson tags an item gained here and warns on unexplained `has`", () => {
  const events = [
    dateEvent("gets", 1, 1, "00:00", "2019-01-01", "a", [{ id: "p", order: "a", gains: ["thing"] }]),
    dateEvent("seen", 1, 1, "00:00", "2019-01-02", "a", [{ id: "p", order: "b", has: ["mystery"] }])
  ];
  const rows = Timeline.subjectiveEventsForPerson(events, "p");
  assert.deepEqual(rows[0].items, [{ item: "thing", gain: true, lose: false, warn: false }]);
  // `mystery` is observed with no earlier gains -> warns. `thing` is still carried, no warn.
  const seen = rows[1].items;
  assert.equal(seen.find((t) => t.item === "mystery").warn, true);
  assert.equal(seen.find((t) => t.item === "thing").gain, false);
});

// --- itemEvents (the disconnected-segment ordering bug) ---------------------

test("itemEvents orders disconnected ownership segments by world pickup date", () => {
  // The item is dropped (ownerless) and later re-acquired by people whose runs
  // are NOT transfer-linked. Event order puts the chronologically LATER owner
  // first, so a naive append would mis-order them; pickup date must decide.
  const events = [
    dateEvent("writes", 1, 1, "00:00", "2019-06-21", "a", [{ id: "michael", order: "a", gains: ["letter"] }]),
    dateEvent("dies", 1, 1, "00:01", "2019-06-21", "b", [{ id: "michael", order: "b", loses: ["letter"] }]),
    dateEvent("jonas-gets", 1, 1, "00:02", "2019-11-07", "c", [{ id: "jonas", order: "a", gains: ["letter"] }]),
    dateEvent("ines-has", 1, 1, "00:03", "2019-11-04", "d", [{ id: "ines", order: "a", has: ["letter"] }])
  ];
  const owners = Timeline.itemEvents(events, "letter").map((r) => [r.event.id, r.owner]);
  assert.deepEqual(owners, [
    ["writes", "michael"],   // 2019-06-21
    ["dies", null],          // ownerless
    ["ines-has", "ines"],    // 2019-11-04  (before jonas, despite later in the events array)
    ["jonas-gets", "jonas"]  // 2019-11-07
  ]);
});

test("itemEvents keeps a transfer chain in hand-off order even when it travels back in time", () => {
  // a hands the item to b at `handoff`; b carries it further back in time. The
  // linked segment must stay in hand-off order, not be re-sorted by date.
  const events = [
    dateEvent("a-gets", 1, 1, "00:00", "2019-01-01", "a", [{ id: "a", order: "a", gains: ["clock"] }]),
    dateEvent("handoff", 1, 1, "00:01", "1986-01-01", "b",
      [{ id: "a", order: "b" }, { id: "b", order: "a", gains: ["clock"] }]),
    dateEvent("b-carries", 1, 1, "00:02", "1953-01-01", "c", [{ id: "b", order: "b" }])
  ];
  const rows = Timeline.itemEvents(events, "clock");
  assert.deepEqual(rows.map((r) => [r.event.id, r.kind]), [
    ["a-gets", "gain"], ["handoff", "gain"], ["b-carries", "carry"]
  ]);
});

// --- eventsForDate ----------------------------------------------------------

test("eventsForDate returns within-date points sorted by their date-order key", () => {
  const events = [
    dateEvent("noon", 1, 1, "00:00", "2019-11-04", "m"),
    dateEvent("morning", 1, 1, "00:00", "2019-11-04", "d"),
    dateEvent("other-day", 1, 1, "00:00", "2019-11-05", "a")
  ];
  const points = Timeline.eventsForDate(events, "2019-11-04");
  assert.deepEqual(points.map((p) => p.event.id), ["morning", "noon"]);
});

test("eventsForDate lists a time-travel event under both endpoints with the right role", () => {
  const events = [travelEvent("trip", "2019-11-04", "a", "1986-11-04", "z")];
  assert.deepEqual(Timeline.eventsForDate(events, "2019-11-04").map((p) => p.role), ["from"]);
  assert.deepEqual(Timeline.eventsForDate(events, "1986-11-04").map((p) => p.role), ["to"]);
});
