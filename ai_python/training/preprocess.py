"""Text tokenization for bag-of-words features."""

from __future__ import annotations

import re
from typing import Dict, List

import torch

from config import VOCAB_SIZE


class TextTokenizer:
    def __init__(self, vocab_size: int = VOCAB_SIZE) -> None:
        self.vocab_size = vocab_size
        self.word_to_id: Dict[str, int] = {"<PAD>": 0, "<UNK>": 1}

    def clean_text(self, text: str) -> List[str]:
        return re.findall(r"\b[a-zA-Z0-9_]+\b", text.lower())

    def build_vocab(self, corpus: List[str]) -> None:
        counts: Dict[str, int] = {}
        for sentence in corpus:
            for word in self.clean_text(sentence):
                counts[word] = counts.get(word, 0) + 1

        sorted_words = sorted(counts.items(), key=lambda item: item[1], reverse=True)
        self.word_to_id = {"<PAD>": 0, "<UNK>": 1}
        for word, _ in sorted_words[: self.vocab_size - 2]:
            self.word_to_id[word] = len(self.word_to_id)

    def encode(self, text: str) -> torch.Tensor:
        vector = torch.zeros(self.vocab_size, dtype=torch.float32)
        words = self.clean_text(text)
        if not words:
            vector[1] = 1.0
            return vector

        for word in words:
            idx = self.word_to_id.get(word, 1)
            vector[idx] += 1.0

        norm = torch.linalg.norm(vector)
        if norm > 0:
            vector = vector / norm
        return vector
