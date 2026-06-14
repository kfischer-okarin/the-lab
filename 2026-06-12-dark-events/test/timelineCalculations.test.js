"use strict";

// Tests for the public view-model API in public/timelineCalculations.js.
// Run with: node --test
//
// Fixtures are hand-built (not the real dataset) so the expectations stay stable
// as the show's data grows. Events and appearances are built with the small
// named-option DSL below, so each fixture reads as what it means rather than a
// row of positional arguments.

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Timeline = require("../public/timelineCalculations.js");

// --- fixture DSL ------------------------------------------------------------

// An event. By default it is undated and sits at S1E1 00:00; pass only the
// fields a test cares about:
//   { episode, season, time }            place it in episode chronology
//   { date, key }                        give it a world date + that date's order key
//   { travel: { from, fromKey, to, toKey } }   a time-travel event
//   { who: [appearance, ...] }            who appears, and any item movement
function event(id, opts = {}) {
  const { season = 1, episode = 1, time = "00:00", date, key = "a", travel, who = [] } = opts;
  return { id, season, episode, timestamp: time, title: id, when: when(date, key, travel),
           persons: who.map(appearance) };
}

function when(date, key, travel) {
  if (travel) {
    return { kind: "time_travel", from: travel.from ?? null, from_order: travel.fromKey ?? null,
             to: travel.to ?? null, to_order: travel.toKey ?? null };
  }
  return date != null ? { kind: "date", date, order: key } : { kind: "unknown" };
}

// An appearance of a person at an event. `subj` is their subjective order key;
// `gains` / `loses` / `has` accept a single item id or a list; `age` sets a
// confirmed-age anchor; `dead` marks the death.
function appearance({ person, subj, gains, loses, has, age, dead }) {
  const a = { id: person, order: subj };
  if (gains != null) a.gains = [].concat(gains);
  if (loses != null) a.loses = [].concat(loses);
  if (has != null) a.has = [].concat(has);
  if (age != null) a.confirmed_age = age;
  if (dead) a.death = true;
  return a;
}

// --- assertion helpers ------------------------------------------------------

const eventIds = (events) => events.map((e) => e.id);          // raw events
const entryIds = (entries) => entries.map((x) => x.event.id);  // rows / date-points (wrap an event)
const ages = (rows) => rows.map((r) => r.age);
const roles = (points) => points.map((p) => p.role);
const ownerAt = (rows) => rows.map((r) => [r.event.id, r.owner]);
const kindAt = (rows) => rows.map((r) => [r.event.id, r.kind]);
const ownerKindAt = (rows) => rows.map((r) => [r.event.id, r.owner, r.kind]);

// --- eventsInEpisodeChronology ----------------------------------------------

test("eventsInEpisodeChronology orders by season, episode, timestamp, then id", () => {
  const events = [
    event("late-ep", { episode: 2, time: "00:10" }),
    event("early-ep", { episode: 1, time: "99:00" }),
    event("b-tie", { episode: 2, time: "00:10" }),     // same key as late-ep: id breaks the tie
    event("big-minutes", { episode: 2, time: "70:00" }) // 70:00 > 09:00 numerically, not lexically
  ];
  assert.deepEqual(eventIds(Timeline.eventsInEpisodeChronology(events)),
    ["early-ep", "b-tie", "late-ep", "big-minutes"]);
});

test("eventsInEpisodeChronology returns a copy, leaving the input order untouched", () => {
  const events = [event("b", { episode: 2 }), event("a", { episode: 1 })];
  Timeline.eventsInEpisodeChronology(events);
  assert.deepEqual(eventIds(events), ["b", "a"]);
});

// --- subjectiveEventsForPerson ----------------------------------------------

test("subjectiveEventsForPerson sorts by byte order of the fractional key, not linguistically", () => {
  // "K" (0x4B) sorts before "e" (0x65) by byte order; localeCompare would flip them.
  const events = [
    event("second", { date: "2019-01-01", who: [{ person: "p", subj: "e" }] }),
    event("first", { date: "2019-01-01", who: [{ person: "p", subj: "K" }] })
  ];
  assert.deepEqual(entryIds(Timeline.subjectiveEventsForPerson(events, "p")), ["first", "second"]);
});

test("subjectiveEventsForPerson walks biological age by world-year difference from the anchor", () => {
  const events = [
    event("anchor", { date: "2000-01-01", who: [{ person: "p", subj: "a", age: 10 }] }),
    event("after", { date: "2010-01-01", who: [{ person: "p", subj: "b" }] }),
    event("before", { date: "1995-01-01", who: [{ person: "p", subj: "0" }] })
  ];
  assert.deepEqual(ages(Timeline.subjectiveEventsForPerson(events, "p")), [5, 10, 20]); // 1995, 2000, 2010
});

test("subjectiveEventsForPerson tags an item gained here and warns on unexplained `has`", () => {
  const events = [
    event("gets", { date: "2019-01-01", who: [{ person: "p", subj: "a", gains: "thing" }] }),
    event("seen", { date: "2019-01-02", who: [{ person: "p", subj: "b", has: "mystery" }] })
  ];
  const rows = Timeline.subjectiveEventsForPerson(events, "p");
  assert.deepEqual(rows[0].items, [{ item: "thing", gain: true, lose: false, warn: false }]);
  // `mystery` is observed with no earlier gains -> warns. `thing` is still carried, no warn.
  assert.equal(rows[1].items.find((t) => t.item === "mystery").warn, true);
  assert.equal(rows[1].items.find((t) => t.item === "thing").gain, false);
});

// --- itemEvents -------------------------------------------------------------
//
// An item's timeline obeys two principles:
//   (A) while the item is HELD, it follows the holder's SUBJECTIVE order — the
//       object goes where its owner goes, in the order they live it;
//   (B) while the item is NOT held (ownerless between holdings), it follows
//       WORLD time — the next holding is whoever picks it up earliest in world
//       chronology (date + that date's order key).
// A direct hand-off (one owner to another at a shared event) is "held" the whole
// time, so it falls under (A): custody order, never re-sorted by world time.

// (A) held → subjective order ------------------------------------------------

test("itemEvents keeps a single holding in subjective order, even when a later event is world-earlier", () => {
  // The parcel-to-self loop: young Jonas reads the letter (subjectively first),
  // grows up, and as an adult sends it (subjectively last) — but the sending is
  // world-EARLIER the same day. While he holds it throughout, subjective order
  // wins: read then send. (World time would wrongly put the lose before the gain.)
  const events = [
    event("read", { date: "2019-11-07", key: "z", who: [{ person: "jonas", subj: "a", gains: "letter" }] }),
    event("send", { date: "2019-11-07", key: "a", who: [{ person: "jonas", subj: "b", loses: "letter" }] })
  ];
  assert.deepEqual(kindAt(Timeline.itemEvents(events, "letter")), [["read", "gain"], ["send", "lose"]]);
});

test("itemEvents keeps a carry after its gain even when the carry time-travels backward", () => {
  // Held throughout one owner, but the world dates are non-monotonic (he carries
  // it back in time mid-hold). A carry must still follow its gain (subjective),
  // never be reordered ahead of it by its earlier world date.
  const events = [
    event("gets", { date: "2020-01-01", who: [{ person: "p", subj: "a", gains: "x" }] }),
    event("carries-in-past", { date: "1990-01-01", who: [{ person: "p", subj: "b" }] }),
    event("drops", { date: "2000-01-01", who: [{ person: "p", subj: "c", loses: "x" }] })
  ];
  assert.deepEqual(kindAt(Timeline.itemEvents(events, "x")),
    [["gets", "gain"], ["carries-in-past", "carry"], ["drops", "lose"]]);
});

test("itemEvents keeps a direct hand-off in custody order even when it travels back in time", () => {
  // `a` hands the item straight to `b` (shared event); `b` carries it further
  // back in time. The item is never ownerless, so it is HELD throughout: custody
  // order, not world time. (World time would reverse it to 1953, 1986, 2019.)
  const events = [
    event("a-gets", { date: "2019-01-01", who: [{ person: "a", subj: "a", gains: "clock" }] }),
    event("handoff", { date: "1986-01-01",
      who: [{ person: "a", subj: "b" }, { person: "b", subj: "a", gains: "clock" }] }),
    event("b-carries", { date: "1953-01-01", who: [{ person: "b", subj: "b" }] })
  ];
  assert.deepEqual(kindAt(Timeline.itemEvents(events, "clock")),
    [["a-gets", "gain"], ["handoff", "gain"], ["b-carries", "carry"]]);
});

// (B) not held → world time --------------------------------------------------

test("itemEvents orders disconnected holdings by world pickup date", () => {
  // Dropped (ownerless), then re-acquired by unrelated owners. The events array
  // lists the world-LATER owner first, so order must come from pickup date, not
  // array or person-iteration order.
  const events = [
    event("writes", { date: "2019-06-21", key: "a", who: [{ person: "michael", subj: "a", gains: "letter" }] }),
    event("dies", { date: "2019-06-21", key: "b", who: [{ person: "michael", subj: "b", loses: "letter" }] }),
    event("jonas-gets", { date: "2019-11-07", who: [{ person: "jonas", subj: "a", gains: "letter" }] }),
    event("ines-has", { date: "2019-11-04", who: [{ person: "ines", subj: "a", has: "letter" }] })
  ];
  assert.deepEqual(ownerAt(Timeline.itemEvents(events, "letter")), [
    ["writes", "michael"], ["dies", null], ["ines-has", "ines"], ["jonas-gets", "jonas"]
  ]);
});

test("itemEvents orders disconnected holdings picked up on the same date by the date-order key", () => {
  // Two ownerless pickups on the same world day: the within-day order key decides
  // (the same key the Chronologie tab uses), and the events array order is irrelevant.
  const events = [
    event("afternoon", { date: "2019-11-07", key: "m", who: [{ person: "b", subj: "a", has: "x" }] }),
    event("morning", { date: "2019-11-07", key: "a", who: [{ person: "c", subj: "a", has: "x" }] })
  ];
  assert.deepEqual(entryIds(Timeline.itemEvents(events, "x")), ["morning", "afternoon"]);
});

// (A) + (B) together ---------------------------------------------------------

test("itemEvents threads a full chain: world-time gaps, custody-ordered hand-off, subjective carry", () => {
  // Michael writes then dies (drop). Ines holds it and hands it to Jonas (a held
  // transfer). Jonas carries it through life and sends it (drop). The two
  // ownerless gaps are world-ordered; the Ines->Jonas hand-off and Jonas's carry
  // stay in custody/subjective order.
  const events = [
    event("writes", { date: "2020-01-01", who: [{ person: "michael", subj: "a", gains: "letter" }] }),
    event("dies", { date: "2020-01-02", who: [{ person: "michael", subj: "b", loses: "letter" }] }),
    event("ines-has", { date: "2020-05-01", who: [{ person: "ines", subj: "a", has: "letter" }] }),
    event("ines-gives", { date: "2020-06-01",
      who: [{ person: "ines", subj: "b", loses: "letter" }, { person: "jonas", subj: "a", gains: "letter" }] }),
    event("jonas-carries", { date: "2020-09-01", who: [{ person: "jonas", subj: "b" }] }),
    event("jonas-sends", { date: "2020-12-01", who: [{ person: "jonas", subj: "c", loses: "letter" }] })
  ];
  assert.deepEqual(ownerKindAt(Timeline.itemEvents(events, "letter")), [
    ["writes", "michael", "gain"],
    ["dies", null, "lose"],
    ["ines-has", "ines", "has"],
    ["ines-gives", "jonas", "gain"], // hand-off: receiver's gain, in custody order
    ["jonas-carries", "jonas", "carry"],
    ["jonas-sends", null, "lose"]
  ]);
});

// --- eventsForDate ----------------------------------------------------------

test("eventsForDate returns within-date points sorted by their date-order key", () => {
  const events = [
    event("noon", { date: "2019-11-04", key: "m" }),
    event("morning", { date: "2019-11-04", key: "d" }),
    event("other-day", { date: "2019-11-05", key: "a" })
  ];
  assert.deepEqual(entryIds(Timeline.eventsForDate(events, "2019-11-04")), ["morning", "noon"]);
});

test("eventsForDate lists a time-travel event under both endpoints with the right role", () => {
  const events = [event("trip", { travel: { from: "2019-11-04", fromKey: "a", to: "1986-11-04", toKey: "z" } })];
  assert.deepEqual(roles(Timeline.eventsForDate(events, "2019-11-04")), ["from"]);
  assert.deepEqual(roles(Timeline.eventsForDate(events, "1986-11-04")), ["to"]);
});
