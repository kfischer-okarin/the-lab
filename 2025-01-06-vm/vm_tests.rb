require 'minitest/autorun'

require_relative 'vm'

describe VM do
  let(:vm) { VM.new }

  def assemble_instruction(instruction, labels: {})
    VM::Assembler.new(start_address: 0x3000, labels: labels).process_line(instruction)[0]
  end

  it 'has a memory size of 65535' do
    assert_equal 65_535, vm.memory.size
  end

  it 'has 8 registers' do
    assert_equal 8, vm.registers.size
  end

  describe 'executing one instruction' do
    let(:a_valid_instruction) { assemble_instruction('ADD R2, R0, R1;') }

    it 'increments the program counter' do
      vm.pc = 0x4000
      vm.memory[0x4000] = a_valid_instruction

      vm.execute_instruction

      assert_equal 0x4001, vm.pc
    end
  end

  [
    ['BRn', [-1]],
    ['BRz', [0]],
    ['BRp', [1]],
    ['BRnz', [-1, 0]],
    ['BRnp', [-1, 1]],
    ['BRzp', [0, 1]],
    ['BRnzp', [-1, 0, 1]],
    ['BR', [-1, 0, 1]]
  ].each do |instruction, successful_conditions|
    [-1, 0, 1].each do |condition|
      if successful_conditions.include?(condition)
        it "#{instruction} branches if the condition flag is #{condition}" do
          vm.pc = 0x3000
          vm.memory[0x3000] = assemble_instruction("#{instruction} Done;", labels: { 'done' => 0x3002 })
          vm.condition_flag = condition

          vm.execute_instruction

          assert_equal 0x3002, vm.pc
        end
      else
        it "#{instruction} does not branch if the condition flag is #{condition}" do
          vm.pc = 0x3000
          vm.memory[0x3000] = assemble_instruction("#{instruction} Done;", labels: { 'done' => 0x3002 })
          vm.condition_flag = condition

          vm.execute_instruction

          assert_equal 0x3001, vm.pc
        end
      end
    end
  end

  describe 'ADD' do
    it 'can add two registers' do
      vm.registers[0] = 1
      vm.registers[1] = 2
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('ADD R2, R0, R1;')

      vm.execute_instruction

      assert_equal 3, vm.registers[2]
    end

    it 'can add a register and an immediate value' do
      vm.registers[0] = 1
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('ADD R2, R0, #3;')

      vm.execute_instruction

      assert_equal 4, vm.registers[2]
    end

    it 'can add a register and a negative immediate value' do
      vm.registers[0] = 1
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('ADD R2, R0, #-3;')

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
        vm.memory[0x3000] = assemble_instruction('ADD R2, R0, R1;')

        vm.execute_instruction

        assert_equal expected, vm.condition_flag
      end
    end
  end

  describe 'JSR' do
    it 'jumps to the specified label' do
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('JSR Done;', labels: { 'done' => 0x3051 })

      vm.execute_instruction

      assert_equal 0x3051, vm.pc
    end

    it 'stores the return address in R7' do
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('JSR Done;', labels: { 'done' => 0x3051 })

      vm.execute_instruction

      assert_equal 0x3001, vm.registers[7]
    end
  end

  describe 'JSRR' do
    it 'jumps to the address stored in the specified register' do
      vm.registers[1] = 0x3051
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('JSRR R1;')

      vm.execute_instruction

      assert_equal 0x3051, vm.pc
    end

    it 'stores the return address in R7' do
      vm.registers[1] = 0x3051
      vm.pc = 0x3000
      vm.memory[0x3000] = assemble_instruction('JSRR R1;')

      vm.execute_instruction

      assert_equal 0x3001, vm.registers[7]
    end
  end

  describe 'LD' do
    it 'loads the value stored at specified label' do
      vm.memory[0x3000] = assemble_instruction('LD R0, Data;', labels: { 'data' => 0x3051 })
      vm.memory[0x3051] = 42
      vm.pc = 0x3000

      vm.execute_instruction

      assert_equal 42, vm.registers[0]
    end

    [
      ['zero', 0,  0],
      ['positive', 1, 1],
      ['negative', -1, -1]
    ].each do |description, value, expected|
      it "sets the condition flag to #{expected} if the loaded value is #{description}" do
        vm.memory[0x3000] = assemble_instruction('LD R0, Data;', labels: { 'data' => 0x3051 })
        vm.memory[0x3051] = value
        vm.pc = 0x3000

        vm.execute_instruction

        assert_equal expected, vm.condition_flag
      end
    end
  end

  describe 'LDI' do
    it 'loads the value stored at the address stored at the specified label' do
      vm.memory[0x3000] = assemble_instruction('LDI R0, Data;', labels: { 'data' => 0x3051 })
      vm.memory[0x3051] = 0x5000
      vm.memory[0x5000] = 42
      vm.pc = 0x3000

      vm.execute_instruction

      assert_equal 42, vm.registers[0]
    end

    [
      ['zero', 0,  0],
      ['positive', 1, 1],
      ['negative', -1, -1]
    ].each do |description, value, expected|
      it "sets the condition flag to #{expected} if the loaded value is #{description}" do
        vm.memory[0x3000] = assemble_instruction('LDI R0, Data;', labels: { 'data' => 0x3002 })
        vm.memory[0x3002] = 0x5000
        vm.memory[0x5000] = value
        vm.pc = 0x3000

        vm.execute_instruction

        assert_equal expected, vm.condition_flag
      end
    end
  end

  describe 'ST' do
    it 'stores the value of a register at the specified label' do
      vm.registers[0] = 42
      vm.memory[0x3000] = assemble_instruction('ST R0, Data;', labels: { 'data' => 0x3051 })
      vm.pc = 0x3000

      vm.execute_instruction

      assert_equal 42, vm.memory[0x3051]
    end
  end
end
