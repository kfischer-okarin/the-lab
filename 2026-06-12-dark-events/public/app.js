"use strict";

// --- state ------------------------------------------------------------------

const state = {
  persons: [], items: [], episodes: [], events: [],
  selectedId: null,
  draft: null,        // working copy of the event being edited
  subjectKey: null,   // "persons:<id>" or "items:<id>"
  filter: ""
};

const $ = (sel) => document.querySelector(sel);
const el = (sel) => document.getElementById(sel);

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

  for (const group of groupByEpisode(matches)) {
    container.appendChild(episodeGroupNode(group));
  }
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

  const d = state.draft;
  form.title.value = d.title || "";
  form.season.value = d.season || "";
  form.episode.value = d.episode || "";
  form.missing_details.checked = !!d.missing_details;
  form.when_kind.value = (d.when || {}).kind || "unknown";
  form.date.value = (d.when || {}).date || "";
  form.from.value = (d.when || {}).from || "";
  form.to.value = (d.when || {}).to || "";
  syncWhenRows();

  renderAppearances("event-persons", d.persons, personName, "persons");
  renderAppearances("event-items", d.items, itemName, "items");
  renderDeaths();
  populateSubjectPickers();
  el("delete-event").hidden = !d.id;
}

function syncWhenRows() {
  const kind = el("editor-form").when_kind.value;
  document.querySelectorAll("[data-when]").forEach((row) => {
    row.style.display = row.dataset.when === kind ? "" : "none";
  });
}

function renderAppearances(containerId, appearances, nameFn, field) {
  const container = el(containerId);
  container.innerHTML = "";
  for (const a of appearances) {
    const node = document.createElement("div");
    node.className = "appearance";
    const label = document.createElement("span");
    label.textContent = nameFn(a.id);
    const order = document.createElement("span");
    order.className = "order";
    order.textContent = a.order || "neu";
    label.appendChild(order);
    node.appendChild(label);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.onclick = () => { removeFrom(field, a.id); };
    node.appendChild(remove);
    container.appendChild(node);
  }
}

function renderDeaths() {
  const container = el("event-deaths");
  container.innerHTML = "";
  for (const id of state.draft.deaths) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = personName(id);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.onclick = () => { state.draft.deaths = state.draft.deaths.filter((x) => x !== id); renderDeaths(); };
    chip.appendChild(remove);
    container.appendChild(chip);
  }
}

function removeFrom(field, id) {
  state.draft[field] = state.draft[field].filter((a) => a.id !== id);
  renderEditor();
}

function populateSubjectPickers() {
  fillSelect("add-person", state.persons, (p) => p.name, (p) => p.id);
  fillSelect("add-death", state.persons, (p) => p.name, (p) => p.id);
  fillSelect("add-item", state.items, (i) => i.name, (i) => i.id);
}

function fillSelect(id, list, labelFn, valueFn) {
  const select = el(id);
  select.innerHTML = "";
  for (const entry of list) {
    const opt = document.createElement("option");
    opt.value = valueFn(entry);
    opt.textContent = labelFn(entry);
    select.appendChild(opt);
  }
}

function collectDraftFromForm() {
  const form = el("editor-form");
  const d = state.draft;
  d.title = form.title.value.trim();
  d.season = form.season.value ? Number(form.season.value) : null;
  d.episode = form.episode.value ? Number(form.episode.value) : null;
  d.missing_details = form.missing_details.checked;
  d.when = buildWhen(form);
}

function buildWhen(form) {
  const kind = form.when_kind.value;
  if (kind === "date") return { kind, date: form.date.value || null };
  if (kind === "time_travel") return { kind, from: form.from.value || null, to: form.to.value || null };
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

// --- subjective timeline (reorder) ------------------------------------------

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

function subjectAppearances() {
  if (!state.subjectKey) return [];
  const [type, id] = state.subjectKey.split(":");
  const rows = [];
  for (const event of state.events) {
    const appearance = (event[type] || []).find((a) => a.id === id);
    if (appearance) rows.push({ event, order: appearance.order });
  }
  return rows.sort((a, b) => String(a.order).localeCompare(b.order));
}

function renderSubjectEvents() {
  const list = el("subject-events");
  list.innerHTML = "";
  const rows = subjectAppearances();
  rows.forEach((row, index) => list.appendChild(subjectRowNode(row, index)));
}

function subjectRowNode(row, index) {
  const li = document.createElement("li");
  li.draggable = true;
  li.dataset.eventId = row.event.id;

  li.appendChild(span("grip", "⠿"));
  li.appendChild(span("seq", String(index + 1)));
  li.appendChild(span("ev-title", row.event.title));
  li.appendChild(span("ev-when", whenLabel(row.event.when)));

  li.addEventListener("dragstart", onDragStart);
  li.addEventListener("dragover", onDragOver);
  li.addEventListener("dragleave", () => li.classList.remove("over"));
  li.addEventListener("drop", onDrop);
  li.addEventListener("dragend", () => clearDragMarkers());
  return li;
}

function span(cls, text) {
  const node = document.createElement("span");
  node.className = cls;
  node.textContent = text;
  return node;
}

let dragSourceId = null;

function onDragStart(e) {
  dragSourceId = e.currentTarget.dataset.eventId;
  e.currentTarget.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
}

function onDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add("over");
}

function clearDragMarkers() {
  document.querySelectorAll("#subject-events li").forEach((li) => li.classList.remove("over", "dragging"));
}

async function onDrop(e) {
  e.preventDefault();
  const targetId = e.currentTarget.dataset.eventId;
  clearDragMarkers();
  if (!dragSourceId || dragSourceId === targetId) return;
  await moveSubjectEvent(dragSourceId, targetId);
}

// Move dragged event to the position just before the drop target.
async function moveSubjectEvent(sourceId, targetId) {
  const [type, subjectId] = state.subjectKey.split(":");
  const ordered = subjectAppearances().filter((r) => r.event.id !== sourceId);
  const targetIndex = ordered.findIndex((r) => r.event.id === targetId);

  const beforeKey = targetIndex > 0 ? ordered[targetIndex - 1].order : null;
  const afterKey = ordered[targetIndex] ? ordered[targetIndex].order : null;

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
  const appearance = event[type].find((a) => a.id === subjectId);
  appearance.order = order;
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
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "×";
  remove.onclick = () => {
    if (confirm(`"${entry.name}" löschen?`)) api("DELETE", `/api/${type}/${entry.id}`).then(loadData);
  };
  li.appendChild(remove);
  return li;
}

// --- controls / binding -----------------------------------------------------

function bindControls() {
  el("search").addEventListener("input", (e) => { state.filter = e.target.value; renderEventList(); });
  el("new-event").addEventListener("click", newEvent);
  el("editor-form").addEventListener("submit", saveEvent);
  el("delete-event").addEventListener("click", deleteEvent);
  el("editor-form").when_kind.addEventListener("change", syncWhenRows);

  el("add-person-btn").addEventListener("click", () => addAppearance("persons", el("add-person").value));
  el("add-item-btn").addEventListener("click", () => addAppearance("items", el("add-item").value));
  el("add-death-btn").addEventListener("click", addDeath);

  el("subject-select").addEventListener("change", (e) => { state.subjectKey = e.target.value; renderSubjectEvents(); });

  el("add-person-registry").addEventListener("click", () => addRegistry("persons", "new-person-name"));
  el("add-item-registry").addEventListener("click", () => addRegistry("items", "new-item-name"));

  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
}

function addAppearance(field, id) {
  if (!id || !state.draft) return;
  if (state.draft[field].some((a) => a.id === id)) return;
  state.draft[field].push({ id, order: "" });   // server assigns the order key on save
  renderEditor();
}

function addDeath() {
  const id = el("add-death").value;
  if (!id || !state.draft || state.draft.deaths.includes(id)) return;
  state.draft.deaths.push(id);
  renderDeaths();
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
