require "bundler/setup"

require "dotenv/load"
require "openai"


def main
  client = OpenAI::Client.new
  agent = Agent.new(client: client, input_io: $stdin)
  agent.run
end

class Agent
  def initialize(client:, input_io:)
    @client = client
    @input_io = input_io
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
      max_completion_tokens: 1024
    )
    response.choices.first.message
  end
end

main if $PROGRAM_NAME == __FILE__
