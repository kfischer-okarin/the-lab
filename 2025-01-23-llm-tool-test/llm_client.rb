require 'bundler/setup'

require 'httparty'
require 'json'

class LLMClient
  Config = Data.define(:base_url, :model)

  def initialize(config)
    @config = config
  end

  def chat_completion(body)
    body = {
      model: @config.model,
      **body
    }

    response = HTTParty.post(
      chat_completion_url,
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

  private

  def chat_completion_url
    @chat_completion_url ||= "#{@config.base_url}/v1/chat/completions"
  end
end
