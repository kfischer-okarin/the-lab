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
    operation = Operations.operation_with_opcode(@memory[@pc] >> 12)
    send("execute_#{operation}")
    @pc += 1
  end

  private

  def execute_add
    destination_register_index = bits(9, 3)
    source_register_index = bits(6, 3)

    result = if bits(5, 1) == 1
               immediate_value = bits(0, 5)
               @registers[source_register_index] + immediate_value
             else
               source_register2_index = bits(0, 3)
               @registers[source_register_index] + @registers[source_register2_index]
             end

    @registers[destination_register_index] = result
  end

  def bits(bit, count)
    mask = (1 << count) - 1
    (@memory[@pc] >> bit) & mask
  end
end
