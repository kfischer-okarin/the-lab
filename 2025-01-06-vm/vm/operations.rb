class VM
  module Operations
    BR  = 0b0000
    ADD = 0b0001
    LD  = 0b0010
    ST  = 0b0011
    LDI = 0b1010

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
