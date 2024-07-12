VERTICES = (1..15).to_a
# Parents of 1 are 2 and 3, parents of 2 are 4 and 5, etc.
EDGES = (1..7).flat_map { |i| [[i, 2*i], [i, (2*i)+1]] }

def parents(vertices)
  EDGES.reduce([]) { |result, (parent, child)|
    result << parent if vertices.include? child
    result
  }
end

def children(vertices)
  EDGES.reduce([]) { |result, (parent, child)|
    result << child if vertices.include? parent
    result
  }
end

puts children(children(children(parents(parents(parents([8]))))))
