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

// Pure view models (DOM-free, shared with bin/timeline); see timelineCalculations.js.
const { eventsInEpisodeChronology, subjectiveEventsForPerson, itemEvents, eventsForDate } = TimelineCalculations;

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

// A clickable rendering of a `when`: each concrete date jumps to that date's
// world chronology. Mirrors whenLabel's text, with the dates as links.
function whenLabelNode(when) {
  const wrap = span("ev-when", "");
  if (!when || when.kind === "unknown") { wrap.textContent = "?"; return wrap; }
  if (when.kind === "date") { wrap.appendChild(dateJump(when.date)); return wrap; }
  wrap.appendChild(dateJump(when.from));
  wrap.appendChild(document.createTextNode(" → "));
  wrap.appendChild(dateJump(when.to));
  return wrap;
}

function dateJump(dateStr) {
  if (!dateStr) return document.createTextNode("?");
  const link = span("date-link", dateStr);
  link.title = "Chronologie zu diesem Datum";
  link.onclick = (e) => { e.stopPropagation(); jumpToDate(dateStr); };
  return link;
}

// The single date a `when` jumps to from a compact badge (time travel: the
// departure point), or null when there is no concrete date.
function primaryDate(when) {
  if (!when) return null;
  if (when.kind === "date") return when.date || null;
  if (when.kind === "time_travel") return when.from || when.to || null;
  return null;
}

// --- event list -------------------------------------------------------------

function renderEventList() {
  const container = el("events");
  container.innerHTML = "";
  const matches = eventsInEpisodeChronology(state.events.filter(matchesFilter));
  el("event-count").textContent = `(${matches.length})`;
  for (const group of groupByEpisode(matches)) container.appendChild(episodeGroupNode(group));
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
  row.className = "event-row" + (event.id === state.selectedId ? " selected" : "") + (event.implied ? " implied" : "");
  row.dataset.eventId = event.id;
  row.onclick = () => selectEvent(event.id);

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = event.title;
  row.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.appendChild(whenBadge(event));
  if ((event.persons || []).length) meta.appendChild(badge(`${event.persons.length}P`));
  if ((event.items || []).length) meta.appendChild(badge(`${event.items.length}G`));
  if ((event.persons || []).some((p) => p.death)) meta.appendChild(badge("✝", "death"));
  if (event.implied) meta.appendChild(badge("implizit", "implied"));
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

// The date/time-travel badge in the event list; clickable when it has a concrete
// date, jumping to that date's world chronology instead of selecting the event.
function whenBadge(event) {
  const when = event.when;
  const b = badge(whenLabel(when), when && when.kind === "time_travel" ? "tt" : "");
  const date = primaryDate(when);
  if (date) {
    b.classList.add("clickable");
    b.title = "Chronologie zu diesem Datum";
    b.onclick = (e) => { e.stopPropagation(); jumpToDate(date); };
  }
  return b;
}

// --- editor -----------------------------------------------------------------

function selectEvent(id) {
  state.selectedId = id;
  state.draft = structuredClone(state.events.find((e) => e.id === id));
  renderEventList();
  renderEditor();
}

function newEvent() {
  const latest = latestEvent();
  state.selectedId = null;
  state.draft = {
    id: null,
    season: (latest && latest.season) || 1,
    episode: (latest && latest.episode) || 1,
    timestamp: "00:00", title: "",
    when: defaultWhen(latest), persons: [],
    implied: false, missing_details: false
  };
  renderEditor();
}

// The latest event in episode chronology (season, episode, then timestamp),
// whose season/episode/date seed a new event so consecutive entries share them.
function latestEvent() {
  return eventsInEpisodeChronology(state.events).at(-1) || null;
}

// Seed the new event's date from the latest event: its date, or a time-travel
// arrival (falling back to departure), else an empty date field.
function defaultWhen(latest) {
  const w = (latest && latest.when) || {};
  if (w.kind === "date" && w.date) return { kind: "date", date: w.date };
  if (w.kind === "time_travel") return { kind: "date", date: w.to || w.from || "" };
  return { kind: "date", date: "" };
}

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
  f.implied.checked = !!d.implied;
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
  appearances.forEach((a, index) => container.appendChild(appearanceNode(a, type, nameFn, index)));
}

function appearanceNode(a, type, nameFn, index) {
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
    actions.appendChild(ageControl(a));
    actions.appendChild(deathToggle(a));
    // A person can appear twice in one event (e.g. their younger and older
    // self); each appearance is its own subjective-timeline slot.
    actions.appendChild(iconButton("⧉", "Weiteres Auftreten (z. B. anderes Ich)", () => addAppearance("persons", a.id)));
  }
  actions.appendChild(iconButton("📈", "Zeitlinie zeigen", () => jumpToTimeline(type, a.id)));
  actions.appendChild(iconButton("×", "Entfernen", () => removeFrom(type, index), "remove"));
  main.appendChild(actions);
  node.appendChild(main);

  if (type === "persons") node.appendChild(transfersBlock(a));
  return node;
}

// Items this person gains / loses / is observed to have at this event. Ownership
// (and the item's derived timeline) follows from these; `has` acquires it too,
// just flagged until an earlier gains explains it.
function transfersBlock(a) {
  const wrap = document.createElement("div");
  wrap.className = "transfers";
  const FIELDS = [["gains", "gain", "＋"], ["loses", "lose", "－"], ["has", "has", "?"]];
  for (const [field, cls, sign] of FIELDS) {
    (a[field] || []).forEach((id) => wrap.appendChild(transferChip(a, field, cls, id, sign)));
  }
  wrap.appendChild(transferAddButton(a, "gains", "+ erhält ▾"));
  wrap.appendChild(transferAddButton(a, "loses", "+ verliert ▾"));
  wrap.appendChild(transferAddButton(a, "has", "+ hat ▾"));
  return wrap;
}

function transferChip(a, field, cls, itemId, sign) {
  const chip = span("transfer " + cls, `${sign} ${itemName(itemId)}`);
  chip.appendChild(iconButton("↗", "Zur Gegenstand-Zeitlinie", () => jumpToTimeline("items", itemId)));
  chip.appendChild(iconButton("×", "Entfernen", () => removeTransfer(a, field, itemId), "remove"));
  return chip;
}

function transferAddButton(a, field, text) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dropdown-btn small";
  btn.textContent = text;
  btn.onclick = (e) => openDropdown(e.currentTarget, transferOptions(field, a), (id) => addTransfer(a, field, id));
  return btn;
}

// For gains/loses: items not gained/lost by anyone else in this event (ownership
// is exclusive). For has: items this person isn't already observed with.
function transferOptions(field, a) {
  if (field === "has") return availableOptions(state.items, a.has || []);
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

// The appearance being age-edited inline (kept off the draft object so it never
// leaks into the saved YAML).
let editingAge = null;

// Age control for a person appearance: a tag showing the confirmed age (amber,
// matching the subjective timeline), the computed age (blue), or unknown; the ✎
// switches it to an inline input.
function ageControl(a) {
  return editingAge === a ? ageEditor(a) : ageDisplayTag(a);
}

function ageDisplayTag(a) {
  const { value, confirmed } = appearanceAge(a);
  const cls = confirmed ? "age-tag confirmed" : value !== null ? "age-tag" : "age-tag unknown";
  const tag = span(cls, confirmed ? `🔒 ${value}` : value !== null ? `${value}` : "?");
  tag.title = confirmed ? "Bestätigtes Alter" : value !== null ? "Berechnetes Alter" : "Alter unbekannt — bei neuem Auftreten erst nach dem Speichern";
  tag.appendChild(iconButton("✎", "Alter bearbeiten", () => { editingAge = a; renderEditor(); }));
  return tag;
}

function ageEditor(a) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.className = "age-input";
  input.placeholder = "Alter";
  input.value = Number.isInteger(a.confirmed_age) ? a.confirmed_age : "";
  const commit = () => {
    if (editingAge !== a) return;
    setConfirmedAge(a, parseInt(input.value, 10));
    editingAge = null;
    renderEditor();
  };
  input.onkeydown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") { editingAge = null; renderEditor(); }
  };
  input.onblur = commit;
  setTimeout(() => input.focus(), 0);
  return input;
}

// At most one explicit age per person: setting one clears this person's other
// draft appearances (the server enforces the same across all events on save).
function setConfirmedAge(a, value) {
  if (!Number.isInteger(value)) { delete a.confirmed_age; return; }
  a.confirmed_age = value;
  for (const other of state.draft.persons) {
    if (other !== a && other.id === a.id) delete other.confirmed_age;
  }
}

// Age of a draft appearance for the editor: the explicit confirmed age (amber)
// if set, else the age computed along this person's saved subjective timeline.
// A freshly added appearance (no order yet) reads as unknown until saved.
function appearanceAge(a) {
  if (Number.isInteger(a.confirmed_age)) return { value: a.confirmed_age, confirmed: true };
  if (!state.draft || !state.draft.id || !a.order) return { value: null, confirmed: false };
  const age = TimelineCalculations.ageOnTimeline(state.events, a.id,
    (r) => r.event.id === state.draft.id && String(r.order) === String(a.order));
  return { value: age, confirmed: false };
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

// Remove one appearance by its position, not by id — a person can appear more
// than once, so filtering by id would drop every instance of them.
function removeFrom(field, index) {
  collectDraftFromForm();
  const [removed] = state.draft[field].splice(index, 1);
  if (editingAge === removed) editingAge = null;
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
  d.implied = f.implied.checked;
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

// Duplicates are allowed: the "+ Person" dropdown already hides people who are
// present, so a repeat only comes from the explicit "weiteres Auftreten" button.
function addAppearance(field, id) {
  if (!id || !state.draft) return;
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

// Open the world chronology for a date and select it in the Chronologie tab.
// Only saved dates have a chronology, so an unsaved draft date just reports back.
function jumpToDate(dateStr) {
  if (!dateStr) return;
  switchTab("date");
  if (!distinctDates().includes(dateStr)) {
    flash("Kein gespeichertes Ereignis an diesem Datum");
    return;
  }
  state.dateKey = dateStr;
  renderDateSelect();
  el("date-select").value = dateStr;
  renderDateTimeline();
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

function renderSubjectEvents() {
  const list = el("subject-events");
  list.innerHTML = "";
  const [type, id] = (state.subjectKey || ":").split(":");
  // Inline display (not the `hidden` attr) because the label's display:flex
  // would override the UA [hidden]{display:none} rule. Only items carry events.
  document.querySelector(".carry-toggle").style.display = type === "items" ? "" : "none";
  if (!state.subjectKey) return;
  if (type === "persons") renderPersonTimeline(list, id);
  else renderItemTimeline(list, id);
}

// Shared row scaffold: a small date headline, the title, then a tags line.
function rowBody(index, event, tags) {
  const body = document.createElement("div");
  body.className = "row-body";

  const head = document.createElement("div");
  head.className = "row-head";
  head.appendChild(span("seq", String(index + 1)));
  head.appendChild(whenLabelNode(event.when));
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

function renderPersonTimeline(list, personId) {
  const rows = subjectiveEventsForPerson(state.events, personId);
  const hasAnchor = rows.some((r) => Number.isInteger(r.confirmedAge));
  rows.forEach((row, index) => {
    list.appendChild(personRowNode(row, index, row.age, hasAnchor, row.items, personId));
  });
}

function personRowNode(row, index, age, showAge, itemTags, personId) {
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
  for (const t of itemTags) tags.push(personItemTag(t));
  li.appendChild(rowBody(index, row.event, tags));

  li.appendChild(openButton(row.event.id));
  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragend", onDragEnd);
  return li;
}

function renderItemTimeline(list, itemId) {
  let rows = itemEvents(state.events, itemId);
  if (!state.showCarried) rows = rows.filter((r) => r.kind !== "carry"); // keep gain/has/lose
  rows.forEach((row, index) => list.appendChild(itemRowNode(row, index)));
}

function itemRowNode(row, index) {
  const li = document.createElement("li");
  li.className = "item-row";
  li.dataset.eventId = row.event.id;

  const tags = [];
  if (row.kind === "gain") tags.push(span("transfer-mark gain", "＋"));
  if (row.kind === "has") tags.push(span("transfer-mark has", "＋?")); // acquisition unknown
  if (row.kind === "lose") tags.push(span("transfer-mark lose", "－"));
  tags.push(row.owner
    ? ownerTag(row.owner, row.ownerAge)
    : span("ownerless", "herrenlos"));
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

function renderDateTimeline() {
  const list = el("date-events");
  if (!list) return;
  list.innerHTML = "";
  if (!state.dateKey) return;
  eventsForDate(state.events, state.dateKey).forEach((pt, index) => list.appendChild(datePointNode(pt, index)));
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

// One item on a person row: ＋ when gained here, － when lost here, ⚠️ when
// observed but unexplained, else a plain "carries it" tag.
function personItemTag(t) {
  if (t.lose) return linkTag("item-tag lose", `－ 📦 ${itemName(t.item)}`, "Zur Gegenstand-Zeitlinie", () => jumpToTimeline("items", t.item));
  if (t.gain) return linkTag("item-tag gain", `＋ 📦 ${itemName(t.item)}`, "Zur Gegenstand-Zeitlinie", () => jumpToTimeline("items", t.item));
  if (t.warn) return hasTag(t.item, true);
  return itemTag(t.item);
}

// Owner of an item at one of its timeline rows, annotated with the owner's age
// at that moment so younger/older selves read apart.
function ownerTag(personId, age) {
  const label = age === null || age === undefined ? `👤 ${personName(personId)}` : `👤 ${personName(personId)} (${age})`;
  return linkTag("owner-tag", label, "Zur Personen-Zeitlinie", () => jumpToTimeline("persons", personId));
}

// Observed possession; the ⚠️ flags it as unexplained (no earlier gains).
const hasTag = (itemId, warn) => linkTag(
  `has-tag${warn ? " warn" : ""}`,
  `${warn ? "⚠️ " : ""}📦 ${itemName(itemId)}`,
  "Zur Gegenstand-Zeitlinie",
  () => jumpToTimeline("items", itemId)
);

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
    before_key: beforeKey, after_key: afterKey, current_key: d.order
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
    // Pin the dragged appearance by its current key, not just its id — the same
    // person may hold two slots (younger/older self) in this timeline.
    const a = (event.persons || []).find((p) => p.id === d.reorderId && String(p.order) === String(d.order));
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

  document.querySelectorAll(".jump-date").forEach((btn) =>
    btn.addEventListener("click", () => jumpToDate(el("editor-form").elements[btn.dataset.dateField].value)));

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
