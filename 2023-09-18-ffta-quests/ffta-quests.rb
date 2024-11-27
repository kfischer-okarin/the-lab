require 'set'

def main
  quests = parse_quests File.read('quests.txt')

  finished_quests = File.read('finished_quests.txt') rescue ''
  finished_quests = parse_finished_quests(finished_quests)

  owned_items = determine_owned_items(finished_quests, quests: quests)  # puts owned_items.sort.inspect

  available_quests = determine_available_quests(quests, finished_quests: finished_quests, owned_items: owned_items)

  available_quests.each do |quest|
    print_quest(quest)
  end
end

def parse_quests(quest_guide)
  quest_guide_lines = quest_guide.split("\n")
  quests = {}
  next_id = 0

  current_quest_lines = []

  quest_guide_lines.each do |line|
    if title?(line)
      quests[next_id] = process_quest_lines(next_id, current_quest_lines) if next_id >= 1
      current_quest_lines = [line]
      next_id += 1
    else
      current_quest_lines << line
    end
  end
  quests[next_id] =  process_quest_lines(next_id, current_quest_lines)
  raise 'Not all quests processed' unless quests.length == 300

  quests
end

def process_quest_lines(quest_id, quest_lines)
  verify_id(quest_lines, expected_id: quest_id)

  {
    id: quest_id,
    title: TITLE_REGEX.match(quest_lines.first)[2],
    type: parse_content_between(quest_lines, /Type:/, /Info Cost:/).strip,
    location: parse_content_between(quest_lines, /Location:/, /Appears at:/).strip,
    appearance_conditions: parse_appearance_conditions(quest_lines, quest_id: quest_id),
    required_items: parse_required_items(quest_lines),
    rewards: parse_rewards(quest_lines)
  }
rescue => e
  raise "Error processing quest #{quest_id}: #{e.message}"
end

def verify_id(quest_lines, expected_id: nil)
  id = TITLE_REGEX.match(quest_lines.first)[1].to_i
  raise "ID mismatch: #{expected_id} != #{id}" unless expected_id == id
end

def parse_appearance_conditions(quest_lines, quest_id:)
  text = parse_content_between(quest_lines, /Appears at:/, /Reward\/s:/)

  result = {
    # text: text
  }

  completed_quests = []
  completed_quests << quest_id - 1 if quest_id.between?(2, 24)
  quest_number_regex = /#(\d+)/
  text.scan(quest_number_regex) do |match|
    completed_quests << match[0].to_i
  end
  location = parse_content_between(quest_lines, /Location:/, /Appears at:/).strip
  completed_quests << LOCATION_MISSION_REQUIREMENTS[location] if LOCATION_MISSION_REQUIREMENTS[location]
  result[:completed_quests] = completed_quests

  %w[Kingmoon Madmoon Huntmoon Bardmoon Sagemoon].each do |month|
    result[:month] = month if text.include? month
  end

  if text.include? 'The Hero Gaol'
    result[:required_items] = ['The Hero Gaol']
  end

  %w[Muscadet Sprohm Cyril Cadoan].each do |town|
    result[:town] = town if text.include? "#{town} Pub"
  end

  if text =~ /"(.+)" rumor/
    result[:rumors] = Regexp.last_match(1)
  end

  case quest_id
  when 43, 100, 106
    result[:special] = text
  when 56
    result[:special] = text.split('.', 2)[1].strip
  when 87
    result[:special] = 'Free all areas'
  end

  result
end

LOCATION_MISSION_REQUIREMENTS = {
  'Lutia Pass' => 1,
  'Nubswood' => 2,
  'Eluut Sands' => 3,
  'Ulei River' => 4,
  'Cadoan' => 5,
  'Aisenfield' => 6,
  'Roda Volcano' => 7,
  'Koringwood' => 8,
  'Salikawood' => 9,
  'Nargai Cave' => 10,
  'Jagd Dorsa' => 11,
  'Baguba Port' => 11,
  'Kudik Peaks' => 12,
  'Jeraw Sands' => 13,
  'Muscadet' => 14,
  'Uladon Bog' => 15,
  'Gotor Sands' => 16,
  'Delia Dunes' => 17,
  'Jagd Ahli' => 17,
  'Ozmonfield' => 18,
  'Bervenia Palace' => 19,
  'Tubola Cave' => 20,
  'Jagd Helje' => 20,
  'Deti Plains' => 21,
  'Siena Gorge' => 22
}

def parse_required_items(quest_lines)
  line = parse_content_between(quest_lines, /Req\. Items:/, /Req\. Skills:/).strip
  return [] if line == '-'

  line.split('/').map(&:strip)
end

def parse_rewards(quest_lines)
  line = parse_content_between(quest_lines, %r{Reward/s:}, /Req\. Items/)
  rewards = line.split(', ').map(&:strip)
  rewards.map! { |reward|
    if reward.include? 'Helje Key'
      'Helje Key'
    elsif reward.include? 'The Hero Gaol'
      'The Hero Gaol'
    else
      reward
    end
  }
  rewards.reject { |reward|
    %w[Gil placement Random Antilaw].any? { |word| reward.include?(word) } ||
      ['End of game'].include?(reward)
  }
end

def parse_finished_quests(finished_quests)
  Set.new if finished_quests.empty?

  Set.new finished_quests.split("\n").map(&:to_i)
end

def determine_owned_items(finished_quests, quests:)
  result = Set.new
  finished_quests.each do |quest_id|
    result += quests[quest_id][:rewards]
  end
  finished_quests.each do |quest_id|
    next unless item_will_be_consumed?(quest_id)

    result -= quests[quest_id][:required_items]
  end
  result
end

def item_will_be_consumed?(quest_id)
  quest_id != 50
end

def determine_available_quests(quests, finished_quests:, owned_items:)
  result = []
  quests.each do |quest_id, quest|
    next if finished_quests.include?(quest_id)

    next unless quest[:appearance_conditions][:completed_quests].all? { |completed_quest_id|
      finished_quests.include?(completed_quest_id)
    }
    next unless quest[:required_items].all? { |required_item|
      owned_items.include?(required_item)
    }

    result << quest
  end
  result
end

def print_quest(quest)
  puts "##{quest[:id]} #{quest[:title]}"
  case quest[:type]
  when 'Engagement'
    puts "  Location: #{quest[:location]}"
  else
    puts "  Type: #{quest[:type]}"
  end
  puts "  Month: #{quest[:appearance_conditions][:month]}" if quest[:appearance_conditions][:month]
  puts "  Conditions: #{quest[:appearance_conditions][:special]}" if quest[:appearance_conditions][:special]
  puts
end

def parse_content_between(quest_lines, start_regex, end_regex)
  line_index = quest_lines.index { |line| line =~ start_regex }
  raise "Couln't find #{start_regex}" unless line_index

  match = quest_lines[line_index].match(start_regex)
  result = quest_lines[line_index][match.end(0)..-1].strip
  line_index += 1
  until quest_lines[line_index] =~ end_regex
    result << ' ' << quest_lines[line_index].strip
    line_index += 1
  end
  result
end

def title?(line)
  line =~ TITLE_REGEX
end


TITLE_REGEX = /#(\d+) ([\w !.&'-?]+) ~/.freeze

main if $PROGRAM_NAME == __FILE__
