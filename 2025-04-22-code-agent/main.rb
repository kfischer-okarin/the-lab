require "bundler/setup"

require "dotenv/load"
require "openai"


def main
  client = OpenAI::Client.new
  tools = []
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

    loop do
      print "\e[92mYou\e[0m: "
      input = @input_io.gets
      break unless input

      input.chomp!
      user_message = { role: :user, content: input }
      @conversation << user_message
      response_message = run_inference
      @conversation << { role: :assistant, content: response_message.content }

      puts "\e[96mAmadeus\e[0m: #{response_message.content}"
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
end

main if $PROGRAM_NAME == __FILE__
