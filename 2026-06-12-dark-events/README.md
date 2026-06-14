# Dark — Ereignis-Editor

A small local editor for authoring the timeline of events in the *Dark* Netflix
series. The server (Sinatra) only reads and writes plain, diffable YAML in
`data/`; all the editing and derivation happens in the browser UI.

## Run

```sh
bundle install
bin/dev            # → http://127.0.0.1:4567
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

The "Subjektive Zeitlinie" tab shows, for a person, item tags on the events they
own; for an item, the ownership chain (owner per event). The "Getragene
Ereignisse" checkbox (items only) toggles the carried in-between events vs. just
the gain/lose/has points. Item and owner tags carry ↗ links that jump between the
two timelines.
