import os
import asyncio
from dotenv import load_dotenv
from anthropic import Anthropic, AsyncClient
import mlflow

load_dotenv()

# Konfiguracja MLFlow z autolog
mlflow.set_experiment("anthropic-tracking")
mlflow.anthropic.autolog()

print(f"env var \"ANTHROPIC_API_KEY\": { os.getenv('ANTHROPIC_API_KEY', '')[:4] + '...' + os.getenv('ANTHROPIC_API_KEY', '')[-4:] if len(os.getenv('ANTHROPIC_API_KEY', '')) > 0 else 'NOT SET' }")
if not os.getenv('ANTHROPIC_API_KEY'):
    raise ValueError("ANTHROPIC_API_KEY environment variable is not set. Please set it to your OpenAI API key.")


client = AsyncClient(api_key=os.getenv('ANTHROPIC_API_KEY'))
MODEL = 'claude-3-5-haiku-latest'
# MODEL = 'claude-haiku-4-5'
# MODEL = 'claude-opus-4-1'
# MODEL = 'claude-sonnet-4-5'

message_history = [
    {"role": "user", "content": "Proszę, napisz mi świetny dowcip programistyczny z którego wszyscy się będą śmiali, nawet moja babcia."},
    {"role": "assistant", "content": "Dlaczego programista nie lubi chodzić do restauracji?\nBo zawsze sprawdza \"if\" (warunek) przed zamówieniem."},
    {"role": "user", "content": "Ten żart był głupi i nudny. Poproszę o lepszy żart, który będzie faktycznie zabawny. Zwróć tylko treść żartu."}
]

async def send_message(messages):
    message = await client.messages.create(
        model=MODEL,
        max_tokens=256,
        messages=messages,
    )
    return message

async def main():
    response = await send_message(message_history)
    print(response.content[0].text)

if __name__ == '__main__':
    asyncio.run(main())
