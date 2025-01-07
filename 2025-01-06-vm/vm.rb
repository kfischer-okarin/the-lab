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
        instruction.strip!
        invalid_instruction!('Missing semicolon', instruction) unless instruction.end_with? ';'

        instruction.chomp!(';')
        operation, *operands = instruction.split.map!(&:upcase)

        send("process_#{operation.downcase}", *operands)
      rescue ArgumentError
        invalid_instruction!('Wrong number of operands', instruction)
      end

      private

      def process_add(source, destination, operand)
        result = Operations::ADD << 12
        result |= parse_register(source) << 9
        result |= parse_register(destination) << 6
        if register?(operand)
          result | parse_register(operand)
        else
          result |= 1 << 5 # immediate mode flag
          result | operand.to_i
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
  end
end
