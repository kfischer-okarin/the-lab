require "json"

require "bundler/setup"

require "dotenv/load"
require "openai"

def main
  client = OpenAI::Client.new
  tools = [
    READ_FILE_TOOL
  ]
  agent = Agent.new(client: client, input_io: $stdin, tools: tools)
  agent.run
end

Tool = Data.define(:name, :description, :parameters, :function) do
  def initialize(name:, function:, description: nil, parameters: nil)
    super(name:, description:, parameters:, function:)
  end

  def to_tool_hash
    {
      type: "function",
      function: {
        name: name,
        description: description,
        parameters: parameters
      }.compact
    }
  end
end

def read_file(path:)
  File.read(path)
end

READ_FILE_TOOL = Tool.new(
  name: "read_file",
  description: "Read the contents of a given relative file path. Use this when you want to see what's inside a file. Do not use this with directory names.",
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The relative path of a file in the working directory."
      },
    },
    required: ["path"]
  },
  function: method(:read_file)
)

class Agent
  def initialize(client:, input_io:, tools: [])
    @client = client
    @input_io = input_io
    @tools = tools
    @conversation = []
  end

  def run
    puts "Chat with Amadeus (use Ctrl+D to exit)"
    puts

    read_user_input = true

    loop do
      if read_user_input
        print "\e[92mYou\e[0m: "
        input = @input_io.gets
        break unless input

        input.chomp!
        user_message = { role: :user, content: input }
        @conversation << user_message
      end

      response_message = run_inference

      read_user_input = true

      if response_message.content
        @conversation << { role: :assistant, content: response_message.content }
        puts "\e[96mAmadeus\e[0m: #{response_message.content}"
      end

      if response_message.tool_calls
        @conversation << { role: :assistant, tool_calls: response_message.tool_calls }
        tool_results = response_message.tool_calls.map do |tool_call|
          arguments = JSON.parse(tool_call.function.arguments, symbolize_names: true)
          result = execute_tool(name: tool_call.function.name, arguments: arguments)
          {
            tool_call_id: tool_call.id,
            role: :tool,
            content: result
          }
        end
        @conversation.concat(tool_results)
        read_user_input = false
      end
    end
  end

  private

  def run_inference
    response = @client.chat.completions.create(
      messages: @conversation,
      model: "gpt-4.1",
      max_completion_tokens: 1024,
      tools: @tools.map(&:to_tool_hash),
    )
    response.choices.first.message
  end

  def execute_tool(name:, arguments:)
    print "\e[93mtool\e[0m: #{name}(#{arguments})..."
    tool = @tools.find { |t| t.name == name }
    return "Error: Tool not found" unless tool

    begin
      result = tool.function.call(**arguments)
      puts "Done!"
      result
    rescue StandardError => e
      puts
      puts "  Error executing tool: #{e.message}"
      "Error: #{e.message}"
    end
  end
end

main if $PROGRAM_NAME == __FILE__
