Dir.glob('**/*_tests.rb').each { |file|
  require_relative file
}
