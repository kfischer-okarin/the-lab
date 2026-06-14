"use strict";

// --- state ------------------------------------------------------------------

const state = {
  persons: [], items: [], episodes: [], events: [],
  selectedId: null,
  draft: null,        // working copy of the event being edited
  subjectKey: null,   // "persons:<id>" or "items:<id>"
  filter: ""
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
  const matches = state.events.filter(matchesFilter);
  el("event-count").textContent = `(${matches.length})`;
  for (const group of groupByEpisode(matches)) container.appendChild(episodeGroupNode(group));
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
  if ((event.deaths || []).length) meta.appendChild(badge("✝", "death"));
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
    id: null, season: lastSeason(), episode: lastEpisode(), title: "",
    when: { kind: "date", date: "" }, persons: [], items: [], deaths: [],
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
  f.missing_details.checked = !!d.missing_details;
  f.when_kind.value = (d.when || {}).kind || "unknown";
  f.date.value = (d.when || {}).date || "";
  f.from.value = (d.when || {}).from || "";
  f.to.value = (d.when || {}).to || "";
  syncWhenRows();

  renderAppearances("event-persons", d.persons, "persons", personName);
  renderAppearances("event-items", d.items, "items", itemName);
  renderDeaths();
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
  node.className = "appearance";

  const label = document.createElement("span");
  label.textContent = nameFn(a.id);
  const order = document.createElement("span");
  order.className = "order";
  order.textContent = a.order || "neu";
  label.appendChild(order);
  node.appendChild(label);

  const actions = document.createElement("span");
  actions.className = "actions";
  actions.appendChild(iconButton("📈", "Zeitlinie zeigen", () => jumpToTimeline(type, a.id)));
  actions.appendChild(iconButton("×", "Entfernen", () => removeFrom(type, a.id), "remove"));
  node.appendChild(actions);
  return node;
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

function renderDeaths() {
  const container = el("event-deaths");
  container.innerHTML = "";
  for (const id of state.draft.deaths) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = personName(id);
    chip.appendChild(iconButton("📈", "Zeitlinie zeigen", () => jumpToTimeline("persons", id)));
    chip.appendChild(iconButton("×", "Entfernen", () => {
      state.draft.deaths = state.draft.deaths.filter((x) => x !== id);
      renderDeaths();
    }, "remove"));
    container.appendChild(chip);
  }
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

function addDeath(id) {
  if (!id || !state.draft || state.draft.deaths.includes(id)) return;
  collectDraftFromForm();
  state.draft.deaths.push(id);
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
    if (appearance) rows.push({ event, order: appearance.order });
  }
  // Sort by byte/ordinal order to match the fractional keys (and the server),
  // NOT localeCompare — that is case-insensitive/linguistic ("e" < "K") and
  // would disagree with the keys' byte order ("K" < "e").
  return rows.sort((a, b) => byteCompare(String(a.order), String(b.order)));
}

function renderSubjectEvents() {
  const list = el("subject-events");
  list.innerHTML = "";
  subjectAppearances().forEach((row, index) => list.appendChild(subjectRowNode(row, index)));
}

function subjectRowNode(row, index) {
  const [type, id] = (state.subjectKey || ":").split(":");
  const li = document.createElement("li");
  li.draggable = true;
  li.dataset.eventId = row.event.id;
  li.appendChild(span("grip", "⠿"));
  li.appendChild(span("seq", String(index + 1)));
  li.appendChild(span("ev-title", row.event.title));
  if (type === "persons" && (row.event.deaths || []).includes(id)) {
    const death = span("ev-death", "✝");
    death.title = "Tod";
    li.appendChild(death);
  }
  li.appendChild(span("ev-when", whenLabel(row.event.when)));
  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragend", onDragEnd);
  return li;
}

function span(cls, text) {
  const node = document.createElement("span");
  node.className = cls;
  node.textContent = text;
  return node;
}

let dragSourceId = null;
let dropIndicator = null;

function onDragStart(e) {
  dragSourceId = e.currentTarget.dataset.eventId;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", dragSourceId); // Firefox requires data
}

function onDragEnd() {
  dragSourceId = null;
  document.querySelectorAll("#subject-events li.dragging").forEach((li) => li.classList.remove("dragging"));
  removeDropIndicator();
}

function onListDragOver(e) {
  if (!dragSourceId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const list = el("subject-events");
  positionDropIndicator(list, dragAfterElement(list, e.clientY));
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
  const rows = list.querySelectorAll("li:not(.dragging):not(.drop-indicator)");
  return rows[rows.length - 1] || null;
}

function onListDragLeave(e) {
  if (!el("subject-events").contains(e.relatedTarget)) removeDropIndicator();
}

async function onListDrop(e) {
  if (!dragSourceId) return;
  e.preventDefault();
  const after = dragAfterElement(el("subject-events"), e.clientY);
  const beforeId = after ? after.dataset.eventId : null;
  const source = dragSourceId;
  removeDropIndicator();
  await moveSubjectEvent(source, beforeId);
}

// The row the dragged item should be inserted *before*, by cursor Y position
// (null = drop at the end). Ignores the dragged row and the indicator itself.
function dragAfterElement(list, y) {
  const candidates = [...list.querySelectorAll("li:not(.dragging):not(.drop-indicator)")];
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

// Move source to sit immediately before beforeId (null = end). Does nothing if
// that is already its position.
async function moveSubjectEvent(sourceId, beforeId) {
  const [type, subjectId] = state.subjectKey.split(":");
  const ordered = subjectAppearances();
  const sourceIndex = ordered.findIndex((r) => r.event.id === sourceId);
  const without = ordered.filter((r) => r.event.id !== sourceId);
  const insertAt = beforeId ? without.findIndex((r) => r.event.id === beforeId) : without.length;

  if (insertAt === sourceIndex) return; // dropped on its current spot

  const beforeKey = insertAt > 0 ? without[insertAt - 1].order : null;
  const afterKey = insertAt < without.length ? without[insertAt].order : null;

  const { order } = await api("POST", "/api/reorder", {
    subject_type: type, subject_id: subjectId, event_id: sourceId,
    before_key: beforeKey, after_key: afterKey
  });
  applyNewOrder(type, subjectId, sourceId, order);
  renderSubjectEvents();
  if (state.selectedId === sourceId) selectEvent(sourceId);
  flash("Reihenfolge aktualisiert");
}

function applyNewOrder(type, subjectId, eventId, order) {
  const event = state.events.find((e) => e.id === eventId);
  event[type].find((a) => a.id === subjectId).order = order;
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
  el("add-item-btn").addEventListener("click", (e) =>
    openDropdown(e.currentTarget, availableOptions(state.items, draftIds("items")), (id) => addAppearance("items", id)));
  el("add-death-btn").addEventListener("click", (e) =>
    openDropdown(e.currentTarget, availableOptions(state.persons, state.draft ? state.draft.deaths : []), addDeath));

  el("subject-select").addEventListener("change", (e) => { state.subjectKey = e.target.value; renderSubjectEvents(); });

  const subjectList = el("subject-events");
  subjectList.addEventListener("dragover", onListDragOver);
  subjectList.addEventListener("drop", onListDrop);
  subjectList.addEventListener("dragleave", onListDragLeave);

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
  el("tab-registry").hidden = name !== "registry";
}
