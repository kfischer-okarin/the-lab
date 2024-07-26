require 'minitest/autorun'

require_relative 'db'

describe Graph do
  describe '#add_vertex' do
    it 'adds a vertex to the graph' do
      graph = Graph.new
      graph.add_vertex('A')
      graph.add_vertex('B')

      assert_equal 2, graph.vertices.size
      assert_includes graph.vertices, 'A'
      assert_includes graph.vertices, 'B'
    end
  end

  describe '#add_edge' do
    it 'adds an edge to the graph' do
      graph = Graph.new
      graph.add_vertex('A')
      graph.add_vertex('B')
      graph.add_edge('A', 'B')

      assert_equal 1, graph.edges.size
      assert_equal ['A', 'B'], graph.edges.first
    end
  end
end
