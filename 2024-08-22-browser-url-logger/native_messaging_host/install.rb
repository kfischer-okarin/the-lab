#!/usr/bin/env ruby

require 'json'
require 'pathname'

def main
  manifest_dir = Pathname.new('~/Library/Application Support/Mozilla/NativeMessagingHosts').expand_path
  manifest_dir.mkpath

  manifest_path = manifest_dir / 'com.my_private_extension.url_logger.json'
  manifest_content = generate_manifest_content
  puts "Writing manifest file to #{manifest_path}:"
  puts JSON.pretty_generate(manifest_content)

  File.write(manifest_path, JSON.pretty_generate(manifest_content))
end

def generate_manifest_content
  current_dir = Pathname.new(__FILE__).dirname

  {
    name: 'com.my_private_extension.url_logger',
    description: 'Logs received URLs',
    path: (current_dir / 'url_logger.rb').realpath,
    type: 'stdio',
    allowed_extensions: ['url_logger@my_private_extension.com']
  }
end

main if __FILE__ == $PROGRAM_NAME
