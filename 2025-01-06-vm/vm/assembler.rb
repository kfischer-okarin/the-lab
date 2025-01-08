require_relative 'operations'
require_relative 'two_complement'

class VM
  module Assembler
    class InvalidInstruction < StandardError; end

    class << self
      def process(instruction)
        parser = InstructionParser.new(instruction)

        send("process_#{parser.operation}", parser: parser)
      rescue ArgumentError
        invalid_instruction!('Wrong number of operands', instruction)
      end

      private

      def process_add(parser:)
        result = Operations::ADD << 12
        result |= parser.parse_register! << 9
        result |= parser.parse_register! << 6
        if parser.next_operand_is_register?
          result | parser.parse_register!
        else
          result |= 1 << 5 # immediate mode flag
          result | parser.parse_immediate!(bits: 5)
        end
      end

      def process_ldi(parser:)
        result = Operations::LDI << 12
        result |= parser.parse_register! << 9
        result | parser.parse_immediate!(bits: 9)
      end
    end

    class InstructionParser
      attr_reader :operation

      def initialize(instruction)
        @instruction = instruction.strip
        invalid_instruction!('Missing semicolon') unless @instruction.end_with? ';'

        @operation, *@operands = @instruction.chomp(';').split.map!(&:upcase)
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
        result = operand.to_i
        max = (1 << (bits - 1)) - 1
        range = (-max)..max
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
        raise InvalidInstruction, "#{message}: '#{@instruction}'"
      end
    end
  end
end
