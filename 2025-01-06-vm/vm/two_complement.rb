class VM
  module TwoComplement
    class << self
      def encode(value, bits:)
        if value >= 0
          value
        else
          two_complement(value.abs, bits: bits)
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

      def value_range(bits:)
        max = 1 << (bits - 1)
        (-max)..(max - 1)
      end

      private

      def two_complement(value, bits:)
        (2 << bits - 1) - value
      end
    end
  end
end
