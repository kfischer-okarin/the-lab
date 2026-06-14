"use strict";

// --- state ------------------------------------------------------------------

const state = {
  persons: [], items: [], episodes: [], events: [],
  selectedId: null,
  draft: null,        // working copy of the event being edited
  subjectKey: null,   // "persons:<id>" or "items:<id>"
  dateKey: null,      // selected date in the Chronologie tab
  filter: "",
  showCarried: false  // item timeline: also show carried (non-transfer) events
};

const el = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindControls();
  await loadData();
}

async function loadData() {
  const data = await api("GET", "/api/data");
  Object.assign(state, data);
  renderAll();
}

function renderAll() {
  renderEventList();
  renderEditor();
  renderSubjectSelect();
  renderSubjectEvents();
  renderDateSelect();
  renderDateTimeline();
  renderRegistries();
}

// --- api --------------------------------------------------------------------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    flash("Fehler: " + res.status, true);
    throw new Error(await res.text());
  }
  return res.json();
}

function flash(message, isError = false) {
  const node = el("status");
  node.textContent = message;
  node.classList.toggle("error", isError);
  if (!isError) setTimeout(() => { if (node.textContent === message) node.textContent = ""; }, 1500);
}

// --- lookups ----------------------------------------------------------------

const personName = (id) => (state.persons.find((p) => p.id === id) || {}).name || id;
const itemName = (id) => (state.items.find((i) => i.id === id) || {}).name || id;

function whenLabel(when) {
  if (!when || when.kind === "unknown") return "?";
  if (when.kind === "date") return when.date || "?";
  return `${when.from || "?"} → ${when.to || "?"}`;
}

// --- event list -------------------------------------------------------------

function renderEventList() {
  const container = el("events");
  container.innerHTML = "";
  const matches = state.events.filter(matchesFilter).sort(compareEvents);
  el("event-count").textContent = `(${matches.length})`;
  for (const group of groupByEpisode(matches)) container.appendChild(episodeGroupNode(group));
}

// Order by episode then in-episode timestamp, breaking ties by event id.
function compareEvents(a, b) {
  return (a.season || 0) - (b.season || 0)
    || (a.episode || 0) - (b.episode || 0)
    || byteCompare(String(a.timestamp || "00:00"), String(b.timestamp || "00:00"))
    || byteCompare(a.id, b.id);
}

function episodeTag(event) {
  return span("episode-tag", `S${event.season || "?"}E${event.episode || "?"}`);
}

function matchesFilter(event) {
  const q = state.filter.toLowerCase();
  if (!q) return true;
  const haystack = [
    event.title,
    ...(event.persons || []).map((a) => personName(a.id)),
    ...(event.items || []).map((a) => itemName(a.id))
  ].join(" ").toLowerCase();
  return haystack.includes(q);
}

function groupByEpisode(events) {
  const groups = new Map();
  for (const event of events) {
    const key = `${event.season}-${event.episode}`;
    if (!groups.has(key)) groups.set(key, { season: event.season, episode: event.episode, events: [] });
    groups.get(key).events.push(event);
  }
  return [...groups.values()];
}

function episodeGroupNode(group) {
  const wrap = document.createElement("div");
  wrap.className = "episode-group";
  const ep = state.episodes.find((e) => e.season === group.season && e.episode === group.episode);
  const head = document.createElement("div");
  head.className = "episode-head";
  head.textContent = `S${group.season || "?"}E${group.episode || "?"} ${ep ? "· " + ep.title : ""}`;
  wrap.appendChild(head);
  for (const event of group.events) wrap.appendChild(eventRowNode(event));
  return wrap;
}

function eventRowNode(event) {
  const row = document.createElement("div");
  row.className = "event-row" + (event.id === state.selectedId ? " selected" : "");
  row.dataset.eventId = event.id;
  row.onclick = () => selectEvent(event.id);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = event.title;
  row.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.appendChild(badge(whenLabel(event.when), event.when && event.when.kind === "time_travel" ? "tt" : ""));
  if ((event.persons || []).length) meta.appendChild(badge(`${event.persons.length}P`));
  if ((event.items || []).length) meta.appendChild(badge(`${event.items.length}G`));
  if ((event.persons || []).some((p) => p.death)) meta.appendChild(badge("✝", "death"));
  if (event.missing_details) meta.appendChild(badge("Details fehlen", "missing"));
  row.appendChild(meta);
  return row;
}

function badge(text, cls = "") {
  const span = document.createElement("span");
  span.className = "badge " + cls;
  span.textContent = text;
  return span;
}

// --- editor -----------------------------------------------------------------

function selectEvent(id) {
  state.selectedId = id;
  state.draft = structuredClone(state.events.find((e) => e.id === id));
  renderEventList();
  renderEditor();
}

function newEvent() {
  state.selectedId = null;
  state.draft = {
    id: null, season: lastSeason(), episode: lastEpisode(), timestamp: "00:00", title: "",
    when: { kind: "date", date: "" }, persons: [],
    missing_details: false
  };
  renderEditor();
}

const lastSeason = () => (state.events.at(-1) || {}).season || 1;
const lastEpisode = () => (state.events.at(-1) || {}).episode || 1;

function renderEditor() {
  const form = el("editor-form");
  const empty = el("editor-empty");
  if (!state.draft) {
    form.hidden = true;
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  form.hidden = false;

  // Access fields via form.elements: `form.title` collides with the built-in
  // HTMLElement.title property and would not return the input.
  const f = form.elements;
  const d = state.draft;
  f.title.value = d.title || "";
  f.season.value = d.season || "";
  f.episode.value = d.episode || "";
  f.timestamp.value = d.timestamp || "00:00";
  f.missing_details.checked = !!d.missing_details;
  f.when_kind.value = (d.when || {}).kind || "unknown";
  f.date.value = (d.when || {}).date || "";
  f.from.value = (d.when || {}).from || "";
  f.to.value = (d.when || {}).to || "";
  syncWhenRows();

  renderAppearances("event-persons", d.persons, "persons", personName);
  el("delete-event").hidden = !d.id;
}

function syncWhenRows() {
  const kind = el("editor-form").elements.when_kind.value;
  document.querySelectorAll("[data-when]").forEach((row) => {
    row.style.display = row.dataset.when === kind ? "" : "none";
  });
}

function renderAppearances(containerId, appearances, type, nameFn) {
  const container = el(containerId);
  container.innerHTML = "";
  for (const a of appearances) container.appendChild(appearanceNode(a, type, nameFn));
}

function appearanceNode(a, type, nameFn) {
  const node = document.createElement("div");
  node.className = "appearance" + (type === "persons" ? " person" : "");

  const main = document.createElement("div");
  main.className = "appearance-main";

  const label = document.createElement("span");
  label.textContent = nameFn(a.id);
  const order = document.createElement("span");
  order.className = "order";
  order.textContent = a.order || "neu";
  label.appendChild(order);
  main.appendChild(label);

  const actions = document.createElement("span");
  actions.className = "actions";
  if (type === "persons") {
    actions.appendChild(ageInput(a));
    actions.appendChild(deathToggle(a));
  }
  actions.appendChild(iconButton("📈", "Zeitlinie zeigen", () => jumpToTimeline(type, a.id)));
  actions.appendChild(iconButton("×", "Entfernen", () => removeFrom(type, a.id), "remove"));
  main.appendChild(actions);
  node.appendChild(main);

  if (type === "persons") node.appendChild(transfersBlock(a));
  return node;
}

// Items this person gains/loses at this event. Ownership (and thus the item's
// derived timeline) follows from these.
function transfersBlock(a) {
  const wrap = document.createElement("div");
  wrap.className = "transfers";
  (a.gains || []).forEach((id) => wrap.appendChild(transferChip(a, "gains", id, "＋")));
  (a.loses || []).forEach((id) => wrap.appendChild(transferChip(a, "loses", id, "－")));
  wrap.appendChild(transferAddButton(a, "gains", "+ erhält ▾"));
  wrap.appendChild(transferAddButton(a, "loses", "+ verliert ▾"));
  return wrap;
}

function transferChip(a, field, itemId, sign) {
  const chip = span("transfer " + (field === "gains" ? "gain" : "lose"), `${sign} ${itemName(itemId)}`);
  chip.appendChild(iconButton("↗", "Zur Gegenstand-Zeitlinie", () => jumpToTimeline("items", itemId)));
  chip.appendChild(iconButton("×", "Entfernen", () => removeTransfer(a, field, itemId), "remove"));
  return chip;
}

function transferAddButton(a, field, text) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dropdown-btn small";
  btn.textContent = text;
  btn.onclick = (e) => openDropdown(e.currentTarget, transferOptions(), (id) => addTransfer(a, field, id));
  return btn;
}

// Items not already gained or lost by anyone in this event.
function transferOptions() {
  const used = new Set();
  for (const p of state.draft.persons) {
    (p.gains || []).forEach((i) => used.add(i));
    (p.loses || []).forEach((i) => used.add(i));
  }
  return availableOptions(state.items, [...used]);
}

function addTransfer(a, field, itemId) {
  if (!itemId) return;
  a[field] = a[field] || [];
  if (a[field].includes(itemId)) return;
  collectDraftFromForm();
  a[field].push(itemId);
  renderEditor();
}

function removeTransfer(a, field, itemId) {
  collectDraftFromForm();
  a[field] = (a[field] || []).filter((x) => x !== itemId);
  renderEditor();
}

// Optional confirmed age for this person at this event (at most one per person;
// the server clears it on other events when set here). Mutates the draft.
function ageInput(a) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.className = "age-input";
  input.placeholder = "Alter";
  input.title = "Bestätigtes Alter (max. eines pro Person)";
  input.value = Number.isInteger(a.confirmed_age) ? a.confirmed_age : "";
  input.onchange = () => {
    const value = parseInt(input.value, 10);
    if (Number.isInteger(value)) a.confirmed_age = value;
    else delete a.confirmed_age;
  };
  return input;
}

// Checkbox toggling whether this person dies in this event. Mutates the draft
// appearance directly, so it is captured on the next save.
function deathToggle(a) {
  const label = document.createElement("label");
  label.className = "death-toggle";
  label.title = "Stirbt hier";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = a.death === true;
  cb.onchange = () => { a.death = cb.checked; };
  label.appendChild(cb);
  label.appendChild(document.createTextNode("✝"));
  return label;
}

function iconButton(glyph, title, onClick, cls = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn " + cls;
  btn.textContent = glyph;
  btn.title = title;
  btn.onclick = onClick;
  return btn;
}

function removeFrom(field, id) {
  collectDraftFromForm();
  state.draft[field] = state.draft[field].filter((a) => a.id !== id);
  renderEditor();
}

// Pull current form field values into the draft so re-rendering the editor
// (e.g. after adding a person) never discards unsaved edits.
function collectDraftFromForm() {
  const f = el("editor-form").elements;
  const d = state.draft;
  d.title = f.title.value.trim();
  d.season = f.season.value ? Number(f.season.value) : null;
  d.episode = f.episode.value ? Number(f.episode.value) : null;
  d.timestamp = f.timestamp.value || "00:00";
  d.missing_details = f.missing_details.checked;
  d.when = buildWhen(f);
}

function buildWhen(f) {
  const kind = f.when_kind.value;
  if (kind === "date") return { kind, date: f.date.value || null };
  if (kind === "time_travel") return { kind, from: f.from.value || null, to: f.to.value || null };
  return { kind: "unknown" };
}

async function saveEvent(e) {
  e.preventDefault();
  collectDraftFromForm();
  const d = state.draft;
  const saved = d.id
    ? await api("PUT", `/api/events/${d.id}`, d)
    : await api("POST", "/api/events", d);
  await loadData();
  selectEvent(saved.id);
  flash("Gespeichert");
}

async function deleteEvent() {
  if (!state.draft || !state.draft.id) return;
  if (!confirm("Ereignis löschen?")) return;
  await api("DELETE", `/api/events/${state.draft.id}`);
  state.selectedId = null;
  state.draft = null;
  await loadData();
  flash("Gelöscht");
}

// --- add via dropdown buttons -----------------------------------------------

function addAppearance(field, id) {
  if (!id || !state.draft) return;
  if (state.draft[field].some((a) => a.id === id)) return;
  collectDraftFromForm();
  state.draft[field].push({ id, order: "" }); // server assigns the order key on save
  renderEditor();
}

function availableOptions(list, alreadyIds) {
  return list
    .filter((entry) => !alreadyIds.includes(entry.id))
    .map((entry) => ({ label: entry.name, value: entry.id }));
}

// --- floating dropdown menu --------------------------------------------------

let activeDropdown = null;

function openDropdown(anchor, options, onPick) {
  closeDropdown();
  const menu = document.createElement("div");
  menu.className = "dropdown-menu";

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Suchen…";
  search.className = "dropdown-search";
  menu.appendChild(search);

  const optionsBox = document.createElement("div");
  optionsBox.className = "dropdown-options";
  menu.appendChild(optionsBox);

  const renderOptions = (filter) => {
    const q = filter.toLowerCase();
    optionsBox.innerHTML = "";
    const visible = options.filter((o) => o.label.toLowerCase().includes(q));
    if (!visible.length) {
      const none = document.createElement("div");
      none.className = "dropdown-empty";
      none.textContent = "Nichts gefunden";
      optionsBox.appendChild(none);
      return;
    }
    for (const o of visible) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dropdown-option";
      item.textContent = o.label;
      item.onclick = () => { closeDropdown(); onPick(o.value); };
      optionsBox.appendChild(item);
    }
  };

  renderOptions("");
  search.addEventListener("input", () => renderOptions(search.value));

  document.body.appendChild(menu);
  positionMenu(menu, anchor);
  search.focus();
  setTimeout(() => document.addEventListener("mousedown", onOutsideDropdownClick), 0);
  activeDropdown = { menu, anchor };
}

function positionMenu(menu, anchor) {
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${rect.left + window.scrollX}px`;
  menu.style.minWidth = `${rect.width}px`;
}

function onOutsideDropdownClick(e) {
  if (!activeDropdown) return;
  if (activeDropdown.menu.contains(e.target) || activeDropdown.anchor.contains(e.target)) return;
  closeDropdown();
}

function closeDropdown() {
  if (!activeDropdown) return;
  activeDropdown.menu.remove();
  document.removeEventListener("mousedown", onOutsideDropdownClick);
  activeDropdown = null;
}

// --- subjective timeline (reorder) ------------------------------------------

function jumpToTimeline(type, id) {
  state.subjectKey = `${type}:${id}`;
  switchTab("timeline");
  renderSubjectSelect();
  el("subject-select").value = state.subjectKey;
  renderSubjectEvents();
}

function renderSubjectSelect() {
  const select = el("subject-select");
  const previous = state.subjectKey;
  select.innerHTML = "";
  addSubjectGroup(select, "Personen", "persons", state.persons);
  addSubjectGroup(select, "Gegenstände", "items", state.items);
  if (previous && [...select.options].some((o) => o.value === previous)) {
    select.value = previous;
  } else {
    state.subjectKey = select.value || null;
  }
}

function addSubjectGroup(select, label, type, list) {
  if (!list.length) return;
  const group = document.createElement("optgroup");
  group.label = label;
  for (const entry of list) {
    const opt = document.createElement("option");
    opt.value = `${type}:${entry.id}`;
    opt.textContent = entry.name;
    group.appendChild(opt);
  }
  select.appendChild(group);
}

// Ordinal string comparison (UTF-16 code units = byte order for these keys).
function byteCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function subjectAppearances() {
  if (!state.subjectKey) return [];
  const [type, id] = state.subjectKey.split(":");
  const rows = [];
  for (const event of state.events) {
    const appearance = (event[type] || []).find((a) => a.id === id);
    if (appearance) {
      rows.push({ event, order: appearance.order, death: appearance.death === true, confirmedAge: appearance.confirmed_age });
    }
  }
  // Sort by byte/ordinal order to match the fractional keys (and the server),
  // NOT localeCompare — that is case-insensitive/linguistic ("e" < "K") and
  // would disagree with the keys' byte order ("K" < "e").
  return rows.sort((a, b) => byteCompare(String(a.order), String(b.order)));
}

function renderSubjectEvents() {
  const list = el("subject-events");
  list.innerHTML = "";
  const [type, id] = (state.subjectKey || ":").split(":");
  // Inline display (not the `hidden` attr) because the label's display:flex
  // would override the UA [hidden]{display:none} rule. Only items carry events.
  document.querySelector(".carry-toggle").style.display = type === "items" ? "" : "none";
  if (!state.subjectKey) return;
  const model = ownershipModel();
  if (type === "persons") renderPersonTimeline(list, id, model);
  else renderItemTimeline(list, id, model);
}

// Shared row scaffold: a small date headline, the title, then a tags line.
function rowBody(index, event, tags) {
  const body = document.createElement("div");
  body.className = "row-body";

  const head = document.createElement("div");
  head.className = "row-head";
  head.appendChild(span("seq", String(index + 1)));
  head.appendChild(span("ev-when", whenLabel(event.when)));
  head.appendChild(episodeTag(event));
  body.appendChild(head);

  body.appendChild(span("ev-title", event.title));

  if (tags.length) {
    const tagRow = document.createElement("div");
    tagRow.className = "row-tags";
    tags.forEach((t) => tagRow.appendChild(t));
    body.appendChild(tagRow);
  }
  return body;
}

function renderPersonTimeline(list, personId, model) {
  const rows = subjectAppearances();
  const hasAnchor = rows.some((r) => Number.isInteger(r.confirmedAge));
  const ages = hasAnchor ? computeAges(rows) : null;
  rows.forEach((row, index) => {
    const owned = model.ownedAt[`${personId}|${row.event.id}`] || [];
    list.appendChild(personRowNode(row, index, ages ? ages[index] : null, hasAnchor, owned, personId));
  });
}

function personRowNode(row, index, age, showAge, ownedItems, personId) {
  const li = document.createElement("li");
  li.draggable = true;
  li.dataset.eventId = row.event.id;
  li.dataset.order = row.order;
  li.dataset.reorderType = "persons";
  li.dataset.reorderId = personId;
  li.appendChild(span("grip", "⠿"));

  const tags = [];
  if (showAge) tags.push(ageBadge(row, age));
  if (row.death) {
    const death = span("ev-death", "✝");
    death.title = "Tod";
    tags.push(death);
  }
  for (const itemId of ownedItems) tags.push(itemTag(itemId));
  li.appendChild(rowBody(index, row.event, tags));

  li.appendChild(openButton(row.event.id));
  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragend", onDragEnd);
  return li;
}

function renderItemTimeline(list, itemId, model) {
  let rows = model.chains[itemId] || [];
  if (!state.showCarried) rows = rows.filter((r) => r.kind === "gain" || r.kind === "lose");
  rows.forEach((row, index) => list.appendChild(itemRowNode(row, index)));
}

function itemRowNode(row, index) {
  const li = document.createElement("li");
  li.className = "item-row";
  li.dataset.eventId = row.event.id;

  const tags = [];
  if (row.kind === "gain") tags.push(span("transfer-mark gain", "＋"));
  if (row.kind === "lose") tags.push(span("transfer-mark lose", "－"));
  tags.push(row.owner ? ownerTag(row.owner) : span("ownerless", "herrenlos"));
  li.appendChild(rowBody(index, row.event, tags));

  li.appendChild(openButton(row.event.id));
  return li;
}

// --- date (world chronology) timeline ---------------------------------------

// All distinct date values across events (ISO strings sort chronologically).
function distinctDates() {
  const set = new Set();
  for (const event of state.events) {
    const w = event.when || {};
    if (w.kind === "date" && w.date) set.add(w.date);
    else if (w.kind === "time_travel") { if (w.from) set.add(w.from); if (w.to) set.add(w.to); }
  }
  return [...set].sort();
}

function renderDateSelect() {
  const select = el("date-select");
  const previous = state.dateKey;
  select.innerHTML = "";
  for (const date of distinctDates()) {
    const opt = document.createElement("option");
    opt.value = date;
    opt.textContent = date;
    select.appendChild(opt);
  }
  if (previous && [...select.options].some((o) => o.value === previous)) select.value = previous;
  else state.dateKey = select.value || null;
}

// Date points (events) occurring on the given date, in their within-date order.
function datePointsForDate(dateStr) {
  const points = [];
  for (const event of state.events) {
    const w = event.when || {};
    if (w.kind === "date" && w.date === dateStr) points.push({ event, role: "date", order: w.order });
    else if (w.kind === "time_travel") {
      if (w.from === dateStr) points.push({ event, role: "from", order: w.from_order });
      if (w.to === dateStr) points.push({ event, role: "to", order: w.to_order });
    }
  }
  return points.sort((a, b) => byteCompare(String(a.order), String(b.order)));
}

function renderDateTimeline() {
  const list = el("date-events");
  if (!list) return;
  list.innerHTML = "";
  if (!state.dateKey) return;
  datePointsForDate(state.dateKey).forEach((pt, index) => list.appendChild(datePointNode(pt, index)));
}

function datePointNode(pt, index) {
  const li = document.createElement("li");
  li.draggable = true;
  li.dataset.eventId = pt.event.id;
  li.dataset.order = pt.order || "";
  li.dataset.reorderType = "date";
  li.dataset.reorderId = pt.role;
  li.appendChild(span("grip", "⠿"));

  const body = document.createElement("div");
  body.className = "row-body";
  const head = document.createElement("div");
  head.className = "row-head";
  head.appendChild(span("seq", String(index + 1)));
  head.appendChild(episodeTag(pt.event));
  if (pt.role !== "date") head.appendChild(travelTag(pt));
  body.appendChild(head);
  body.appendChild(span("ev-title", pt.event.title));
  li.appendChild(body);

  li.appendChild(openButton(pt.event.id));
  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragend", onDragEnd);
  return li;
}

// For a time-travel event under the selected date, show the other endpoint:
// arriving here → "von <from>"; departing from here → "nach <to>".
function travelTag(pt) {
  const w = pt.event.when || {};
  return pt.role === "from"
    ? span("travel-tag nach", `nach ${w.to || "?"}`)
    : span("travel-tag von", `von ${w.from || "?"}`);
}

// A tag with a ↗ that jumps to the linked subject's timeline (both directions).
function linkTag(cls, label, jumpTitle, onJump) {
  const tag = document.createElement("span");
  tag.className = "link-tag " + cls;
  tag.appendChild(document.createTextNode(label));
  const arrow = iconButton("↗", jumpTitle, (e) => { e.stopPropagation(); onJump(); });
  arrow.draggable = false;
  arrow.addEventListener("mousedown", (e) => e.stopPropagation());
  tag.appendChild(arrow);
  return tag;
}

const itemTag = (itemId) => linkTag("item-tag", `📦 ${itemName(itemId)}`, "Zur Gegenstand-Zeitlinie", () => jumpToTimeline("items", itemId));
const ownerTag = (personId) => linkTag("owner-tag", `👤 ${personName(personId)}`, "Zur Personen-Zeitlinie", () => jumpToTimeline("persons", personId));

// --- ownership derivation ---------------------------------------------------

// Item timelines are derived from ownership. Returns each item's ordered chain
// of rows and a map of which items a person owns at a given event.
function ownershipModel() {
  const personEvents = personEventOrder();
  const gainAt = {}; // eventId -> { itemId: personId }
  const loseAt = {}; // eventId -> { itemId: personId }
  const itemIds = new Set();
  for (const event of state.events) {
    for (const p of event.persons || []) {
      for (const it of p.gains || []) { (gainAt[event.id] ||= {})[it] = p.id; itemIds.add(it); }
      for (const it of p.loses || []) { (loseAt[event.id] ||= {})[it] = p.id; itemIds.add(it); }
    }
  }
  const ownedAt = {};
  const chains = {};
  for (const itemId of itemIds) chains[itemId] = buildItemChain(itemId, personEvents, gainAt, loseAt, ownedAt);
  return { chains, ownedAt };
}

// Each person's events in their own subjective order.
function personEventOrder() {
  const map = {};
  for (const event of state.events) {
    for (const p of event.persons || []) (map[p.id] ||= []).push({ event, order: p.order });
  }
  for (const id of Object.keys(map)) {
    map[id] = map[id].sort((a, b) => byteCompare(String(a.order), String(b.order))).map((r) => r.event);
  }
  return map;
}

// Stitch ownership stretches into one ordered chain, linking at transfer events.
function buildItemChain(itemId, personEvents, gainAt, loseAt, ownedAt) {
  const segments = {}; // gainEventId -> { rows, transferEventId }
  for (const eid of Object.keys(gainAt)) {
    if (gainAt[eid][itemId]) segments[eid] = buildSegment(itemId, eid, gainAt[eid][itemId], personEvents, gainAt, loseAt);
  }
  const transferTargets = new Set(Object.values(segments).map((s) => s.transferEventId).filter(Boolean));
  const startId = Object.keys(segments).find((eid) => !transferTargets.has(eid)) || Object.keys(segments)[0];

  const rows = [];
  const visited = new Set();
  for (let cur = startId; cur && segments[cur] && !visited.has(cur); cur = segments[cur].transferEventId) {
    visited.add(cur);
    rows.push(...segments[cur].rows);
  }
  for (const eid of Object.keys(segments)) {
    if (!visited.has(eid)) rows.push(...segments[eid].rows); // disconnected fallback
  }
  for (const r of rows) if (r.owner) (ownedAt[`${r.owner}|${r.event.id}`] ||= []).push(itemId);
  return rows;
}

// One ownership stretch: the owner's events from the gain forward, until they
// lose it (inclusive, ownerless) or another person gains it (exclusive transfer).
function buildSegment(itemId, gainEventId, ownerId, personEvents, gainAt, loseAt) {
  const evs = personEvents[ownerId] || [];
  const start = evs.findIndex((e) => e.id === gainEventId);
  const rows = [];
  let transferEventId = null;
  for (let i = start; i >= 0 && i < evs.length; i++) {
    const e = evs[i];
    if (i > start && gainAt[e.id] && gainAt[e.id][itemId] && gainAt[e.id][itemId] !== ownerId) {
      transferEventId = e.id; // someone else takes it here
      break;
    }
    if (i > start && loseAt[e.id] && loseAt[e.id][itemId] === ownerId) {
      rows.push({ event: e, owner: null, kind: "lose" }); // dropped → ownerless
      break;
    }
    rows.push({ event: e, owner: ownerId, kind: i === start ? "gain" : "carry" });
  }
  return { rows, transferEventId };
}

// Opens the event in the editor and scrolls the left list to it. draggable is
// disabled and mousedown is stopped so clicking it never starts a row drag.
function openButton(eventId) {
  const btn = iconButton("↗", "Im Editor öffnen", (e) => { e.stopPropagation(); openEvent(eventId); });
  btn.draggable = false;
  btn.addEventListener("mousedown", (e) => e.stopPropagation());
  return btn;
}

function openEvent(id) {
  selectEvent(id);
  const row = document.querySelector(`#events .event-row[data-event-id="${id}"]`);
  if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
}

function ageBadge(row, age) {
  if (Number.isInteger(row.confirmedAge)) {
    const b = span("age-badge confirmed", `🔒 ${row.confirmedAge}`);
    b.title = "Bestätigtes Alter";
    return b;
  }
  if (age !== null) {
    const b = span("age-badge", `${age}`);
    b.title = "Berechnetes Alter (Jahre)";
    return b;
  }
  const b = span("age-badge unknown", "?");
  b.title = "Alter unbekannt — unsicheres/fehlendes Datum";
  return b;
}

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

// Biological years between a preceding event and the next one, or null if a
// needed date is missing (which breaks the chain past that point).
function edgeDelta(prevEvent, nextEvent) {
  const out = outYear(prevEvent);
  const inn = inYear(nextEvent);
  return out === null || inn === null ? null : inn - out;
}

// When the person experiences an event: `from` for a time-travel event.
function inYear(event) {
  const w = event.when || {};
  if (w.kind === "date") return yearOf(w.date);
  if (w.kind === "time_travel") return yearOf(w.from);
  return null;
}

// When the person leaves an event toward the next: `to` for a time-travel event.
function outYear(event) {
  const w = event.when || {};
  if (w.kind === "date") return yearOf(w.date);
  if (w.kind === "time_travel") return yearOf(w.to);
  return null;
}

function yearOf(dateStr) {
  if (!dateStr) return null;
  const year = parseInt(String(dateStr).slice(0, 4), 10);
  return Number.isNaN(year) ? null : year;
}

function span(cls, text) {
  const node = document.createElement("span");
  node.className = cls;
  node.textContent = text;
  return node;
}

let dragSourceEl = null;
let dropIndicator = null;

function onDragStart(e) {
  dragSourceEl = e.currentTarget;
  dragSourceEl.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSourceEl.dataset.eventId || ""); // Firefox requires data
}

function onDragEnd() {
  dragSourceEl = null;
  document.querySelectorAll(".reorder li.dragging").forEach((li) => li.classList.remove("dragging"));
  removeDropIndicator();
}

function onListDragOver(e) {
  if (!dragSourceEl) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  positionDropIndicator(e.currentTarget, dragAfterElement(e.currentTarget, e.clientY));
}

// Place the indicator as an absolute overlay at the drop boundary. Keeping it
// out of normal flow means it never shifts the rows, which would otherwise make
// the boundary flip back and forth (worst with only a couple of rows).
function positionDropIndicator(list, after) {
  const indicator = ensureDropIndicator();
  if (indicator.parentNode !== list) list.appendChild(indicator);
  const last = lastRow(list);
  indicator.style.top = `${after ? after.offsetTop : (last ? last.offsetTop + last.offsetHeight : 0)}px`;
}

function lastRow(list) {
  const rows = list.querySelectorAll("li[data-order]:not(.dragging)");
  return rows[rows.length - 1] || null;
}

function onListDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) removeDropIndicator();
}

async function onListDrop(e) {
  if (!dragSourceEl) return;
  e.preventDefault();
  const list = e.currentTarget;
  const after = dragAfterElement(list, e.clientY);
  const dragged = dragSourceEl;
  removeDropIndicator();
  await commitReorder(list, dragged, after);
}

// The row the dragged item should be inserted *before*, by cursor Y position
// (null = drop at the end). Only orderable rows (data-order) are candidates.
function dragAfterElement(list, y) {
  const candidates = [...list.querySelectorAll("li[data-order]:not(.dragging):not(.drop-indicator)")];
  let closest = { offset: -Infinity, element: null };
  for (const child of candidates) {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, element: child };
  }
  return closest.element;
}

function ensureDropIndicator() {
  if (!dropIndicator) {
    dropIndicator = document.createElement("li");
    dropIndicator.className = "drop-indicator";
  }
  return dropIndicator;
}

function removeDropIndicator() {
  if (dropIndicator && dropIndicator.parentNode) dropIndicator.remove();
}

// Move the dragged row before afterEl (null = end) using each row's data-order
// key. No-op if already there. Works for any .reorder list (subject + date).
async function commitReorder(list, draggedEl, afterEl) {
  const rows = [...list.querySelectorAll("li[data-order]")];
  const sourceIndex = rows.indexOf(draggedEl);
  const without = rows.filter((node) => node !== draggedEl);
  const insertAt = afterEl ? without.indexOf(afterEl) : without.length;
  if (sourceIndex === -1 || insertAt === sourceIndex) return; // dropped on its current spot

  const beforeKey = insertAt > 0 ? without[insertAt - 1].dataset.order : null;
  const afterKey = insertAt < without.length ? without[insertAt].dataset.order : null;
  const d = draggedEl.dataset;
  const { order } = await api("POST", "/api/reorder", {
    subject_type: d.reorderType, subject_id: d.reorderId, event_id: d.eventId,
    before_key: beforeKey, after_key: afterKey
  });
  applyReorderLocally(d, order);
  renderSubjectEvents();
  renderDateTimeline();
  flash("Reihenfolge aktualisiert");
}

function applyReorderLocally(d, newKey) {
  const event = state.events.find((e) => e.id === d.eventId);
  if (!event) return;
  if (d.reorderType === "persons") {
    const a = (event.persons || []).find((p) => p.id === d.reorderId);
    if (a) a.order = newKey;
  } else if (d.reorderType === "date") {
    const field = { date: "order", from: "from_order", to: "to_order" }[d.reorderId];
    (event.when || (event.when = {}))[field] = newKey;
  }
}

// --- registries -------------------------------------------------------------

function renderRegistries() {
  renderRegistryList("persons-registry", state.persons, "persons");
  renderRegistryList("items-registry", state.items, "items");
}

function renderRegistryList(containerId, list, type) {
  const ul = el(containerId);
  ul.innerHTML = "";
  for (const entry of list) ul.appendChild(registryRow(entry, type));
}

function registryRow(entry, type) {
  const li = document.createElement("li");
  const name = document.createElement("input");
  name.value = entry.name;
  name.className = "name";
  name.onchange = () => api("PUT", `/api/${type}/${entry.id}`, { name: name.value }).then(loadData);
  li.appendChild(name);
  li.appendChild(span("id", entry.id));
  li.appendChild(iconButton("×", "Löschen", () => {
    if (confirm(`"${entry.name}" löschen?`)) api("DELETE", `/api/${type}/${entry.id}`).then(loadData);
  }, "remove"));
  return li;
}

// --- controls / binding -----------------------------------------------------

function bindControls() {
  el("search").addEventListener("input", (e) => { state.filter = e.target.value; renderEventList(); });
  el("new-event").addEventListener("click", newEvent);
  el("editor-form").addEventListener("submit", saveEvent);
  el("delete-event").addEventListener("click", deleteEvent);
  el("editor-form").elements.when_kind.addEventListener("change", syncWhenRows);

  el("add-person-btn").addEventListener("click", (e) =>
    openDropdown(e.currentTarget, availableOptions(state.persons, draftIds("persons")), (id) => addAppearance("persons", id)));

  el("subject-select").addEventListener("change", (e) => { state.subjectKey = e.target.value; renderSubjectEvents(); });
  el("show-carried").addEventListener("change", (e) => { state.showCarried = e.target.checked; renderSubjectEvents(); });
  el("date-select").addEventListener("change", (e) => { state.dateKey = e.target.value; renderDateTimeline(); });

  for (const listId of ["subject-events", "date-events"]) {
    const reorderList = el(listId);
    reorderList.addEventListener("dragover", onListDragOver);
    reorderList.addEventListener("drop", onListDrop);
    reorderList.addEventListener("dragleave", onListDragLeave);
  }

  el("add-person-registry").addEventListener("click", () => addRegistry("persons", "new-person-name"));
  el("add-item-registry").addEventListener("click", () => addRegistry("items", "new-item-name"));

  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
}

function draftIds(field) {
  return state.draft ? state.draft[field].map((a) => a.id) : [];
}

async function addRegistry(type, inputId) {
  const input = el(inputId);
  const name = input.value.trim();
  if (!name) return;
  await api("POST", `/api/${type}`, { name });
  input.value = "";
  await loadData();
  flash("Angelegt");
}

function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  el("tab-timeline").hidden = name !== "timeline";
  el("tab-date").hidden = name !== "date";
  el("tab-registry").hidden = name !== "registry";
}
