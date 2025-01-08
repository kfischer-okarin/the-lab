class VM
  module Operations
    ADD = 0b0001

    class << self
      def operation_with_opcode(opcode)
        case opcode
        when ADD
          :add
        end
      end
    end
  end
end
