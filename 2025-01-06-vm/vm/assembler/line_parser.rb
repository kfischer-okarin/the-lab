require_relative '../two_complement'

class VM
  class Assembler
    class InvalidInstruction < StandardError; end

    class LineParser
      attr_reader :operator

      def initialize
        @line = nil
      end

      def line=(line)
        @line = line
        @unprocessed = @line.strip
        strip_comments!
        @operator = parse_operator!
        @processed_operand_count = 0
      end

      def next_operand_type
        return nil unless next_operand

        case next_operand[0]
        when 'R'
          :register
        when 'x', '#'
          :immediate_value
        else
          :label
        end
      end

      def parse_register!
        require_next_operand_type! :register
        operand = parse_operand!
        operand[1].to_i
      end

      def parse_immediate_value!(bits:)
        require_next_operand_type! :immediate_value
        operand = parse_operand!
        if operand.start_with?('x')
          result = operand[1..].to_i(16)
        elsif operand.start_with?('#')
          result = operand[1..].to_i
        end
        range = TwoComplement.value_range(bits: bits)
        invalid_instruction!("Immediate value out of range (#{range}): #{operand}") unless range.include?(result)

        TwoComplement.encode(result, bits: bits)
      end

      def parse_label!
        require_next_operand_type! :label
        parse_operand!
      end

      def all_operands_processed!
        invalid_instruction!('Wrong number of operands') if next_operand
      end

      private

      def strip_comments!
        invalid_instruction!('Missing semicolon') unless @unprocessed.include? ';'

        @unprocessed, _ = @unprocessed.split(/ *; */, 2)
      end

      def parse_operator!
        operator, @unprocessed = @unprocessed.split(' ', 2)
        if operator
          operator.gsub!(/^\./, 'directive_') # handle .ORIG, .FILL, etc.
          operator.downcase!
        end
        operator
      end

      def parse_operand!
        result = next_operand
        @processed_operand_count += 1
        @next_operand = nil
        result
      end

      def require_next_operand_type!(expected_type)
        invalid_instruction!('Wrong number of operands') unless next_operand
        return if next_operand_type == expected_type

        invalid_instruction!("Expected #{expected_type} as operand #{@processed_operand_count + 1}")
      end

      def next_operand
        unless @next_operand
          return nil if @unprocessed.nil?

          @next_operand, @unprocessed = @unprocessed.split(/, */, 2)
          if @next_operand.include? ' '
            invalid_instruction!("Expected comma after operand #{@processed_operand_count + 1}")
          end
        end

        @next_operand
      end

      def invalid_instruction!(message)
        raise InvalidInstruction, "#{message}: '#{@line}'"
      end
    end
  end
end
