# frozen_string_literal: true

# Turn a human name into a stable id slug (used for persons and items).
module Slug
  TRANSLITERATIONS = {
    "ä" => "ae", "ö" => "oe", "ü" => "ue", "ß" => "ss",
    "Ä" => "ae", "Ö" => "oe", "Ü" => "ue"
  }.freeze

  module_function

  def from(name)
    slug = name.to_s.strip.downcase
    TRANSLITERATIONS.each { |from, to| slug = slug.gsub(from.downcase, to) }
    slug = slug.gsub(/[^a-z0-9]+/, "_").gsub(/^_+|_+$/, "")
    slug.empty? ? "item" : slug
  end
end
