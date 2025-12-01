#!/usr/bin/env python3
"""
Dynamic BPE Tokenizer Builder
Trains custom tokenizers on various Polish text corpora with configurable parameters.
"""

import argparse
from pathlib import Path
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer
from tokenizers.pre_tokenizers import Whitespace
from corpora import CORPORA_FILES

def build_tokenizer(
    corpus_name: str,
    output_file: str,
    vocab_size: int = 32000,
    min_frequency: int = 2,
    special_tokens: list = None
):
    """
    Build a BPE tokenizer from the specified corpus.

    Args:
        corpus_name: Name of the corpus (PAN_TADEUSZ, WOLNELEKTURY, NKJP, ALL, SPICHLERZ)
        output_file: Path to save the tokenizer JSON file
        vocab_size: Size of the vocabulary (default: 32000)
        min_frequency: Minimum frequency for a token to be included (default: 2)
        special_tokens: List of special tokens (default: standard tokens)
    """
    if special_tokens is None:
        special_tokens = ["[UNK]", "[CLS]", "[SEP]", "[PAD]", "[MASK]"]

    # Get corpus files
    if corpus_name not in CORPORA_FILES:
        raise ValueError(f"Corpus '{corpus_name}' not found. Available: {list(CORPORA_FILES.keys())}")

    files = CORPORA_FILES[corpus_name]
    if not files:
        raise ValueError(f"No files found for corpus '{corpus_name}'")

    # Convert to strings
    file_paths = [str(f) for f in files]

    print(f"\n{'='*60}")
    print(f"Building tokenizer: {output_file}")
    print(f"Corpus: {corpus_name}")
    print(f"Files: {len(file_paths)}")
    print(f"Vocab size: {vocab_size}")
    print(f"Min frequency: {min_frequency}")
    print(f"{'='*60}\n")

    # Initialize the Tokenizer (BPE model)
    tokenizer = Tokenizer(BPE(unk_token="[UNK]"))

    # Set the pre-tokenizer (split on whitespace)
    tokenizer.pre_tokenizer = Whitespace()

    # Set the Trainer
    trainer = BpeTrainer(
        special_tokens=special_tokens,
        vocab_size=vocab_size,
        min_frequency=min_frequency
    )

    # Train the Tokenizer
    print("Training tokenizer...")
    tokenizer.train(file_paths, trainer=trainer)

    # Create output directory if needed
    output_path = Path(output_file)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Save the tokenizer
    tokenizer.save(output_file)
    print(f"✓ Tokenizer saved to: {output_file}")

    # Test the tokenizer
    test_sentences = [
        "Litwo! Ojczyzno moja! ty jesteś jak zdrowie.",
        "Jakże mi wesoło!",
        "W Paryżu żyje wielu Polaków.",
    ]

    print("\nTest tokenization:")
    for txt in test_sentences:
        encoded = tokenizer.encode(txt)
        print(f"\nText: {txt}")
        print(f"Tokens: {encoded.tokens}")
        print(f"Count: {len(encoded.tokens)}")

    return tokenizer


def main():
    parser = argparse.ArgumentParser(
        description="Build custom BPE tokenizers from Polish text corpora"
    )
    parser.add_argument(
        "--corpus",
        type=str,
        required=True,
        help="Corpus name (PAN_TADEUSZ, WOLNELEKTURY, NKJP, ALL, SPICHLERZ)"
    )
    parser.add_argument(
        "--output",
        type=str,
        required=True,
        help="Output file path (e.g., tokenizers/tokenizer-pan-tadeusz.json)"
    )
    parser.add_argument(
        "--vocab-size",
        type=int,
        default=32000,
        help="Vocabulary size (default: 32000)"
    )
    parser.add_argument(
        "--min-frequency",
        type=int,
        default=2,
        help="Minimum token frequency (default: 2)"
    )

    args = parser.parse_args()

    build_tokenizer(
        corpus_name=args.corpus,
        output_file=args.output,
        vocab_size=args.vocab_size,
        min_frequency=args.min_frequency
    )


if __name__ == "__main__":
    main()
