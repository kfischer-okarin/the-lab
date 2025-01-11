require 'minitest/autorun'

require_relative 'assembler'

describe VM::Assembler do
  def format_as_16bits(value)
    format('%016b', value)
  end

  [
    ['ADD R2, R0, R1;',   ['0001010000000001']],
    ['ADD R3, R4, #1;',   ['0001011100100001']],
    ['ADD R6, R7, #-12;', ['0001110111110100']],
    ['LDI R1, x010;',     ['1010001000010000']]
  ].each do |line, expected_machine_code_instructions|
    it "can assemble '#{line}'" do
      assembler = VM::Assembler.new(start_address: 0x3000)

      result = assembler.process_line(line)

      assert_equal expected_machine_code_instructions, result.map { |value| format_as_16bits(value) }
    end

    it "increments the address by #{expected_machine_code_instructions.size} after assembling '#{line}'" do
      assembler = VM::Assembler.new(start_address: 0x3000)

      assembler.process_line(line)

      assert_equal 0x3000 + expected_machine_code_instructions.size, assembler.next_address
    end
  end

  it 'ignores comment lines' do
    assembler = VM::Assembler.new

    result = assembler.process_line('; This is a comment line')

    assert_equal [], result
  end

  it 'cannot assemble any instruction without a start address' do
    assembler = VM::Assembler.new

    exception = assert_raises VM::Assembler::InvalidInstruction do
      assembler.process_line('ADD R2, R0, R1;')
    end
    assert_match(/You must use the .ORIG directive before any other instruction/, exception.message)
  end

  [
    ['ADD R2, R0, R1', /Missing semicolon:/],
    ['ADD R2, R0 R1;', /Expected comma after operand 2/],
    ['ADD R2, R0;', /Wrong number of operands/],
    ['ADD R2, R0, R1, R3;', /Wrong number of operands/],
    ['ADD #1, R0, R1;', /Expected register as operand 1/],
    ['ADD R0, R1, 16;', /Immediate value out of range \(-16..15\):/],
    ['LDI R2, #256;', /Immediate value out of range \(-256..255\):/]
  ].each do |instruction, expected_message|
    it "raises an error for invalid instruction '#{instruction}'" do
      assembler = VM::Assembler.new(start_address: 0x3000)
      assembler.process_line(instruction)
      assert false, "Expected error: #{expected_message}"
    rescue VM::Assembler::InvalidInstruction => e
      assert_match expected_message, e.message, "Expected error message: #{expected_message}, but got: #{e.message}"
      assert_match(
        /#{instruction}/,
        e.message,
        "Expected error message to include: #{instruction}, but got: #{e.message}"
      )
    end
  end
end
