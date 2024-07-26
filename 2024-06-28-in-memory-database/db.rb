require 'json'
require 'set'

def load_dataset
  JSON.parse(File.read('data.json'))
end

class Graph
  def initialize
    @vertices = {}
  end

  def add_vertex(value)
    @vertices[value] = { out: Set.new }
  end

  def vertices
    @vertices.keys
  end

  def add_edge(from, to)
    @vertices[from][:out] << to
  end

  def edges
    vertices.flat_map { |vertex|
      @vertices[vertex][:out].map { |to| [vertex, to] }
    }
  end
end
