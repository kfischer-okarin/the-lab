#!/usr/bin/env ruby

require 'json'
require 'pathname'

def main
  unless ARGV.length == 1
    puts "Usage: #{$PROGRAM_NAME} <log_binary_path>"
    exit 1
  end

  log_binary_path = Pathname.new(ARGV.first)

  generate_wrapper(log_binary_path)
  generate_manifest
end

def generate_manifest
  manifest_dir.mkpath

  manifest_path = manifest_dir / 'com.my_private_extension.url_logger.json'
  manifest_content_json = JSON.pretty_generate(generate_manifest_content)
  puts "Writing manifest file to #{manifest_path}:"
  puts manifest_content_json
  puts

  File.write(manifest_path, manifest_content_json)
end

def manifest_dir
  # TODO: Support other browsers & OSes
  Pathname.new('~/Library/Application Support/Mozilla/NativeMessagingHosts').expand_path
end

def generate_manifest_content
  {
    name: 'com.my_private_extension.url_logger',
    description: 'Logs received URLs',
    path: wrapper_path.realpath.to_s,
    type: 'stdio',
    allowed_extensions: ['url_logger@my_private_extension.com']
  }
end

def generate_wrapper(log_binary_path)
  wrapper_content = <<~BASH
    #!/bin/bash

    export LOG_BINARY_PATH="#{log_binary_path}"

    exec $(dirname $0)/url_logger.rb
  BASH

  puts "Writing wrapper file to #{wrapper_path}:"
  puts wrapper_content
  puts
  puts "If customizations are needed, edit the file at the above path."

  File.write(wrapper_path, wrapper_content)
  File.chmod(0o755, wrapper_path)
end

def wrapper_path
  current_dir = Pathname.new(__FILE__).dirname
  current_dir / 'url_logger_wrapper.sh'
end

main if __FILE__ == $PROGRAM_NAME
