require_relative 'vm/assembler'
require_relative 'vm/operations'
require_relative 'vm/two_complement'

class VM
  attr_reader :memory, :registers, :condition_flag

  attr_accessor :pc

  def initialize
    @memory = Array.new(0xFFFF, 0)
    @registers = Array.new(8, 0)
    @pc = 0x3000
    @condition_flag = 0
  end

  def execute_instruction
    instruction = MachineCodeInstruction.new(@memory[@pc])
    operation = Operations.operation_with_opcode(instruction.opcode)
    @pc += 1
    send("execute_#{operation}", instruction)
  end

  class MachineCodeInstruction
    def initialize(instruction)
      @instruction = instruction
    end

    def opcode
      @opcode ||= value_at_bit(12, 4)
    end

    def bit_flag_set?(bit)
      (@instruction >> bit) & 1 == 1
    end

    def value_at_bit(bit, count)
      mask = (1 << count) - 1
      (@instruction >> bit) & mask
    end

    def two_complement_value_at_bit(bit, count)
      VM::TwoComplement.decode(value_at_bit(bit, count), bits: count)
    end
  end

  private

  def execute_add(instruction)
    destination_register_index = instruction.value_at_bit(9, 3)
    source_register_index = instruction.value_at_bit(6, 3)

    result = if instruction.bit_flag_set?(5)
               immediate_value = instruction.two_complement_value_at_bit(0, 5)
               @registers[source_register_index] + immediate_value
             else
               source_register2_index = instruction.value_at_bit(0, 3)
               @registers[source_register_index] + @registers[source_register2_index]
             end

    @registers[destination_register_index] = result
    update_condition_flag(result)
  end

  def update_condition_flag(result)
    @condition_flag = result <=> 0
  end
end
