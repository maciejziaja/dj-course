#!/usr/bin/env python3
"""
Build all required tokenizers for the assignment.
"""

from tokenizer_build_dynamic import build_tokenizer

def main():
    """Build all required tokenizers with different configurations."""

    tokenizers_to_build = [
        {
            "corpus": "PAN_TADEUSZ",
            "output": "tokenizers/tokenizer-pan-tadeusz.json",
            "vocab_size": 32000,
            "description": "Pan Tadeusz only"
        },
        {
            "corpus": "WOLNELEKTURY",
            "output": "tokenizers/tokenizer-wolnelektury.json",
            "vocab_size": 32000,
            "description": "Wolne Lektury corpus"
        },
        {
            "corpus": "NKJP",
            "output": "tokenizers/tokenizer-nkjp.json",
            "vocab_size": 32000,
            "description": "NKJP corpus"
        },
        {
            "corpus": "ALL",
            "output": "tokenizers/tokenizer-all-corpora.json",
            "vocab_size": 32000,
            "description": "All corpora combined"
        },
        # Larger vocabulary experiments
        {
            "corpus": "ALL",
            "output": "tokenizers/tokenizer-all-corpora-48k.json",
            "vocab_size": 48000,
            "description": "All corpora - 48k vocab"
        },
        {
            "corpus": "ALL",
            "output": "tokenizers/tokenizer-all-corpora-64k.json",
            "vocab_size": 64000,
            "description": "All corpora - 64k vocab"
        },
        {
            "corpus": "WOLNELEKTURY",
            "output": "tokenizers/tokenizer-wolnelektury-48k.json",
            "vocab_size": 48000,
            "description": "Wolne Lektury - 48k vocab"
        },
    ]

    print("Building all tokenizers...")
    print(f"Total: {len(tokenizers_to_build)} tokenizers\n")

    for i, config in enumerate(tokenizers_to_build, 1):
        print(f"\n[{i}/{len(tokenizers_to_build)}] {config['description']}")
        try:
            build_tokenizer(
                corpus_name=config["corpus"],
                output_file=config["output"],
                vocab_size=config["vocab_size"]
            )
        except Exception as e:
            print(f"✗ Error building tokenizer: {e}")
            continue

    print("\n" + "="*60)
    print("All tokenizers built successfully!")
    print("="*60)


if __name__ == "__main__":
    main()
