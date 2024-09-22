#!/usr/bin/env ruby

require 'json'
require 'logger'
require 'open3'
require 'shellwords'

LOGGER = Logger.new('url_logger.log', 2)

def main
  LOGGER.info('Starting URL logger')
  LOGGER.info("ENV: #{ENV.inspect}")
  loop do
    message = read_extension_native_message
    next unless message

    send_to_logger(message)
  end
end

def read_extension_native_message
  length = $stdin.read(4)&.unpack1('L')
  return nil unless length
  LOGGER.info("read length: #{length}")

  raw_message = $stdin.read(length)
  LOGGER.info("read message: #{raw_message.inspect}")

  JSON.parse(raw_message)
end

def write_extension_native_message(message)
  message = message.to_json
  length = [message.bytesize].pack('L')
  $stdout.write(length)
  $stdout.write(message)
  LOGGER.info("written length: #{length.inspect}")
  LOGGER.info("written message: #{message.inspect}")
  $stdout.flush
end

def send_to_logger(message)
  escaped_url = Shellwords.escape(message['url'])
  escaped_title = Shellwords.escape(message['title'])
  command = %Q{#{ENV['LOG_BINARY_PATH']} #{escaped_url} #{escaped_title}}
  LOGGER.info("executing command: #{command}")

  output, status = Open3.capture2e(command)
  LOGGER.info("status: #{status}, output: #{output}") unless status.success?
end

main if __FILE__ == $PROGRAM_NAME
