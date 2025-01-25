require 'minitest/autorun'

require_relative 'json_fixers'

# LlmJsonSchemaFixer.logger.level = :debug

describe LlmJsonSchemaFixer do
  # let(:model) { 'qwen2.5-coder:0.5b' }
  # let(:model) { 'llama3.2:1b-instruct-fp16' }
  let(:model) { 'llama3.2:3b' }
  # let(:model) { 'chat' }
  let(:fixer) { LlmJsonSchemaFixer.new(LLMClient::Config.new('http://localhost:11434', model)) }

  [
    {
      wrong_examples: [
        '{"operands":"[44, 44]","operation":"multiply"}',
        '{"operands":[44, 44],"operastion":"multiply"}',
      ],
      expected_result: { 'operands' => [44, 44], 'operation' => 'multiply' },
      schema: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
          operands: { type: 'array', items: { type: 'number' } }
        },
        required: ['operation', 'operands']
      }
    }
  ].each_with_index do |test_data, index|
    describe "Schema #{index + 1}" do
      test_data[:wrong_examples].each do |wrong_example|
        it "fixes wrong example '#{wrong_example}'" do
          result = fixer.fix(wrong_example, test_data[:schema])
          _(result).must_equal test_data[:expected_result]
        end
      end
    end
  end
end
