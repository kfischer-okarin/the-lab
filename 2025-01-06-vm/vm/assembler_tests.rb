require 'minitest/autorun'

require_relative 'assembler'

describe VM::Assembler do
  def format_as_16bits(value)
    format('%016b', value)
  end

  [
    ['; This is a comment line', []],
    ['BRp Done;',         ['0000001000000001'], { 'done' => 0x3002 }],
    ['BRz Done;',         ['0000010000000001'], { 'done' => 0x3002 }],
    ['BRn Done;',         ['0000100000000001'], { 'done' => 0x3002 }],
    ['BRzp Done;',        ['0000011000000001'], { 'done' => 0x3002 }],
    ['BRnz Done;',        ['0000110000000001'], { 'done' => 0x3002 }],
    ['BRnp Done;',        ['0000101000000001'], { 'done' => 0x3002 }],
    ['BRnzp Done;',       ['0000111000000001'], { 'done' => 0x3002 }],
    ['BR Done;',          ['0000111000000001'], { 'done' => 0x3002 }],
    ['ADD R2, R0, R1;',   ['0001010000000001']],
    ['ADD R3, R4, #1;',   ['0001011100100001']],
    ['ADD R6, R7, #-12;', ['0001110111110100']],
    ['LDI R1, Data;',     ['1010001111101111'], { 'data' => 0x2FF0 }]
  ].each do |line, expected_machine_code_instructions, labels = {}|
    it "can assemble '#{line}'" do
      assembler = VM::Assembler.new(start_address: 0x3000, labels: labels)

      result = assembler.process_line(line)

      assert_equal expected_machine_code_instructions, result.map { |value| format_as_16bits(value) }
    end

    it "increments the address by #{expected_machine_code_instructions.size} after assembling '#{line}'" do
      assembler = VM::Assembler.new(start_address: 0x3000, labels: labels)

      assembler.process_line(line)

      assert_equal 0x3000 + expected_machine_code_instructions.size, assembler.next_address
    end
  end

  it 'cannot assemble any instruction without a start address' do
    assembler = VM::Assembler.new

    exception = assert_raises VM::Assembler::InvalidInstruction do
      assembler.process_line('ADD R2, R0, R1;')
    end
    assert_includes exception.message, 'You must use the .ORIG directive before any other instruction'
  end

  it 'can set the start address using the .ORIG directive' do
    assembler = VM::Assembler.new

    assembler.process_line('.ORIG x3000;')

    assert_equal 0x3000, assembler.next_address
  end

  it 'cannot set the start address more than once' do
    assembler = VM::Assembler.new(start_address: 0x3000)

    exception = assert_raises VM::Assembler::InvalidInstruction do
      assembler.process_line('.ORIG x3000;')
    end
    assert_match(/Start address already set/, exception.message)
  end

  it 'cannot use an unknown label' do
    assembler = VM::Assembler.new(start_address: 0x3000)

    exception = assert_raises VM::Assembler::InvalidInstruction do
      assembler.process_line('LDI R1, Data;')
    end
    assert_includes exception.message, "Unknown label: 'Data'"
  end

  it 'cannot use a too far label for LDI' do
    assembler = VM::Assembler.new(start_address: 0x3000, labels: { 'data' => 0x4000 })

    exception = assert_raises VM::Assembler::InvalidInstruction do
      assembler.process_line('LDI R1, Data;')
    end
    assert_includes exception.message, "Label 'Data' is out of range (-256..255)"
  end

  [
    ['ADD R2, R0, R1', 'Missing semicolon'],
    ['ADD R2, R0 R1;', 'Expected comma after operand 2'],
    ['ADD R2, R0;', 'Wrong number of operands'],
    ['ADD R2, R0, R1, R3;', 'Wrong number of operands'],
    ['ADD #1, R0, R1;', 'Expected register as operand 1'],
    ['ADD R0, R1, #16;', 'Immediate value #16 out of range (-16..15)'],
    ['LDI R2, #256;', 'Expected label as operand 2']
  ].each do |instruction, expected_message|
    it "raises an error for invalid instruction '#{instruction}'" do
      assembler = VM::Assembler.new(start_address: 0x3000)
      assembler.process_line(instruction)
      assert false, "Expected error: #{expected_message}"
    rescue VM::Assembler::InvalidInstruction => e
      assert_includes e.message, expected_message
      assert_includes e.message, instruction
      assert_includes e.message, 'line 1'
    end
  end
end
