require 'json'

def load_dataset
  JSON.parse(File.read('data.json'))
end

class Graph
  def initialize
    @vertices = {}
  end

  def add_vertex(value)
    @vertices[value] = []
  end

  def vertices
    @vertices.keys
  end
end
