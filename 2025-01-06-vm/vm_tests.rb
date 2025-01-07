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
    it 'increments the program counter' do
      vm.pc = 0x4000

      vm.execute_instruction

      assert_equal 0x4001, vm.pc
    end
  end

  describe VM::Assembler do
    [
      ['ADD R2 R0 R1;', '0001010000000001'],
      ['ADD R3 R4 1;',  '0001011100100001']
    ].each do |instruction, expected|
      it "can assemble '#{instruction}'" do
        instruction = VM::Assembler.process(instruction)
        assert_equal expected, format('%016b', instruction)
      end
    end

    [
      ['ADD R2 R0 R1', /Missing semicolon:/],
      ['ADD R2 R0;', /Wrong number of operands/],
      ['ADD 1 R0 R1;', /Expected register as operand 1/],
      ['ADD R0 R1 16;', /Immediate value out of range \(-15..15\):/]
    ].each do |instruction, expected_message|
      it "raises an error for invalid instruction '#{instruction}'" do
        VM::Assembler.process(instruction)
        assert false, "Expected error: #{expected_message}"
      rescue VM::Assembler::InvalidInstruction => e
        assert_match expected_message, e.message, "Expected error message: #{expected_message}, but got: #{e.message}"
        assert_match /#{instruction}/,
                     e.message,
                     "Expected error message to include: #{instruction}, but got: #{e.message}"
      end
    end
  end
end
