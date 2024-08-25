#!/usr/bin/env ruby

require 'json'

def read_extension_native_message
  length = $stdin.read(4)&.unpack1('L')
  return nil unless length

  JSON.parse($stdin.read(length))
end

def write_extension_native_message(message)
  message = message.to_json
  length = [message.length].pack('L')
  $stdout.write(length)
  $stdout.write(message)
  $stdout.flush
end

loop do
  message = read_extension_native_message

  write_extension_native_message(message.merge('response' => 'pong'))
end
