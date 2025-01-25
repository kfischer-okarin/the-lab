require 'bundler/setup'

require 'logger'

require_relative 'llm_client'
require 'json-schema'

class LlmJsonSchemaFixer
  class << self
    def logger
      @logger ||= Logger.new(STDOUT, level: :info, progname: name)
    end
  end

  def initialize(llm_config)
    @client = LLMClient.new(llm_config)
  end

  def fix(json_string, schema)
    10.times do
      error_message = nil
      begin
        parsed_json = JSON.parse(json_string)

        JSON::Validator.validate!(schema, parsed_json)

        return parsed_json
      rescue JSON::Schema::ValidationError => e
        error_message = e.message

        prompt = fix_json_not_matching_schema_prompt(json_string, schema, error_message)
        self.class.logger.debug(prompt)
        json_string = @client.simple_prompt(prompt, temperature: 0)
        self.class.logger.debug(json_string)
      rescue JSON::ParserError => e
        error_message = e.message

        prompt = fix_invalid_json_string_prompt(json_string, error_message)
        self.class.logger.debug(prompt)
        json_string = @client.simple_prompt(prompt, temperature: 0)
        self.class.logger.debug(json_string)
      end
    end
  end

  private

  def fix_json_not_matching_schema_prompt(json_string, schema, error_message)
    <<~MESSAGE
      Given this JSON schema:
        #{schema.to_json}
      this JSON string between <value> and </value>:
        <value>#{json_string}</value>
      caused the following error:
        '#{error_message}'
      Please respond ONLY with the correct JSON string.
    MESSAGE
  end

  def fix_invalid_json_string_prompt(json_string, error_message)
    <<~MESSAGE
      The value between <value> and </value> is not a valid JSON string:
        <value>#{json_string}</value>
      caused the following error:
        '#{error_message}'
      Please respond ONLY with the correct JSON string.
    MESSAGE
  end
end
