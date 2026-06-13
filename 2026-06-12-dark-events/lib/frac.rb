# frozen_string_literal: true

# Fractional indexing: generate sortable string keys so that a new key can
# always be minted strictly between two existing keys. Reordering one item
# touches only that item's key, which keeps YAML diffs tiny.
#
# Keys are interpreted as base-62 fractions in (0, 1) with an implicit "0."
# prefix, using an ASCII-ordered alphabet so plain string comparison sorts them.
module Frac
  DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  BASE = DIGITS.length

  module_function

  # A key strictly between +lo+ and +hi+. A nil/empty +lo+ means "before the
  # start"; a nil/empty +hi+ means "after the end".
  def key_between(lo, hi)
    lo = nil if lo.nil? || lo.empty?
    hi = nil if hi.nil? || hi.empty?
    raise ArgumentError, "lo (#{lo}) must sort before hi (#{hi})" if lo && hi && lo >= hi

    midpoint(lo, hi)
  end

  # Evenly spaced keys for a fresh ordered list of +count+ items.
  def initial_keys(count)
    return [] if count <= 0

    step = BASE / (count + 1)
    return (1..count).map { |i| DIGITS[i * step] } if step >= 1

    # More items than single-digit slots: fall back to sequential midpoints.
    keys = []
    prev = nil
    count.times { keys << (prev = key_between(prev, nil)) }
    keys
  end

  def midpoint(lo, hi)
    n = common_prefix_length(lo, hi)
    lo_digit = digit(lo, n)
    hi_digit = hi ? digit(hi, n) : BASE
    # Build the prefix from shared digits so lo's implicit trailing zeros
    # (where it is shorter than hi) are preserved rather than truncated.
    prefix = (0...n).map { |i| DIGITS[digit(lo, i)] }.join

    if hi_digit - lo_digit >= 2
      prefix + DIGITS[lo_digit + (hi_digit - lo_digit) / 2]
    else
      # Digits are adjacent: keep lo's digit and descend toward the upper bound.
      prefix + DIGITS[lo_digit] + midpoint(suffix(lo, n + 1), nil)
    end
  end

  def common_prefix_length(lo, hi)
    n = 0
    n += 1 while digit(lo, n) == (hi ? digit(hi, n) : BASE)
    n
  end

  def digit(str, index)
    return 0 if str.nil? || index >= str.length

    DIGITS.index(str[index]) || raise(ArgumentError, "bad key #{str.inspect}")
  end

  def suffix(str, from)
    return "" if str.nil? || from >= str.length

    str[from..]
  end
end
