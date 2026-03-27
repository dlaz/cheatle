class WordScorer(object):

  def __init__(self, word_list):
    self._word_list = word_list
    self._letter_frequencies: Counter[str] = Counter(
        chain.from_iterable(word_list))

    self._letter_position_frequencies = place_counts = [Counter() for _ in next(iter(word_list))]
    for w in word_list:
      for p, l in enumerate(w):
        self._letter_position_frequencies[p][l] += 1

    self._sorted_candidate_words = list(
        sorted(
            word_list,
            key=lambda w: sum(lpf[l] for l, lpf in zip(w, self._letter_position_frequencies))
            # key=lambda w: sum(self._letter_frequencies[l] for l in w),
          )
    )
    self._ranked_words = {
        w: i for i, w in enumerate(self._sorted_candidate_words)
    }
    self._unique_letters = {
        w: len(set(w)) for w in self._sorted_candidate_words
    }

  def score(self, word):
    return self._ranked_words[word]# + self._unique_letters[word] * 10


class GameState(object):
  def __init__(self, size: int=5):

    self._size = size

    # Words that are the right length.
    candidate_words: set[str] = set([w for w in WORDS if len(w) == size])

    # Words with no repeated letters.
    start_words: set[str] = set([w for w in candidate_words if len(set(w)) == len(w)])
    letter_frequencies: Counter[str] = Counter(chain.from_iterable(candidate_words))

    self.scorer = WordScorer(candidate_words)

    self._sorted_start_words = list(
        sorted(
            start_words,
            key=lambda w: self.scorer.score(w),
            reverse=True
          )
    )

    self._sorted_candidate_words = list(
        sorted(
            candidate_words,
            key=lambda w: self.scorer.score(w),
            reverse=True
          )
    )

    # Places and possible letters for that place.
    # Dict of letter -> set of possible positions
    self._candidate_letters: dict[str,set[int]] = {
        p: set(string.ascii_lowercase) for p in range(size)
    }

    # Letters that have been marked as yellow.
    self._required_letters = set()

  def _is_start_state(self) -> bool:
    default_value_length = len(string.ascii_lowercase)
    return all(len(v) == default_value_length
               for v in self._candidate_letters.values())

  def _make_regex(self) -> re.Pattern:
    regex = r'(?=.*'
    for place, letters in self._candidate_letters.items():
      regex += f'[{"".join(letters)}]'
    regex += r')'
    for letter in self._required_letters:
      regex += f'(?=.*{letter})'

    required_letters_regex = f'[{"".join(self._required_letters)}]'

    return re.compile(regex)

  def _make_explore_regex(self) -> re.Pattern:
    # Letters we know are in the solution
    known_letters = set.union(
        *[l for l in g._candidate_letters.values() if len(l)==1], g._required_letters
    )

    return re.compile(f'[^{1}]')

  def move(self, word: str, result: str):
    if len(word) != self._size:
      raise ValueError(f'{word} has length {len(word)}, expected {self._size}')
    if len(result) != self._size:
      raise ValueError(f'{result} has length {len(word)}, expected {self._size}')

    try:
      self._sorted_start_words.remove(word)
      self._sorted_candidate_words.remove(word)
    except ValueError:
      # Don't care if word isn't in list
      pass

    dont_remove_if_gray = set(l for l, r in zip(word, result) if r == 'y')

    for pos, (l, r) in enumerate(zip(word, result)):
      if r == 'g':
        # Update position to only this letter
        self._candidate_letters[pos] = set([l])
      elif r == 'y':
        self._required_letters.add(l)
        # We know the letter isn't here, but it's somewhere else
        self._candidate_letters[pos].discard(l)
      elif r == 'x' and l not in dont_remove_if_gray:
        # Letter isn't anywhere (unless it's already correct somewhere)
        for opos in range(self._size):
          if len(self._candidate_letters[opos]) > 1:
            self._candidate_letters[opos].discard(l)

  def suggest(self) -> str:
    if self._is_start_state():
      return self._sorted_start_words

    regex = g._make_regex()
    return [w for w in self._sorted_candidate_words if regex.match(w)]