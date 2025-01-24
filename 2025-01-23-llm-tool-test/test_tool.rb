require 'bundler/setup'

require 'httparty'
require 'json'
require 'json-schema'

class Ollama
  include HTTParty
  base_uri 'http://localhost:11434'

  def chat_completion(body)
    puts 'Request Body:'
    pp body

    body = {
      model: 'llama',
      **body
    }

    response = self.class.post(
      '/v1/chat/completions',
      body: body.to_json,
      headers: {
        'Content-Type' => 'application/json'
      }
    )

    raise "Error: #{response.code}\n#{response}" unless response.code == 200

    response
  end

  def simple_prompt(prompt, temperature: nil)
    body = {
      messages: [{ role: 'user', content: prompt }]
    }
    body[:temperature] = temperature if temperature

    response = chat_completion(body)

    response['choices'].first['message']['content']
  end
end

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
    @client = Ollama.new
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
    10.times do
      begin
        parsed_arguments = JSON.parse(arguments)
        JSON::Validator.validate!(schema, parsed_arguments)
        return parsed_arguments
      rescue JSON::ParserError
        arguments = try_fix_invalid_json_string(arguments)
      rescue JSON::Schema::ValidationError => e
        arguments = try_fix_json_not_matching_schema(arguments, schema, e.message)
      end
    end

    raise 'Too many attempts'
  end

  def try_fix_invalid_json_string(json_string)
    prompt = <<~MESSAGE
      The value between <value> and </value> is not a valid JSON string:
      <value>#{json_string}</value>
      Please respond ONLY with the correct JSON string.
    MESSAGE
    @client.simple_prompt(prompt, temperature: 0)
  end

  def try_fix_json_not_matching_schema(json_string, schema, error_message)
    prompt = <<~MESSAGE
      Given this JSON schema:
        #{schema.to_json}
      this JSON string between <value> and </value>:
        <value>#{json_string}</value>
      caused the following error:
        '#{error_message}'
      Please respond ONLY with the correct JSON string.
    MESSAGE
    @client.simple_prompt(prompt, temperature: 0)
  end

  def next_completion
    @client.chat_completion({ messages: @messages, tools: @tools.map(&:to_json) })
  end
end

CompletionWithTools.new('What is 44 * 44?', tools: TOOLS).execute
