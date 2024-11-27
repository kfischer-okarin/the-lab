require 'json'

def main
  monstername = ARGV[0]

  output = "### #{monstername}\n"
  # parse json file into hash
  skills_by_monster = JSON.parse(File.read('monster-skills-jp.json'))
  raise "Monster not found: #{monstername}" unless skills_by_monster.key?(monstername)

  skill_descriptions = JSON.parse(File.read('skills-jp.json'))

  monster_skills = skills_by_monster[monstername]
  monster_skills.sort_by! { |skill| skill_descriptions[skill]['ＬＶ'].to_i }
  monster_skills.each do |skill|
    description = skill_descriptions[skill]
    output << "- #{skill}\n"
    output << "  - #{description['効　果']}\n"
    output << "  - Lv #{description['ＬＶ']}"
    output << " HP #{description['Ｈ']}" unless description['Ｈ'].empty?
    output << " MP #{description['Ｍ']}" unless description['Ｍ'].empty?
    output << " 攻 #{description['攻']}" unless description['攻'].empty?
    output << " 守 #{description['守']}" unless description['守'].empty?
    output << " 早 #{description['早']}" unless description['早'].empty?
    output << " 賢 #{description['賢']}" unless description['賢'].empty?
    output << "\n"
  end


  puts output
end

main if $PROGRAM_NAME == __FILE__
