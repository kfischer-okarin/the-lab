require 'minitest/autorun'

require_relative 'vm'

describe VM do
  let(:vm) { VM.new }

  it 'has a memory size of 65535' do
    assert_equal 65_535, vm.memory.size
  end

  it 'has 8 registers' do
    assert_equal 8, vm.registers.size
  end

  describe 'executing one instruction' do
    let(:a_valid_instruction) { VM::Assembler.process('ADD R2 R0 R1;') }

    it 'increments the program counter' do
      vm.pc = 0x4000
      vm.memory[0x4000] = a_valid_instruction

      vm.execute_instruction

      assert_equal 0x4001, vm.pc
    end
  end

  describe 'instruction ADD' do
    it 'can add two registers' do
      vm.registers[0] = 1
      vm.registers[1] = 2
      vm.pc = 0x3000
      vm.memory[0x3000] = VM::Assembler.process('ADD R2 R0 R1;')

      vm.execute_instruction

      assert_equal 3, vm.registers[2]
    end

    it 'can add a register and an immediate value' do
      vm.registers[0] = 1
      vm.pc = 0x3000
      vm.memory[0x3000] = VM::Assembler.process('ADD R2 R0 3;')

      vm.execute_instruction

      assert_equal 4, vm.registers[2]
    end

    it 'can add a register and a negative immediate value' do
      vm.registers[0] = 1
      vm.pc = 0x3000
      vm.memory[0x3000] = VM::Assembler.process('ADD R2 R0 -3;')

      vm.execute_instruction

      assert_equal(-2, vm.registers[2])
    end

    [
      ['zero', 1, -1, 0],
      ['positive', 1, 1, 1],
      ['negative', -1, -1, -1]
    ].each do |description, operand1, operand2, expected|
      it "sets the condition flag to #{expected} if the result is #{description}" do
        vm.registers[0] = operand1
        vm.registers[1] = operand2
        vm.pc = 0x3000
        vm.memory[0x3000] = VM::Assembler.process('ADD R2 R0 R1;')

        vm.execute_instruction

        assert_equal expected, vm.condition_flag
      end
    end
  end
end
