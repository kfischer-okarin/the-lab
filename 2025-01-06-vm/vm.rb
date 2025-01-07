class VM
  attr_reader :memory, :registers

  attr_accessor :pc

  def initialize
    @memory = Array.new(0xFFFF, 0)
    @registers = Array.new(8, 0)
    @pc = 0x3000
  end

  def execute_instruction
    @pc += 1
  end

  module Operations
    ADD = 0b0001
  end

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
        operand.to_i
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
