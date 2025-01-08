class VM
  module TwoComplement
    class << self
      def encode(value, bits:)
        if value >= 0
          value
        else
          two_complement(value.abs, bits: bits)
          (2 << bits - 1) - value.abs
        end
      end

      def decode(encoded_value, bits:)
        sign_bit = encoded_value >> (bits - 1)
        if sign_bit.zero?
          encoded_value
        else
          -two_complement(encoded_value, bits: bits)
        end
      end

      private

      def two_complement(value, bits:)
        (2 << bits - 1) - value
      end
    end
  end
end
