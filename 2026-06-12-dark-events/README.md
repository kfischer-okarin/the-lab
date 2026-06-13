# Dark — Ereignis-Editor

A small local editor for authoring the timeline of events in the *Dark* Netflix
series. The server (Sinatra) only reads and writes plain, diffable YAML in
`data/`; all the editing happens in the browser UI.

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
- **`events.yml`** — the events. Each references persons/items by id.

### Subjective order via fractional keys

In *Dark*, each character experiences events in their own order, which diverges
from world chronology because of time travel. Every person/item *appearance* on
an event carries an `order` key:

```yaml
persons:
- id: jonas_kahnwald
  order: K          # fractional index — sorts within Jonas's personal timeline
```

These are **fractional-index keys** (`lib/frac.rb`): inserting or reordering one
appearance mints a key *between* its neighbours, so only the moved row changes —
diffs stay tiny and no mass renumbering happens. The "Subjektive Zeitlinie" panel
lets you drag to reorder; the server assigns the keys.

`when` is one of: `{kind: date, date: …}`, `{kind: time_travel, from: …, to: …}`
(either bound may be null = unknown), or `{kind: unknown}`. `missing_details:
true` flags an event that still needs research.

## Migration

`scripts/migrate.rb` converts the original flat `events.yml` (sparse integer
indices) into the normalized `data/` files, preserving each subject's order.
Already run; kept for reference.
