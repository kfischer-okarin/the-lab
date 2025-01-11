require_relative 'assembler/line_parser'
require_relative 'operations'
require_relative 'two_complement'

class VM
  class Assembler
    attr_reader :next_address

    def initialize(labels: {}, start_address: nil)
      @line_parser = LineParser.new
      @labels = labels
      @line_number = 1
      @next_address = start_address
    end

    def process_line(line)
      @line_parser.line = line
      result = []
      if @line_parser.operator
        result = send("process_#{@line_parser.operator}")
        @line_parser.all_operands_processed!
      end
      @next_address += result.size
      @line_number += 1
      result
    rescue InvalidInstruction => e
      raise InvalidInstruction, "Error on line #{@line_number}: '#{line}'\n  #{e.message}"
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
        result |= @line_parser.parse_immediate_value!(bits: 5)
      end
      [result]
    end

    def process_ldi
      require_start_address!
      result = Operations::LDI << 12
      result |= @line_parser.parse_register! << 9
      result |= relative_label_address(@line_parser.parse_label!, bits: 9)
      [result]
    end

    def process_directive_orig
      raise InvalidInstruction, 'Start address already set' if @next_address

      @next_address = @line_parser.parse_immediate_value!(bits: 16)
      []
    end

    def require_start_address!
      return if @next_address

      raise InvalidInstruction, 'You must use the .ORIG directive before any other instruction'
    end

    def relative_label_address(label, bits:)
      label_address = @labels.fetch(label.downcase) { raise InvalidInstruction, "Unknown label: #{label}" }
      result = label_address - (@next_address + 1)
      TwoComplement.encode(result, bits: bits)
    end
  end
end
