require_relative 'operations'
require_relative 'two_complement'

class VM
  class Assembler
    class InvalidInstruction < StandardError; end

    def initialize
      @line_parser = LineParser.new
    end

    def process_line(line)
      @line_parser.line = line

      send("process_#{@line_parser.operation}")
    rescue ArgumentError
      invalid_instruction!('Wrong number of operands', instruction)
    end

    private

    def process_add
      result = Operations::ADD << 12
      result |= @line_parser.parse_register! << 9
      result |= @line_parser.parse_register! << 6
      if @line_parser.next_operand_is_register?
        result | @line_parser.parse_register!
      else
        result |= 1 << 5 # immediate mode flag
        result | @line_parser.parse_immediate!(bits: 5)
      end
    end

    def process_ldi
      result = Operations::LDI << 12
      result |= @line_parser.parse_register! << 9
      result | @line_parser.parse_immediate!(bits: 9)
    end

    class LineParser
      attr_reader :operation

      def initialize
        @line = nil
      end

      def line=(line)
        @line = line.strip
        invalid_instruction!('Missing semicolon') unless @line.end_with? ';'

        @operation, *@operands = @line.chomp(';').split.map!(&:upcase)
        @operation.downcase!
        @processed_operand_count = 0
      end

      def next_operand_is_register?
        return false unless @operands.first

        @operands.first[0] == 'R'
      end

      def parse_register!
        unless next_operand_is_register?
          invalid_instruction!("Expected register as operand #{@processed_operand_count + 1}")
        end
        operand = next_operand!
        operand[1].to_i
      end

      def parse_immediate!(bits:)
        operand = next_operand!
        if operand.start_with?('0X')
          result = operand.to_i(16)
        else
          result = operand.to_i
        end
        range = TwoComplement.value_range(bits: bits)
        invalid_instruction!("Immediate value out of range (#{range}): #{operand}") unless range.include?(result)

        VM::TwoComplement.encode(result, bits: bits)
      end

      private

      def next_operand!
        result = @operands.shift
        invalid_instruction!('Wrong number of operands') unless result

        @processed_operand_count += 1
        result
      end

      def invalid_instruction!(message)
        raise InvalidInstruction, "#{message}: '#{@line}'"
      end
    end
  end
end
