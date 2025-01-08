require_relative 'vm/assembler'

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

  module Operations
    ADD = 0b0001
  end
end
