#!/usr/bin/env ruby

require 'json'
require 'logger'

LOGGER = Logger.new('url_logger.log', 2)

def main
  loop do
    message = read_extension_native_message
    next unless message

    send_to_emacs(message)
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

def send_to_emacs(message)
  elisp_code = "(kf-org-capture-url \"#{message['url']}\" \"#{message['title']}\")"
  command = "emacsclient -e '#{elisp_code}' > /dev/null"

  LOGGER.info("executing command: #{command}")

  system command
end

main if __FILE__ == $PROGRAM_NAME
