"use strict";

// Pure timeline calculations shared by the browser UI (public/app.js) and the
// headless CLI (bin/timeline). No DOM and no globals: every function takes the
// raw `events` array (plus ids) and returns the logical structure behind one
// view, so the two front-ends always agree on what the data means.
//
// The four view models are the main pieces:
//   eventsInEpisodeChronology(events)        -> [event]        (left list)
//   subjectiveEventsForPerson(events, id)    -> [row]          (Subjektive Zeitlinie, person)
//   itemEvents(events, itemId)               -> [row]          (Subjektive Zeitlinie, item)
//   eventsForDate(events, date)              -> [point]        (Chronologie)
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TimelineCalculations = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  // --- key + date primitives -------------------------------------------------

  // Ordinal string comparison (UTF-16 code units = byte order for the fractional
  // keys). NOT localeCompare, which is linguistic ("e" < "K") and would disagree
  // with the keys' byte order ("K" < "e").
  function byteCompare(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }

  function yearOf(dateStr) {
    if (!dateStr) return null;
    const year = parseInt(String(dateStr).slice(0, 4), 10);
    return Number.isNaN(year) ? null : year;
  }

  // The date a person experiences an event: `from` for a time-travel event.
  function inDate(event) {
    const w = event.when || {};
    if (w.kind === "date") return w.date || null;
    if (w.kind === "time_travel") return w.from || null;
    return null;
  }

  // The date a person leaves an event toward the next: `to` for a time-travel event.
  function outDate(event) {
    const w = event.when || {};
    if (w.kind === "date") return w.date || null;
    if (w.kind === "time_travel") return w.to || null;
    return null;
  }

  // Biological years between a preceding event and the next, or null when a
  // needed date is missing (which breaks the age chain past that point).
  function edgeDelta(prevEvent, nextEvent) {
    const out = yearOf(outDate(prevEvent));
    const inn = yearOf(inDate(nextEvent));
    return out === null || inn === null ? null : inn - out;
  }

  // Episode timestamp is MM:SS (minutes can exceed 59), so compare by total
  // seconds, not lexically.
  function timestampSeconds(ts) {
    const [m, s] = String(ts || "00:00").split(":").map(Number);
    return (m || 0) * 60 + (s || 0);
  }

  // --- event list (episode chronology) ---------------------------------------

  // Order by season, episode, in-episode timestamp, then event id.
  function compareEvents(a, b) {
    return (a.season || 0) - (b.season || 0)
      || (a.episode || 0) - (b.episode || 0)
      || timestampSeconds(a.timestamp) - timestampSeconds(b.timestamp)
      || byteCompare(a.id, b.id);
  }

  function eventsInEpisodeChronology(events) {
    return events.slice().sort(compareEvents);
  }

  // --- subjective order (per subject) ----------------------------------------

  // Every appearance of a subject across all events, sorted by its subjective
  // fractional key. A person can appear more than once in one event (younger/
  // older self), so each row carries its `index` in the event's array to
  // disambiguate.
  function appearancesFor(events, type, id) {
    const rows = [];
    for (const event of events) {
      (event[type] || []).forEach((appearance, index) => {
        if (appearance.id !== id) return;
        rows.push({
          event, index, order: appearance.order, death: appearance.death === true,
          confirmedAge: appearance.confirmed_age, gains: appearance.gains || [],
          loses: appearance.loses || [], has: appearance.has || []
        });
      });
    }
    return rows.sort((a, b) => byteCompare(String(a.order), String(b.order)));
  }

  // Each person's appearances in their own subjective order, keyed by person id.
  function personEventOrder(events) {
    const map = {};
    for (const event of events) {
      (event.persons || []).forEach((appearance, index) => {
        (map[appearance.id] ||= []).push({ event, index, appearance, order: appearance.order });
      });
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => byteCompare(String(a.order), String(b.order)));
    }
    return map;
  }

  // --- age along the subjective timeline -------------------------------------

  // Biological age along the subjective timeline. Age accumulates between
  // consecutive events by their world-year difference; time travel uses the
  // event's `from` as its own timestamp and `to` as the hand-off to the next.
  function computeAges(rows) {
    const ages = rows.map(() => null);
    const anchor = rows.findIndex((r) => Number.isInteger(r.confirmedAge));
    if (anchor === -1) return ages;

    ages[anchor] = rows[anchor].confirmedAge;
    for (let j = anchor + 1; j < rows.length; j++) {
      const d = edgeDelta(rows[j - 1].event, rows[j].event);
      if (ages[j - 1] !== null && d !== null) ages[j] = ages[j - 1] + d;
    }
    for (let j = anchor - 1; j >= 0; j--) {
      const d = edgeDelta(rows[j].event, rows[j + 1].event);
      if (ages[j + 1] !== null && d !== null) ages[j] = ages[j + 1] - d;
    }
    return ages;
  }

  // The age a person has at the first appearance matching `predicate` along their
  // subjective timeline, or null when no confirmed-age anchor lets us compute one.
  function ageOnTimeline(events, personId, predicate) {
    const rows = appearancesFor(events, "persons", personId);
    if (!rows.some((r) => Number.isInteger(r.confirmedAge))) return null;
    const ages = computeAges(rows);
    const i = rows.findIndex(predicate);
    return i >= 0 ? ages[i] : null;
  }

  // --- ownership derivation --------------------------------------------------

  // Item timelines are derived from ownership. Returns each item's ordered chain
  // of rows and a map of which items a person owns at a given event. Both `gains`
  // (explicit) and `has` (observed) acquire the item; only an explicit gains by
  // another person counts as a transfer that ends the current owner's run.
  function ownershipModel(events) {
    const personEvents = personEventOrder(events);
    const gainerAt = {}; // `${eventId}|${itemId}` -> personId (explicit gains only)
    const itemIds = new Set();
    for (const event of events) {
      for (const p of event.persons || []) {
        for (const it of p.gains || []) { gainerAt[`${event.id}|${it}`] = p.id; itemIds.add(it); }
        for (const it of p.has || []) itemIds.add(it);
        for (const it of p.loses || []) itemIds.add(it);
      }
    }
    const ownedAt = {};
    const chains = {};
    for (const itemId of itemIds) chains[itemId] = buildItemChain(itemId, personEvents, gainerAt, ownedAt);
    return { chains, ownedAt };
  }

  // Collect every person's holding runs for the item, link transfer-linked runs
  // into segments, then order the segments by world time. A segment keeps the
  // holder's subjective order internally (the item is carried where they go, so a
  // carry always follows its gain — even across a time-travel loop). Only the
  // gaps *between* holdings, where the item is ownerless, are world-time ordered.
  function buildItemChain(itemId, personEvents, gainerAt, ownedAt) {
    const runs = [];
    for (const personId of Object.keys(personEvents)) {
      for (const run of buildRuns(personId, itemId, personEvents[personId], gainerAt)) runs.push(run);
    }
    const segments = stitchSegments(runs);

    // Not carried between segments: order each holding by the world instant at
    // which its first owner picks the item up (the earliest gain in world time).
    segments.sort((a, b) => byteCompare(acquireInstant(a), acquireInstant(b)));

    const rows = segments.flatMap((seg) => seg.flatMap((run) => run.rows));
    for (const r of rows) if (r.owner) (ownedAt[`${r.owner}#${r.index}|${r.event.id}`] ||= []).push(itemId);
    return rows;
  }

  // A segment is a maximal transfer-linked sequence of runs: one owner hands the
  // item to the next at a shared event, so the chain stays in hand-off order even
  // when a transfer carries the item back in time. Roots are runs nobody
  // transferred into; any left unvisited (e.g. a cycle) become their own segment.
  function stitchSegments(runs) {
    const byAcquire = {};
    for (const run of runs) byAcquire[run.acquireEventId] = run;
    const transferTargets = new Set(runs.map((r) => r.transferEventId).filter(Boolean));

    const visited = new Set();
    const segments = [];
    const roots = runs.filter((r) => !transferTargets.has(r.acquireEventId));
    for (const run of [...roots, ...runs]) {
      if (visited.has(run.acquireEventId)) continue;
      segments.push(collectSegment(run, byAcquire, visited));
    }
    return segments;
  }

  function collectSegment(root, byAcquire, visited) {
    const seg = [];
    for (let cur = root.acquireEventId; cur && byAcquire[cur] && !visited.has(cur); cur = byAcquire[cur].transferEventId) {
      visited.add(cur);
      seg.push(byAcquire[cur]);
    }
    return seg;
  }

  // The world instant at which a segment's first owner acquires the item: its
  // world date paired with that date's order key (the same key the Chronologie
  // tab orders by). A missing date sorts last.
  function acquireInstant(seg) {
    const event = seg[0].rows[0].event;
    const w = event.when || {};
    if (w.kind === "date") return `${w.date || "9999-99-99"}|${w.order || ""}`;
    if (w.kind === "time_travel") {
      return w.from ? `${w.from}|${w.from_order || ""}` : `${w.to || "9999-99-99"}|${w.to_order || ""}`;
    }
    return "9999-99-99|";
  }

  // A holding run for one person: from an acquisition (explicit `gains` or
  // observed `has`) through their events until they lose it (inclusive, ->
  // ownerless) or another person explicitly gains it (exclusive transfer out).
  function buildRuns(personId, itemId, entries, gainerAt) {
    const runs = [];
    let run = null;
    for (const { event: e, index, appearance: a } of entries) {
      const gains = (a.gains || []).includes(itemId);
      const observed = (a.has || []).includes(itemId);
      const loses = (a.loses || []).includes(itemId);
      const takenByOther = gainerAt[`${e.id}|${itemId}`] && gainerAt[`${e.id}|${itemId}`] !== personId;

      if (run && takenByOther) {
        run.transferEventId = e.id;
        runs.push(run);
        run = null;
      } else if (!run && (gains || observed)) {
        run = { acquireEventId: e.id, transferEventId: null,
                rows: [{ event: e, owner: personId, index, kind: gains ? "gain" : "has" }] };
      } else if (run) {
        if (loses) { run.rows.push({ event: e, owner: null, index, kind: "lose" }); runs.push(run); run = null; }
        else run.rows.push({ event: e, owner: personId, index, kind: "carry" });
      }
    }
    if (run) runs.push(run);
    return runs;
  }

  // --- view models -----------------------------------------------------------

  // The person's subjective timeline: one row per appearance, with the biological
  // age at that point and the items held there. Each item is tagged gain/lose/
  // warn (observed but unexplained) so a hand-off reads as lost-here and
  // gained-here at its two slots; a plain tag means it is merely carried.
  function subjectiveEventsForPerson(events, personId) {
    const rows = appearancesFor(events, "persons", personId);
    const ages = computeAges(rows);
    const { ownedAt } = ownershipModel(events);

    // Earliest subjective order at which this person gains each item.
    const firstGain = {};
    for (const r of rows) for (const it of r.gains) if (!(it in firstGain)) firstGain[it] = r.order;

    return rows.map((row, i) => {
      const owned = ownedAt[`${personId}#${row.index}|${row.event.id}`] || [];
      const ids = [...new Set([...owned, ...row.has, ...row.gains, ...row.loses])];
      const items = ids.map((it) => ({
        item: it,
        gain: row.gains.includes(it),
        lose: row.loses.includes(it),
        warn: !row.gains.includes(it) && !row.loses.includes(it) && row.has.includes(it)
          && !(it in firstGain && byteCompare(firstGain[it], row.order) < 0)
      }));
      return { event: row.event, index: row.index, order: row.order, age: ages[i],
               confirmedAge: row.confirmedAge, death: row.death, items };
    });
  }

  // The item's derived timeline: its ownership chain, one row per event, each
  // marked gain/has/lose/carry with the owner (and their age) at that moment.
  function itemEvents(events, itemId) {
    const { chains } = ownershipModel(events);
    return (chains[itemId] || []).map((row) => ({
      event: row.event, owner: row.owner, index: row.index, kind: row.kind,
      ownerAge: row.owner
        ? ageOnTimeline(events, row.owner, (r) => r.event.id === row.event.id && r.index === row.index)
        : null
    }));
  }

  // The events occurring on a given date, in their within-date order. A single
  // time-travel event can appear twice (as its `from` and its `to` endpoint), so
  // each point carries the role that placed it on this date.
  function eventsForDate(events, date) {
    const points = [];
    for (const event of events) {
      const w = event.when || {};
      if (w.kind === "date" && w.date === date) points.push({ event, role: "date", order: w.order });
      else if (w.kind === "time_travel") {
        if (w.from === date) points.push({ event, role: "from", order: w.from_order });
        if (w.to === date) points.push({ event, role: "to", order: w.to_order });
      }
    }
    return points.sort((a, b) => byteCompare(String(a.order), String(b.order)));
  }

  // Minimal surface: the four view models, plus ageOnTimeline for the editor's
  // age preview of an unsaved appearance. Everything else stays internal.
  return {
    eventsInEpisodeChronology, subjectiveEventsForPerson, itemEvents, eventsForDate, ageOnTimeline
  };
});
