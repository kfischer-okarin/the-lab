require "json"
require "pathname"

require "bundler/setup"

require "dotenv/load"
require "openai"

def main
  client = OpenAI::Client.new
  tools = [
    READ_FILE_TOOL,
    LIST_FILES_TOOL,
    EDIT_FILE_TOOL
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
  ensure_inside_working_directory!(path)

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

def list_files(path: nil)
  path ||= "."
  ensure_inside_working_directory!(path)

  path = Pathname.new(path)
  if path.exist?
    entries = path.children.map { |entry|
      if entry.directory?
        "#{entry.to_s}/"
      elsif entry.file?
        entry.to_s
      end
    }
    JSON.generate(entries)
  else
    raise "Path does not exist."
  end
end

LIST_FILES_TOOL = Tool.new(
  name: "list_files",
  description: "List files and directories at a given path. If no path is provided, lists files in the current directory.",
  parameters: {
	  type: "object",
    properties: {
      path: {
        type: "string",
        description: "Optional relative path to list files from. Defaults to current directory if not provided."
      }
    },
  },
  function: method(:list_files)
)

def edit_file(path:, old_str:, new_str:)
  ensure_inside_working_directory!(path)
  raise "old_str and new_str must be different" if old_str == new_str

  file_path = Pathname.new(path)
  if file_path.exist?
    content = file_path.read
    number_of_matches = content.scan(old_str).size
    raise "old_str not found in file" if number_of_matches == 0
    raise "old_str must match exactly one time in the file" if number_of_matches > 1

    updated_content = content.gsub(old_str, new_str)
    file_path.write(updated_content)
    "OK"
  elsif !file_path.exist? && old_str == ""
    # Create missing parent directories
    file_path.dirname.mkpath
    file_path.write(new_str)
    "Successfully created file #{file_path}"
  end
end

EDIT_FILE_TOOL = Tool.new(
  name: "edit_file",
  description: <<~DESC,
    Make edits to a text file.

    Replaces 'old_str' with 'new_str' in the given file. 'old_str' and 'new_str' MUST be different from each other.

    If the file specified with path doesn't exist, it will be created.
  DESC
  parameters: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file"
      },
      old_str: {
        type: "string",
        description: "Text to search for - must match exactly and must only have one match exactly"
      },
      new_str: {
        type: "string",
        description: "Text to replace old_str with"
      }
    },
    required: ["path", "old_str", "new_str"]
  },
  function: method(:edit_file)
)

def ensure_inside_working_directory!(path)
  path = Pathname.new(path).expand_path
  cwd = Pathname.new(Dir.pwd).expand_path
  return unless path.relative_path_from(cwd).to_s.start_with?("..")

  raise "Path is outside the current working directory."
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
