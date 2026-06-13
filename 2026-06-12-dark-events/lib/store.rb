# frozen_string_literal: true

require "yaml"
require_relative "frac"
require_relative "slug"

# Reads and writes the normalized Dark dataset (persons, items, episodes,
# events) as plain, diffable YAML files under data/. The server is a thin
# wrapper around this; all domain logic lives here.
class Store
  FILES = { persons: "persons.yml", items: "items.yml", episodes: "episodes.yml", events: "events.yml" }.freeze

  def initialize(data_dir)
    @data_dir = data_dir
  end

  def all
    { persons: persons, items: items, episodes: episodes, events: events }
  end

  def persons = load(:persons, "persons")
  def items = load(:items, "items")
  def episodes = load(:episodes, "episodes")
  def events = load(:events, "events")

  # --- events ---------------------------------------------------------------

  def create_event(attrs)
    list = events
    event = blank_event(next_event_id(list)).merge(sanitize_event(attrs))
    list << event
    assign_missing_orders(list)
    save(:events, "events", list)
    event
  end

  def update_event(id, attrs)
    list = events
    index = list.index { |e| e["id"] == id } or return nil
    list[index] = list[index].merge(sanitize_event(attrs)).merge("id" => id)
    assign_missing_orders(list)
    save(:events, "events", list)
    list[index]
  end

  def delete_event(id)
    list = events
    removed = list.reject! { |e| e["id"] == id }
    return nil if removed.nil?

    save(:events, "events", list)
    id
  end

  # Move a subject's appearance to sit between two fractional keys.
  # subject_type is "persons" or "items".
  def reorder(subject_type:, subject_id:, event_id:, before_key:, after_key:)
    new_key = Frac.key_between(before_key, after_key)
    list = events
    event = list.find { |e| e["id"] == event_id } or return nil
    appearance = (event[subject_type] || []).find { |a| a["id"] == subject_id } or return nil
    appearance["order"] = new_key
    save(:events, "events", list)
    new_key
  end

  # --- registries -----------------------------------------------------------

  def create_person(name) = create_registry_entry(:persons, "persons", name, "aliases" => [])
  def update_person(id, attrs) = update_registry_entry(:persons, "persons", id, attrs)
  def delete_person(id) = delete_registry_entry(:persons, "persons", id)

  def create_item(name) = create_registry_entry(:items, "items", name)
  def update_item(id, attrs) = update_registry_entry(:items, "items", id, attrs)
  def delete_item(id) = delete_registry_entry(:items, "items", id)

  private

  def create_registry_entry(file, key, name, extra = {})
    list = load(file, key)
    id = unique_id(Slug.from(name), list)
    entry = { "id" => id, "name" => name }.merge(extra)
    list << entry
    save(file, key, list.sort_by { |e| e["id"] })
    entry
  end

  def update_registry_entry(file, key, id, attrs)
    list = load(file, key)
    entry = list.find { |e| e["id"] == id } or return nil
    entry["name"] = attrs["name"] if attrs.key?("name")
    entry["aliases"] = Array(attrs["aliases"]) if attrs.key?("aliases")
    save(file, key, list)
    entry
  end

  def delete_registry_entry(file, key, id)
    list = load(file, key)
    list.reject! { |e| e["id"] == id } or return nil
    save(file, key, list)
    id
  end

  def unique_id(base, list)
    return base unless list.any? { |e| e["id"] == base }

    suffix = 2
    suffix += 1 while list.any? { |e| e["id"] == "#{base}_#{suffix}" }
    "#{base}_#{suffix}"
  end

  # Any persons/items appearance added without an order key is appended to the
  # end of that subject's subjective sequence, so the UI never has to mint keys.
  def assign_missing_orders(list)
    %w[persons items].each do |field|
      max_key = Hash.new("")
      list.each do |event|
        (event[field] || []).each do |a|
          max_key[a["id"]] = a["order"] if a["order"].to_s > max_key[a["id"]]
        end
      end
      list.each do |event|
        (event[field] || []).each do |a|
          next unless a["order"].to_s.empty?

          a["order"] = Frac.key_between(max_key[a["id"]], nil)
          max_key[a["id"]] = a["order"]
        end
      end
    end
  end

  def blank_event(id)
    {
      "id" => id, "season" => nil, "episode" => nil, "title" => "(neues Ereignis)",
      "when" => { "kind" => "unknown" }, "persons" => [], "items" => [],
      "deaths" => [], "missing_details" => false
    }
  end

  def sanitize_event(attrs)
    out = {}
    %w[season episode title when persons items deaths missing_details].each do |k|
      out[k] = attrs[k] if attrs.key?(k)
    end
    out
  end

  def next_event_id(list)
    max = list.map { |e| e["id"].to_s[/\d+/].to_i }.max || 0
    format("ev-%04d", max + 1)
  end

  def load(file, key)
    path = path_for(file)
    return [] unless File.exist?(path)

    (YAML.safe_load_file(path) || {})[key] || []
  end

  def save(file, key, list)
    tmp = "#{path_for(file)}.tmp"
    File.write(tmp, YAML.dump({ key => list }, line_width: -1))
    File.rename(tmp, path_for(file))
  end

  def path_for(file) = File.join(@data_dir, FILES.fetch(file))
end
