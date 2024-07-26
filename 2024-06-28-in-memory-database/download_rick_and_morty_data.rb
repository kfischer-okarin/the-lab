require 'bundler/setup'

require 'json'
require 'httparty'

def main
  result = {}
  urls = retrieve_base_urls
  urls.each do |url|
    result.merge!(retrieve_all_entities(url))
  end

  File.write('data.json', JSON.pretty_generate(result))
end

def retrieve_base_urls
  response = HTTParty.get('https://rickandmortyapi.com/api/').parsed_response
  response.values
end

def retrieve_all_entities(base_url)
  result = {}
  next_url = base_url

  while next_url
    puts "Retrieving #{next_url}..."
    response = HTTParty.get(next_url).parsed_response

    response['results'].each do |entity|
      result[entity['url']] = entity
    end

    next_url = response['info']['next']
  end
  result
end

main if $PROGRAM_NAME == __FILE__
