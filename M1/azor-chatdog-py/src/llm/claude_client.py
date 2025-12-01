"""
Anthropic Claude LLM Client Implementation
Encapsulates all Anthropic Claude AI interactions.
"""

import os
import sys
from typing import Optional, List, Any, Dict
from anthropic import Anthropic
from dotenv import load_dotenv
from cli import console
from files import parameter_store
from .claude_validation import ClaudeConfig

class ClaudeChatSessionWrapper:
    """
    Wrapper for Claude chat session that provides universal dictionary-based history format.
    This ensures compatibility with GeminiClient's and LlamaClient's history format.
    """
    
    def __init__(
        self,
        claude_client: Anthropic,
        model_name: str,
        system_instruction: str,
        history: Optional[List[Dict]] = None,
        temperature: Optional[float] = None,
        top_p: Optional[float] = None,
    ):
        """
        Initialize wrapper with Claude client and session parameters.
        
        Args:
            claude_client: The Anthropic client instance
            model_name: Name of the Claude model to use
            system_instruction: System prompt for the assistant
            history: Previous conversation history in universal format
        """
        self.claude_client = claude_client
        self.model_name = model_name
        self.system_instruction = system_instruction
        self._history = history or []
        self.temperature = temperature
        self.top_p = top_p
    
    def send_message(self, text: str) -> Any:
        """
        Sends message to Claude API and returns response.
        
        Args:
            text: User's message
            
        Returns:
            Response object with .text attribute
        """
        # Add user message to history
        user_message = {"role": "user", "parts": [{"text": text}]}
        self._history.append(user_message)
        
        # Convert universal history format to Claude format
        claude_messages = []
        for entry in self._history[:-1]:  # Exclude the last message (current user input)
            if isinstance(entry, dict) and 'role' in entry and 'parts' in entry:
                text_content = entry['parts'][0].get('text', '') if entry['parts'] else ''
                if text_content:
                    # Claude uses "assistant" instead of "model"
                    role = "assistant" if entry['role'] == "model" else entry['role']
                    claude_messages.append({
                        "role": role,
                        "content": text_content
                    })
        
        try:
            # Send message to Claude API
            request_kwargs = {
                "model": self.model_name,
                "max_tokens": 4096,
                "system": self.system_instruction,
                "messages": claude_messages + [{"role": "user", "content": text}],
            }

            if self.temperature is not None:
                request_kwargs["temperature"] = self.temperature
            if self.top_p is not None:
                request_kwargs["top_p"] = self.top_p
            response = self.claude_client.messages.create(**request_kwargs)
            
            response_text = response.content[0].text
            
            # Add assistant response to history
            assistant_message = {"role": "model", "parts": [{"text": response_text}]}
            self._history.append(assistant_message)
            
            # Return response object compatible with Gemini interface
            return ClaudeResponse(response_text)
            
        except Exception as e:
            console.print_error(f"Błąd podczas komunikacji z Claude API: {e}")
            error_text = "Przepraszam, wystąpił błąd podczas generowania odpowiedzi."
            assistant_message = {"role": "model", "parts": [{"text": error_text}]}
            self._history.append(assistant_message)
            return ClaudeResponse(error_text)
    
    def get_history(self) -> List[Dict]:
        """
        Gets conversation history in universal dictionary format.
        
        Returns:
            List of dictionaries with format: {"role": "user|model", "parts": [{"text": "..."}]}
        """
        return self._history


class ClaudeResponse:
    """
    Response object compatible with Gemini's response interface.
    """
    
    def __init__(self, text: str):
        self.text = text


class ClaudeLLMClient:
    """
    Encapsulates all Anthropic Claude AI interactions.
    Provides a clean interface for chat sessions, token counting, and configuration.
    """
    
    def __init__(self, model_name: str, api_key: str):
        """
        Initialize the Claude LLM client with explicit parameters.
        
        Args:
            model_name: Model to use (e.g., 'claude-3-5-haiku-latest')
            api_key: Anthropic API key
        
        Raises:
            ValueError: If api_key is empty or None
        """
        if not api_key:
            raise ValueError("API key cannot be empty or None")
        
        self.model_name = model_name
        self.api_key = api_key
        
        # Initialize the client during construction
        self._client = self._initialize_client()
    
    @staticmethod
    def preparing_for_use_message() -> str:
        """
        Returns a message indicating that Claude client is being prepared.
        
        Returns:
            Formatted preparation message string
        """
        return "🤖 Przygotowywanie klienta Claude..."
    
    @classmethod
    def from_environment(cls) -> 'ClaudeLLMClient':
        """
        Factory method that creates a ClaudeLLMClient instance from environment variables.
        
        Returns:
            ClaudeLLMClient instance initialized with environment variables
            
        Raises:
            ValueError: If required environment variables are not set
        """
        load_dotenv()
    
        # Walidacja z Pydantic
        config = ClaudeConfig(
            model_name=os.getenv('MODEL_NAME', 'claude-3-5-haiku-latest'),
            anthropic_api_key=os.getenv('ANTHROPIC_API_KEY', '')
        )
        
        return cls(model_name=config.model_name, api_key=config.anthropic_api_key)
    
    def _initialize_client(self) -> Anthropic:
        """
        Initializes the Anthropic client.
        
        Returns:
            Initialized Anthropic client
            
        Raises:
            SystemExit: If client initialization fails
        """
        try:
            return Anthropic(api_key=self.api_key)
        except Exception as e:
            console.print_error(f"Błąd inicjalizacji klienta Claude: {e}")
            sys.exit(1)
    
    def create_chat_session(self, 
                          system_instruction: str, 
                          history: Optional[List[Dict]] = None,
                          thinking_budget: int = 0) -> ClaudeChatSessionWrapper:
        """
        Creates a new chat session with the specified configuration.
        
        Args:
            system_instruction: System role/prompt for the assistant
            history: Previous conversation history (optional, in universal dict format)
            thinking_budget: Ignored for Claude (compatibility parameter)
            
        Returns:
            ClaudeChatSessionWrapper with universal dictionary-based interface
        """
        if not self._client:
            raise RuntimeError("LLM client not initialized")
        
        sampling_params = self._get_sampling_parameters()

        return ClaudeChatSessionWrapper(
            claude_client=self._client,
            model_name=self.model_name,
            system_instruction=system_instruction,
            history=history or [],
            temperature=sampling_params.get("temperature"),
            top_p=sampling_params.get("top_p"),
        )
    
    def count_history_tokens(self, history: List[Dict]) -> int:
        """
        Counts tokens for the given conversation history.
        Note: Claude API doesn't provide a direct token counting endpoint,
        so we use an estimation based on character count.
        
        Args:
            history: Conversation history in universal dict format
            
        Returns:
            Estimated token count
        """
        if not history:
            return 0
        
        try:
            # Convert universal dict format to Claude format for estimation
            total_chars = 0
            for entry in history:
                if isinstance(entry, dict) and 'role' in entry and 'parts' in entry:
                    text = entry['parts'][0].get('text', '') if entry['parts'] else ''
                    if text:
                        total_chars += len(text)
            
            # Claude uses approximately 4 characters per token on average
            # This is a rough estimation, but works reasonably well for most text
            estimated_tokens = total_chars // 4
            
            # Add overhead for message structure (roles, formatting, etc.)
            message_overhead = len(history) * 10  # ~10 tokens per message for structure
            
            return estimated_tokens + message_overhead
        except Exception as e:
            console.print_error(f"Błąd podczas liczenia tokenów: {e}")
            # Fallback: very rough estimation (4 chars per token average)
            total_chars = sum(
                len(msg["parts"][0]["text"]) 
                for msg in history 
                if isinstance(msg, dict) and "parts" in msg and msg["parts"]
            )
            return total_chars // 4
    
    def get_model_name(self) -> str:
        """Returns the currently configured model name."""
        return self.model_name
    
    def is_available(self) -> bool:
        """
        Checks if the LLM service is available and properly configured.
        
        Returns:
            True if client is properly initialized and has API key
        """
        return self._client is not None and bool(self.api_key)
    
    def ready_for_use_message(self) -> str:
        """
        Returns a ready-to-use message with model info and masked API key.
        
        Returns:
            Formatted message string for display
        """
        # Mask API key - show first 4 and last 4 characters
        if len(self.api_key) <= 8:
            masked_key = "****"
        else:
            masked_key = f"{self.api_key[:4]}...{self.api_key[-4:]}"
        
        return f"✅ Klient Claude gotowy do użycia (Model: {self.model_name}, Key: {masked_key})"
    
    @property
    def client(self):
        """
        Provides access to the underlying Anthropic client for backwards compatibility.
        This property should be used sparingly and eventually removed.
        """
        return self._client

    def _get_sampling_parameters(self) -> Dict[str, Optional[float]]:
        """
        Retrieve runtime sampling parameters from the parameter store, validating them
        against Claude API limits. Invalid values are ignored with a console warning.
        """
        raw = parameter_store.get_sampling_parameters()
        validated: Dict[str, Optional[float]] = {}

        temperature = raw.get("temp")
        if temperature is not None:
            temperature = self._coerce_float(temperature)
            if temperature is not None and 0.0 <= temperature <= 1.0:
                validated["temperature"] = temperature
            else:
                console.print_info("Parametr temp dla Claude musi być w zakresie 0.0 - 1.0. Wartość została pominięta.")

        top_p = raw.get("top_p")
        if top_p is not None:
            top_p = self._coerce_float(top_p)
            if top_p is not None and 0.0 <= top_p <= 1.0:
                validated["top_p"] = top_p
            else:
                console.print_info("Parametr top_p dla Claude musi być w zakresie 0.0 - 1.0. Wartość została pominięta.")

        # Claude API does not allow specifying both temperature and top_p simultaneously.
        if validated.get("temperature") is not None and validated.get("top_p") is not None:
            console.print_info("Claude: jednoczesne użycie temperature i top_p jest niedozwolone. Pomijam top_p.")
            validated.pop("top_p", None)

        # top_k is not supported by Claude API, so we ignore it deliberately.
        return validated

    @staticmethod
    def _coerce_float(value: Any) -> Optional[float]:
        """Best-effort float coercion."""
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

