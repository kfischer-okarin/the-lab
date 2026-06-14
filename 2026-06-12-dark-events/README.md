# Dark — Ereignis-Editor

A small local editor for authoring the timeline of events in the *Dark* Netflix
series. The server (Sinatra) only reads and writes plain, diffable YAML in
`data/`; the editing UI lives in the browser, and the timeline logic behind each
view is a pure, shared module (see [Derived views](#derived-views-publictimelinecalculationsjs)).

## Run

```sh
bundle install
bin/dev            # → http://127.0.0.1:4567
```

Inspect the derived views without the browser, and run the tests for them:

```sh
bin/timeline item brief_an_jonas   # an item's ownership timeline
bin/timeline person jonas_kahnwald # a person's subjective timeline
bin/timeline date 2019-11-04       # the events on a date
bin/timeline events                # episode chronology (the left list)
node --test                        # tests for the derived views
```

## Data model (`data/`)

Normalized, source-controllable YAML:

- **`persons.yml`** — registry of characters (`id`, `name`, `aliases`). Identity
  is by *soul*, not name, so Mikkel → Michael lives under one person.
- **`items.yml`** — registry of objects (`id`, `name`).
- **`episodes.yml`** — `season`, `episode`, `title`.
- **`events.yml`** — the events; everything else references persons/items by id.

### An event

```yaml
- id: ev-0009
  season: 1
  episode: 1
  timestamp: "12:30"          # in-episode time, MM:SS (minutes unbounded)
  title: Mikkel wird von Jonas durch die Höhle gebracht
  when:
    kind: time_travel         # date | time_travel | unknown
    from: "2019-11-05"
    from_order: C             # per-date order key (see below)
    to: "1986-11-05"
    to_order: F
  persons:
  - id: mikkel_nielsen
    order: U                  # subjective order key (see below)
  implied: false              # true = off-screen / only implied, not shown yet
  missing_details: false      # flags an event that still needs research
```

`when` is one of `{kind: date, date, order}`,
`{kind: time_travel, from, from_order, to, to_order}` (either bound may be null =
unknown), or `{kind: unknown}`.

### Three fractional-index orderings (`lib/frac.rb`)

A fractional-index key lets a new key be minted *between* two existing ones, so
inserting/reordering touches only the moved row — tiny diffs, no renumbering.
Keys are compared by **byte order** (`lib/frac.rb`), so the UI sorts with a plain
ordinal compare, never `localeCompare`.

1. **Subjective order** — `order` on each person appearance. In *Dark* a
   character experiences events in their own order, which diverges from world
   chronology because of time travel. The "Subjektive Zeitlinie" tab drags to
   reorder; the server assigns keys.
2. **Date order** — `order` / `from_order` / `to_order` on `when`. **Scoped per
   date value**: each date has its own keyspace (the same key string may recur
   across dates), so reordering within a date can never interleave or collide
   across dates. The "Chronologie" tab picks a date and reorders within it.
3. Items have **no** order key — their timeline is derived (below).

The main event list (left) is ordered by `(season, episode, timestamp, id)`.

### Deaths and ages

A dying character is marked `death: true` on their appearance. An optional
`confirmed_age` (integer, **at most one per person** across all events) anchors a
biological-age walk along the subjective timeline: age accumulates by the
world-year difference between consecutive events, where a time-travel event uses
`from` as its own timestamp and `to` as the hand-off to the next. Events whose
needed date is missing break the chain and show as uncertain.

```yaml
persons:
- id: mikkel_nielsen
  order: F
  confirmed_age: 11
  death: true
```

### Item ownership (derived)

Items have no appearances of their own. Instead a person appearance records
transfers, and the item's timeline / current owner is **derived** from them:

```yaml
persons:
- id: jana_nielsen
  order: V
  gains: [raider]        # acquires the item here
  loses: [brief]         # drops it here → ownerless afterwards
  has:   [photo]         # observed to possess it (incomplete info)
```

- **`gains`** and **`has`** both *acquire* the item: the person holds it from that
  event forward (through their subjective events) until they `lose` it or another
  person explicitly `gains` it (a transfer — the previous owner drops it then).
- **`has`** is for observed possession where the acquisition isn't known yet. It
  feeds ownership exactly like `gains`, but is flagged with a ⚠️ on the person
  timeline until a `gains` of that item exists earlier in their subjective order.
- Only explicit `gains` by another person counts as a transfer; a `has` by
  someone else does not yank the item away.

An item's full timeline is stitched from these holding runs under two rules:

- **While the item is held, it follows its holder's subjective order** — the
  object goes where its owner goes, in the order they live it. So a carry always
  follows its gain, even across a time-travel loop (young Jonas reads the letter,
  keeps it for life, sends it as an adult: read → carry → send, not the reverse).
  A direct hand-off (one owner `loses` and the next `gains` at a shared event) is
  held the whole time, so it too keeps **custody order**, even when the transfer
  carries the item *back* in time.
- **While the item is ownerless, ordering falls back to world time.** When an
  item is dropped and later picked up by an unrelated owner, those holdings are
  disconnected; in the gap it just sits in the world. Disconnected holdings are
  ordered by the **world time** (date, then that date's order key) at which the
  next owner picks the item up — the same chronology as the Chronologie tab.
  (Michael writes the letter and dies in June; Ines is seen with it in November,
  before Jonas gains it days after — so Ines precedes Jonas, not the reverse.)

The "Subjektive Zeitlinie" tab shows, for a person, item tags on the events they
own; for an item, the ownership chain (owner per event). The "Getragene
Ereignisse" checkbox (items only) toggles the carried in-between events vs. just
the gain/lose/has points. Item and owner tags carry ↗ links that jump between the
two timelines.

### Derived views (`public/timelineCalculations.js`)

The logic behind every timeline view is a single DOM-free module, so the browser
UI (`public/app.js`) and the `bin/timeline` CLI always agree on what the data
means. Each function takes the raw `events` array (plus an id) and returns the
structure behind one view — nothing else is exported:

- `eventsInEpisodeChronology(events)` → events sorted for the main list
  `(season, episode, timestamp, id)`.
- `subjectiveEventsForPerson(events, personId)` → the person's appearances in
  their subjective order, each with the biological `age` at that point and the
  `items` held (tagged gain / lose / observed-but-unexplained).
- `itemEvents(events, itemId)` → the item's ownership chain, one row per event,
  each marked `gain` / `has` / `lose` / `carry` with the `owner` (and their age).
- `eventsForDate(events, date)` → the events on a date in their within-date order,
  each carrying the `role` (`date` / `from` / `to`) that placed it there.

`bin/timeline` prints these views from the YAML (read through the Ruby `Store`,
the one place that parses it). `test/timelineCalculations.test.js` covers them
with hand-built fixtures; run `node --test`.
