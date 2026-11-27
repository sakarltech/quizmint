// Keep legacy option indices (0–3) and store multi-select sets as a bitmask offset by 4.
export function encodeArenaAnswer(answer) {
  return Array.isArray(answer) ? 4 + answer.reduce((mask, index) => mask | (1 << index), 0) : answer;
}

export function decodeArenaAnswer(encoded) {
  return encoded < 4 ? encoded : [0, 1, 2, 3].filter(index => (encoded - 4) & (1 << index));
}
