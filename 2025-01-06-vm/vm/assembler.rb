require_relative 'assembler/line_parser'
require_relative 'operations'

class VM
  class Assembler
    def initialize
      @line_parser = LineParser.new
    end

    def process_line(line)
      @line_parser.line = line
      return unless @line_parser.operator

      send("process_#{@line_parser.operator}")
    end

    private

    def process_add
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
      result
    end

    def process_ldi
      result = Operations::LDI << 12
      result |= @line_parser.parse_register! << 9
      result |= @line_parser.parse_immediate!(bits: 9)
      @line_parser.all_operands_processed!
      result
    end
  end
end
