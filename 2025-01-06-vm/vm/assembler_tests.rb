require 'minitest/autorun'

require_relative 'assembler'

describe VM::Assembler do
  [
    ['ADD R2 R0 R1;',   '0001010000000001'],
    ['ADD R3 R4 1;',    '0001011100100001'],
    ['ADD R6 R7 -12;',  '0001110111110100'],
    ['LDI R1 0x010;',   '1010001000010000']
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
    ['ADD R0 R1 16;', /Immediate value out of range \(-15..15\):/],
    ['LDI R2 256;', /Immediate value out of range \(-255..255\):/]
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
