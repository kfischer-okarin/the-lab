require_relative '../two_complement'

class VM
  class Assembler
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
        when 'x', '#', 'b'
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
        if operand.start_with?('#')
          result = operand[1..].to_i
          range = TwoComplement.value_range(bits: bits)
          raise InvalidInstruction, "Immediate value #{operand} out of range (#{range})" unless range.include?(result)

          TwoComplement.encode(result, bits: bits)
        elsif operand.start_with?('x')
          result = operand[1..].to_i(16)
          max = (1 << bits) - 1
          range = "x0..x#{max.to_s(16).upcase}"
          raise InvalidInstruction, "Immediate value #{operand} out of range (#{range})" if result > max

          result
        elsif operand.start_with?('b')
          result = operand[1..].to_i(2)
          max = (1 << bits) - 1
          range = "b0..b#{max.to_s(2)}"
          raise InvalidInstruction, "Immediate value #{operand} out of range (#{range})" if result > max

          result
        else
          raise InvalidInstruction, "Invalid immediate value #{operand}"
        end

      end

      def parse_label!
        require_next_operand_type! :label
        parse_operand!
      end

      def all_operands_processed!
        raise InvalidInstruction, 'Wrong number of operands' if next_operand
      end

      private

      def strip_comments!
        raise InvalidInstruction, 'Missing semicolon' unless @unprocessed.include? ';'

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
        raise InvalidInstruction, 'Wrong number of operands' unless next_operand
        return if next_operand_type == expected_type
        raise InvalidInstruction, "Expected #{expected_type} as operand #{current_operand_number}"
      end

      def next_operand
        unless @next_operand
          return nil if @unprocessed.nil?

          @next_operand, @unprocessed = @unprocessed.split(/, */, 2)
          if @next_operand.include? ' '
            raise InvalidInstruction, "Expected comma after operand #{current_operand_number}"
          end
        end

        @next_operand
      end

      def current_operand_number
        @processed_operand_count + 1
      end
    end
  end
end
