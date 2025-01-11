require_relative 'assembler/line_parser'
require_relative 'operations'

class VM
  class Assembler
    attr_reader :next_address

    def initialize(start_address: nil)
      @line_parser = LineParser.new
      @next_address = start_address
    end

    def process_line(line)
      @line_parser.line = line
      return [] unless @line_parser.operator

      send("process_#{@line_parser.operator}")
    end

    private

    def process_add
      require_start_address!
      result = Operations::ADD << 12
      result |= @line_parser.parse_register! << 9
      result |= @line_parser.parse_register! << 6
      if @line_parser.next_operand_is_register?
        result |= @line_parser.parse_register!
      else
        result |= 1 << 5 # immediate mode flag
        result |= @line_parser.parse_immediate!(bits: 5)
      end
      @line_parser.all_operands_processed!
      @next_address += 1
      [result]
    end

    def process_ldi
      require_start_address!
      result = Operations::LDI << 12
      result |= @line_parser.parse_register! << 9
      result |= @line_parser.parse_immediate!(bits: 9)
      @line_parser.all_operands_processed!
      @next_address += 1
      [result]
    end

    def require_start_address!
      return if @next_address

      raise InvalidInstruction, 'You must use the .ORIG directive before any other instruction'
    end
  end
end
