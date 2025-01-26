require 'bundler/setup'

require_relative 'json_fixers'
require_relative 'llm_client'

LLM_BASE_URL = 'http://localhost:11434'
MAIN_MODEL = 'chat'
FIXER_MODEL = 'llama3.2:1b-instruct-fp16'

class Tool
  attr_reader :name, :parameter_json_schema

  def initialize(name:, description:, parameter_json_schema:, implementation:)
    @name = name
    @description = description
    @parameter_json_schema = parameter_json_schema
    @implementation = implementation
  end

  def call(arguments)
    validate_arguments!(arguments)
    @implementation.call(arguments)
  end

  def validate_arguments!(arguments)
    JSON::Validator.validate!(@parameter_json_schema, arguments)
  end

  def to_json
    {
      type: 'function',
      function: {
        name: @name,
        description: @description,
        parameters: @parameter_json_schema
      },
      strict: true
    }
  end
end

def calculate(operation, operands)
  case operation
  when 'add'
    operands.sum
  when 'subtract'
    operands.reduce(:-)
  when 'multiply'
    operands.reduce(:*)
  when 'divide'
    operands.reduce(:/)
  end
end

TOOLS = [
  Tool.new(
    name: 'calculator',
    description: 'Performs basic arithmetic operations.',
    parameter_json_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
        operands: { type: 'array', items: { type: 'number' } }
      },
      required: ['operation', 'operands']
    },
    implementation: ->(arguments) { calculate(arguments['operation'], arguments['operands']) }
  )
]

class CompletionWithTools
  def initialize(request, tools:)
    @messages = [
      {
        role: 'user',
        content: request
      }
    ]
    @tools = tools #really_required_tools(request, tools)
    @client = LLMClient.new(LLMClient::Config.new(LLM_BASE_URL, MAIN_MODEL))
  end

  def execute
    loop do
      response = next_completion
      result = response['choices'].first
      case result['finish_reason']
      when 'tool_calls'
        @messages << result['message']
        pp result['message']['tool_calls']
        handle_tool_calls(result['message']['tool_calls'])
      else
        puts 'Response:'
        puts result['message']['content']
        break
      end
    end
  end

  private

  def really_required_tools(request, tools)
    response = @client.completion([{ role: 'user', content: request }], tools)
  end

  def handle_tool_calls(tool_calls)
    raise 'Multiple tool calls are not supported' if tool_calls.length > 1

    tool_call = tool_calls.first
    tool = @tools.find { |tool| tool.name == tool_call['function']['name'] }
    raise "Tool not found: #{tool_call['function']['name']}" unless tool

    arguments = ensure_valid_arguments(tool_call['function']['arguments'], tool.parameter_json_schema)

    result = tool.call(arguments)
    @messages << {
      role: 'tool',
      content: result.to_s,
      tool_call_id: tool_call['id']
    }
  end

  def ensure_valid_arguments(arguments, schema)
    fixer = LlmJsonSchemaFixer.new(LLMClient::Config.new(LLM_BASE_URL, FIXER_MODEL))
    fixer.fix(arguments, schema)
  end

  def next_completion
    @client.chat_completion({ messages: @messages, tools: @tools.map(&:to_json) })
  end
end

CompletionWithTools.new('What is 44 * 44?', tools: TOOLS).execute
