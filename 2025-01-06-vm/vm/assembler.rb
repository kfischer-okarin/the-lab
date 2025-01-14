require_relative 'assembler/line_parser'
require_relative 'operations'
require_relative 'two_complement'

class VM
  class Assembler
    class InvalidInstruction < StandardError; end

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

    def process_brp
      process_br(0, 0, 1)
    end

    def process_brz
      process_br(0, 1, 0)
    end

    def process_brn
      process_br(1, 0, 0)
    end

    def process_brzp
      process_br(0, 1, 1)
    end

    def process_brnz
      process_br(1, 1, 0)
    end

    def process_brnp
      process_br(1, 0, 1)
    end

    def process_brnzp
      process_br(1, 1, 1)
    end

    def process_br(n = 1, z = 1, p = 1)
      require_start_address!
      result = Operations::BR << 12
      result |= n << 11
      result |= z << 10
      result |= p << 9
      result |= relative_label_address(@line_parser.parse_label!, bits: 9)
      [result]
    end

    def process_ld
      require_start_address!
      result = Operations::LD << 12
      result |= @line_parser.parse_register! << 9
      result |= relative_label_address(@line_parser.parse_label!, bits: 9)
      [result]
    end

    def process_ldi
      require_start_address!
      result = Operations::LDI << 12
      result |= @line_parser.parse_register! << 9
      result |= relative_label_address(@line_parser.parse_label!, bits: 9)
      [result]
    end

    def process_st
      require_start_address!
      result = Operations::ST << 12
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
      label_address = @labels.fetch(label.downcase) { raise InvalidInstruction, "Unknown label: '#{label}'" }
      result = label_address - (@next_address + 1)
      range = TwoComplement.value_range(bits: bits)
      raise InvalidInstruction, "Label '#{label}' is out of range (#{range})" unless range.include?(result)

      TwoComplement.encode(result, bits: bits)
    end
  end
end
