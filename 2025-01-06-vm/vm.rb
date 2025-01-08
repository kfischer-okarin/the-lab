require_relative 'vm/assembler'
require_relative 'vm/operations'

class VM
  attr_reader :memory, :registers

  attr_accessor :pc

  def initialize
    @memory = Array.new(0xFFFF, 0)
    @registers = Array.new(8, 0)
    @pc = 0x3000
  end

  def execute_instruction
    @pc += 1
  end
end
