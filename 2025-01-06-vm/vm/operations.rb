class VM
  module Operations
    ADD = 0b0001

    class << self
      def operation_with_opcode(opcode)
        unless @operations
          @operations = []
          constants.each do |constant|
            @operations[const_get(constant)] = constant.downcase
          end
        end

        @operations[opcode]
      end
    end
  end
end
