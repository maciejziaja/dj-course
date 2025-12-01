#!/usr/bin/env python3
"""
Download a tokenizer from HuggingFace.
We'll use a Polish GPT-2 model tokenizer as an alternative to Bielik.
"""

import requests
from pathlib import Path

def download_tokenizer(model_id: str, output_file: str):
    """
    Download a tokenizer from HuggingFace.

    Args:
        model_id: HuggingFace model ID (e.g., "sdadas/polish-gpt2-medium")
        output_file: Path to save the tokenizer JSON file
    """
    # Construct the URL
    url = f"https://huggingface.co/{model_id}/raw/main/tokenizer.json"

    print(f"Downloading tokenizer from: {model_id}")
    print(f"URL: {url}")

    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()

        # Create output directory if needed
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Save the tokenizer
        with open(output_file, 'wb') as f:
            f.write(response.content)

        print(f"✓ Tokenizer saved to: {output_file}")

    except requests.exceptions.RequestException as e:
        print(f"✗ Error downloading tokenizer: {e}")
        print("\nTrying alternative URL with 'tokenizer.json'...")

        # Some models might have different paths
        raise


def main():
    """Download tokenizers from HuggingFace."""

    tokenizers = [
        {
            "model_id": "sdadas/polish-gpt2-medium",
            "output": "tokenizers/tokenizer-polish-gpt2.json",
            "description": "Polish GPT-2 Medium"
        },
        # Alternative if the above doesn't work
        # {
        #     "model_id": "allegro/herbert-base-cased",
        #     "output": "tokenizers/tokenizer-herbert.json",
        #     "description": "Herbert (Polish BERT)"
        # },
    ]

    print("Downloading tokenizers from HuggingFace...\n")

    for config in tokenizers:
        print(f"\n{'='*60}")
        print(f"Model: {config['description']}")
        print(f"{'='*60}")
        try:
            download_tokenizer(
                model_id=config["model_id"],
                output_file=config["output"]
            )
        except Exception as e:
            print(f"✗ Failed to download: {e}")
            continue

    print("\n" + "="*60)
    print("Download complete!")
    print("="*60)


if __name__ == "__main__":
    main()
