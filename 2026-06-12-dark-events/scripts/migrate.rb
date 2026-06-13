# frozen_string_literal: true

# One-time migration: read the original flat events.yml and emit the normalized
# split files in data/ (persons.yml, items.yml, episodes.yml, events.yml).
#
# The legacy per-person / per-item integer indices encode each subject's
# *subjective* order of events. We preserve that order and replace the sparse
# integers with fractional-index keys (see lib/frac.rb).

require "yaml"
require "date"
require_relative "../lib/frac"
require_relative "../lib/slug"

ROOT = File.expand_path("..", __dir__)
SOURCE = File.join(ROOT, "events.yml")
DATA_DIR = File.join(ROOT, "data")

def main
  raw = YAML.safe_load_file(SOURCE, permitted_classes: [Date])
  items_registry = build_items_registry(raw["items"])
  persons_registry = {}
  episodes = []
  events = []

  raw["episodes"].each do |ep|
    episodes << { "season" => ep["season"], "episode" => ep["episode"], "title" => ep["title"] }
    (ep["events"] || []).each do |ev|
      events << parse_event(ev, ep, persons_registry, items_registry)
    end
  end

  assign_subjective_order(events, "persons")
  assign_subjective_order(events, "items")

  write_files(persons_registry, items_registry, episodes, events)
end

def build_items_registry(items)
  registry = {}
  (items || []).each do |entry|
    key, name = entry.first
    registry[key] = { "id" => key, "name" => name }
  end
  registry
end

def parse_event(ev, episode, persons, items)
  event = {
    "id" => format("ev-%04d", ev["id"]),
    "season" => episode["season"],
    "episode" => episode["episode"],
    "title" => event_title(ev),
    "when" => parse_when(ev),
    "persons" => parse_persons(ev, persons),
    "items" => parse_items(ev, items),
    "deaths" => parse_deaths(ev["deaths"], persons),
    "missing_details" => ev["missing_details"] ? true : false
  }
  event
end

def event_title(ev)
  return ev["title"] if ev["title"]

  if (gi = ev["get_item"])
    return "#{gi['owner']} erhält #{gi['item']}"
  end

  "(ohne Titel)"
end

def parse_when(ev)
  if (tt = ev["time_travel"])
    return {
      "kind" => "time_travel",
      "from" => date_or_nil(tt["from"]),
      "to" => date_or_nil(tt["to"])
    }
  end

  if ev["date"]
    return { "kind" => "date", "date" => ev["date"].to_s }
  end

  { "kind" => "unknown" }
end

def date_or_nil(value)
  return nil if value.nil? || value.to_s.strip == "???"

  value.to_s
end

# Persons appear either as {"Name" => index} or as a bare "Name" string.
# We collect a temporary :legacy index so the order can be reconstructed before
# fractional keys are assigned.
def parse_persons(ev, persons)
  appearances = []
  Array(ev["persons"]).each do |entry|
    name, legacy = name_and_index(entry)
    persons[Slug.from(name)] ||= { "id" => Slug.from(name), "name" => name, "aliases" => [] }
    appearances << { "id" => Slug.from(name), :legacy => legacy }
  end

  if (gi = ev["get_item"]) && gi["owner"]
    owner = gi["owner"]
    persons[Slug.from(owner)] ||= { "id" => Slug.from(owner), "name" => owner, "aliases" => [] }
    appearances << { "id" => Slug.from(owner), :legacy => nil }
  end
  appearances
end

def parse_items(ev, items)
  appearances = []
  Array(ev["items"]).each do |entry|
    key, legacy = name_and_index(entry)
    items[key] ||= { "id" => key, "name" => key }
    appearances << { "id" => key, :legacy => legacy }
  end

  if (gi = ev["get_item"]) && gi["item"]
    key = gi["item"]
    items[key] ||= { "id" => key, "name" => key }
    appearances << { "id" => key, :legacy => nil }
  end
  appearances
end

def parse_deaths(deaths, persons)
  Array(deaths).map do |name|
    persons[Slug.from(name)] ||= { "id" => Slug.from(name), "name" => name, "aliases" => [] }
    Slug.from(name)
  end
end

def name_and_index(entry)
  return [entry, nil] if entry.is_a?(String)

  entry.first # [name/key, index]
end

# Replace legacy integer indices with fractional keys per subject, preserving
# order. Numbered appearances sort by their integer; un-numbered ones trail in
# event order.
def assign_subjective_order(events, field)
  by_subject = Hash.new { |h, k| h[k] = [] }
  events.each_with_index do |event, event_index|
    event[field].each do |appearance|
      by_subject[appearance["id"]] << { appearance: appearance, event_index: event_index }
    end
  end

  by_subject.each_value do |entries|
    ordered = entries.sort_by do |e|
      [e[:appearance][:legacy].nil? ? 1 : 0, e[:appearance][:legacy] || 0, e[:event_index]]
    end
    keys = Frac.initial_keys(ordered.length)
    ordered.each_with_index do |e, i|
      e[:appearance]["order"] = keys[i]
      e[:appearance].delete(:legacy)
    end
  end
end

def write_files(persons, items, episodes, events)
  Dir.mkdir(DATA_DIR) unless Dir.exist?(DATA_DIR)
  dump(File.join(DATA_DIR, "persons.yml"), "persons" => persons.values.sort_by { |p| p["id"] })
  dump(File.join(DATA_DIR, "items.yml"), "items" => items.values.sort_by { |i| i["id"] })
  dump(File.join(DATA_DIR, "episodes.yml"), "episodes" => episodes)
  dump(File.join(DATA_DIR, "events.yml"), "events" => events)
  puts "Wrote #{persons.size} persons, #{items.size} items, #{episodes.size} episodes, #{events.size} events."
end

def dump(path, data)
  File.write(path, YAML.dump(data, line_width: -1))
end

main
