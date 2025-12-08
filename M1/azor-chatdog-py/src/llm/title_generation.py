"""
Module for generating session titles using LLM.
"""

from typing import List, Dict, Any, Union
from llm.gemini_client import GeminiLLMClient
from llm.llama_client import LlamaClient
from llm.claude_client import ClaudeLLMClient


def generate_title_from_history(
    llm_client: Union[GeminiLLMClient, LlamaClient, ClaudeLLMClient],
    history: List[Dict]
) -> str | None:
    """
    Generates a concise, descriptive title (max 60 characters) from conversation history.
    
    Args:
        llm_client: The LLM client to use for generation
        history: Conversation history in universal format
        
    Returns:
        Generated title (trimmed to 60 chars) or None if generation fails
    """
    if not history or len(history) < 2:
        return None
    
    # System prompt for title generation
    title_system_prompt = """Na podstawie poniższej historii rozmowy wygeneruj krótki, opisowy tytuł (max 60 znaków).
Tytuł powinien odzwierciedlać główny temat lub cel rozmowy.
Odpowiedz TYLKO tytułem, bez dodatkowych wyjaśnień, bez cudzysłowów, bez znaków nowej linii.
Jeśli rozmowa jest w języku polskim, tytuł powinien być po polsku. Jeśli w innym języku, użyj tego języka."""
    
    # Prepare history for title generation (use existing history)
    try:
        # Create a temporary chat session for title generation
        temp_session = llm_client.create_chat_session(
            system_instruction=title_system_prompt,
            history=history,
            thinking_budget=0
        )
        
        # Send a simple prompt asking for title
        prompt = "Wygeneruj tytuł dla tej rozmowy."
        response = temp_session.send_message(prompt)
        
        # Extract text from response
        title_text = ""
        if hasattr(response, 'text'):
            title_text = response.text
        elif isinstance(response, str):
            title_text = response
        else:
            # Try to extract from parts if available
            if hasattr(response, 'parts') and response.parts:
                for part in response.parts:
                    if hasattr(part, 'text'):
                        title_text = part.text
                        break
        
        # Clean and validate title
        title_text = title_text.strip()
        
        # Remove surrounding quotes if present
        if title_text.startswith('"') and title_text.endswith('"'):
            title_text = title_text[1:-1]
        elif title_text.startswith("'") and title_text.endswith("'"):
            title_text = title_text[1:-1]
        
        title_text = title_text.strip()
        
        # Validate: must be at least 3 characters
        if len(title_text) < 3:
            return None
        
        # Trim to 60 characters and add ellipsis if needed
        if len(title_text) > 60:
            title_text = title_text[:57] + "..."
        
        return title_text
        
    except Exception as e:
        # Silently fail - don't interrupt the main conversation
        # Title generation is a best-effort feature
        return None

