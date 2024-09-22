#!/usr/bin/env ruby

require 'json'
require 'pathname'

def main
  generate_manifest
end

def generate_manifest
  manifest_dir.mkpath

  manifest_path = manifest_dir / 'com.my_private_extension.url_logger.json'
  manifest_content_json = JSON.pretty_generate(generate_manifest_content)
  puts "Writing manifest file to #{manifest_path}:"
  puts manifest_content_json

  File.write(manifest_path, manifest_content_json)
end

def manifest_dir
  # TODO: Support other browsers & OSes
  Pathname.new('~/Library/Application Support/Mozilla/NativeMessagingHosts').expand_path
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
