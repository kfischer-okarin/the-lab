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

      result = send("process_#{@line_parser.operator}")
      @line_parser.all_operands_processed!
      @next_address += result.size
      result
    end

    private

    def process_add
      require_start_address!
      result = Operations::ADD << 12
      result |= @line_parser.parse_register! << 9
      result |= @line_parser.parse_register! << 6
      case @line_parser.next_operand_type
      when :register
        result |= @line_parser.parse_register!
      else
        result |= 1 << 5 # immediate mode flag
        result |= @line_parser.parse_immediate!(bits: 5)
      end
      [result]
    end

    def process_ldi
      require_start_address!
      result = Operations::LDI << 12
      result |= @line_parser.parse_register! << 9
      result |= @line_parser.parse_immediate!(bits: 9)
      [result]
    end

    def process_directive_orig
      raise InvalidInstruction, 'Start address already set' if @next_address

      @next_address = @line_parser.parse_immediate!(bits: 16)
      []
    end

    def require_start_address!
      return if @next_address

      raise InvalidInstruction, 'You must use the .ORIG directive before any other instruction'
    end
  end
end
