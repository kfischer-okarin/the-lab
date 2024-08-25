#!/usr/bin/env ruby

require 'json'
require 'pathname'

CURRENT_DIR = Pathname.new(__FILE__).dirname
MANIFEST_PATH = Pathname.new('~/Library/Application Support/Mozilla/NativeMessagingHosts').expand_path

# generate ~/Library/Application Support/Mozilla/NativeMessagingHosts/com.my_private_extension.url_logger.json
def generate_manifest
  {
    name: 'com.my_private_extension.url_logger',
    description: 'Logs received URLs',
    path: (CURRENT_DIR / 'url_logger.rb').realpath,
    type: 'stdio',
    allowed_extensions: ['url_logger@my_private_extension.com']
  }
end

json_content = JSON.pretty_generate(generate_manifest)
MANIFEST_PATH.mkpath
File.write(MANIFEST_PATH / 'com.my_private_extension.url_logger.json', json_content)
puts 'Wrote manifest file:'
puts json_content
