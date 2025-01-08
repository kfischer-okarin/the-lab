require 'minitest/autorun'

require_relative 'two_complement'

describe VM::TwoComplement do
  [
    ['1111', -1, 4],
    ['1000', -8, 4],
    ['1111111111111100', -4, 16]
  ].each do |expected, value, bits|
    it "can encode #{value} using two complement with #{bits} bits" do
      format_string = "%0#{bits}b"
      assert_equal expected, format(format_string, VM::TwoComplement.encode(value, bits: bits))
    end

    it "can decode #{expected} using two complement with #{bits} bits" do
      assert_equal value, VM::TwoComplement.decode(expected.to_i(2), bits: bits)
    end
  end

  it 'can return the value range for a given number of bits' do
    assert_equal(-8..7, VM::TwoComplement.value_range(bits: 4))
    assert_equal(-128..127, VM::TwoComplement.value_range(bits: 8))
    assert_equal(-32_768..32_767, VM::TwoComplement.value_range(bits: 16))
  end
end
