require 'minitest/autorun'

require_relative 'vm'

describe VM do
  let(:vm) { VM.new }

  it 'has a memory size of 65535' do
    assert_equal 65_535, vm.memory.size
  end

  it 'has 8 registers' do
    assert_equal 8, vm.registers.size
  end

  describe 'executing one instruction' do
    it 'increments the program counter' do
      vm.pc = 0x4000

      vm.execute_instruction

      assert_equal 0x4001, vm.pc
    end
  end
end
