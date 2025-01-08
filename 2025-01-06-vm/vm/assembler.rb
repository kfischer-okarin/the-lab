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

      def two_complement(value, bits:)
        (1 << (bits + 1) - 1) - value
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
          result | parser.parse_immediate!
        end
      end

      def parse_register(register)
        register[1].to_i
      end

      def register?(value)
        value[0] == 'R'
      end

      def invalid_instruction!(message, instruction)
        raise InvalidInstruction, "#{message}: #{instruction}"
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

      def parse_immediate!
        operand = next_operand!
        result = operand.to_i
        invalid_instruction!("Immediate value out of range (-15..15): #{operand}") unless (-15..15).include?(result)

        result = VM::Assembler.two_complement(result.abs, bits: 5) if result.negative?
        result
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
