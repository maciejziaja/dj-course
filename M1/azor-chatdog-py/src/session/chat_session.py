import uuid
from typing import List, Any, Union
import os
from files import session_files
from files.wal import append_to_wal
from llm.gemini_client import GeminiLLMClient
from llm.llama_client import LlamaClient
from llm.claude_client import ClaudeLLMClient
from assistant import Assistant
from cli import console

# Context token limit

# Engine to Client Class mapping
ENGINE_MAPPING = {
    'LLAMA_CPP': LlamaClient,
    'GEMINI': GeminiLLMClient,
    'CLAUDE': ClaudeLLMClient,
}


class ChatSession:
    """
    Manages everything related to a single chat session.
    Encapsulates session ID, conversation history, assistant, and LLM chat session.
    """
    
    def __init__(self, assistant: Assistant, session_id: str | None = None, history: List[Any] | None = None, title: str | None = None, assistant_id: str | None = None):
        """
        Initialize a chat session.
        
        Args:
            assistant: Assistant instance that defines the behavior and model for this session
            session_id: Unique session identifier. If None, generates a new UUID.
            history: Initial conversation history. If None, starts empty.
            title: Optional session title. If None, will be auto-generated when needed.
            assistant_id: Optional assistant identifier. If None, inferred from assistant.
        """
        self.assistant = assistant
        self.session_id = session_id or str(uuid.uuid4())
        self._history = history or []
        self._title: str | None = title
        # Determine assistant_id based on provided argument or assistant properties
        self.assistant_id: str = assistant_id or self._get_assistant_id_from_assistant(assistant)
        self._llm_client: Union[GeminiLLMClient, LlamaClient, ClaudeLLMClient, None] = None
        self._llm_chat_session = None
        self._max_context_tokens = 32768
        self._initialize_llm_session()
    
    def _get_assistant_id_from_assistant(self, assistant: Assistant) -> str:
        """Map Assistant instance to assistant_id using its display name."""
        try:
            name = (assistant.name or "").upper()
        except Exception:
            name = ""
        if name == "AZOR":
            return "azor"
        if name == "PERFEKCJONISTA":
            return "perfectionist"
        if name == "BIZNESMEN":
            return "businessman"
        if name == "OPTYMISTA":
            return "optimist"
        return "azor"
    
    def _initialize_llm_session(self):
        """
        Creates or recreates the LLM chat session with current history.
        This should be called after any history modification.
        """
        # Walidacja zmiennej ENGINE
        engine = os.getenv('ENGINE', 'GEMINI').upper()
        if engine not in ENGINE_MAPPING:
            valid_engines = ', '.join(ENGINE_MAPPING.keys())
            raise ValueError(f"ENGINE musi być jedną z wartości: {valid_engines}, otrzymano: {engine}")
        
        # Initialize LLM client if not already created
        if self._llm_client is None:
            SelectedClientClass = ENGINE_MAPPING.get(engine, GeminiLLMClient)
            console.print_info(SelectedClientClass.preparing_for_use_message())
            self._llm_client = SelectedClientClass.from_environment()
            console.print_info(self._llm_client.ready_for_use_message())
        
        self._llm_chat_session = self._llm_client.create_chat_session(
            system_instruction=self.assistant.system_prompt,
            history=self._history,
            thinking_budget=0
        )
    
    
    @classmethod
    def load_from_file(cls, session_id: str, assistant: Assistant | None = None) -> tuple['ChatSession | None', str | None]:
        """
        Loads a session from disk, including assistant information if available.
        Creates the appropriate assistant using the registry (falls back to provided assistant or default Azor).
        
        Args:
            session_id: ID of the session to load
            assistant: Optional Assistant instance (kept for backward compatibility; will be overridden if file has assistant_id)
            
        Returns:
            tuple: (ChatSession object or None, error_message or None)
        """
        history, title, assistant_id, error = session_files.load_session_history(session_id)
        if error:
            return None, error
        
        try:
            from assistant.registry import get_assistant_by_id
            resolved_id = assistant_id or None
            if resolved_id is None and assistant is not None:
                # Infer from provided assistant if available
                temp_session = cls(assistant=assistant)
                resolved_id = temp_session.assistant_id
            if resolved_id is None:
                resolved_id = "azor"
            assistant_obj = get_assistant_by_id(resolved_id)
        except Exception:
            # Fallbacks: use provided assistant, else create Azor via registry
            if assistant is not None:
                assistant_obj = assistant
                resolved_id = cls._get_assistant_id_from_assistant(assistant)
            else:
                from assistant.registry import get_assistant_by_id
                assistant_obj = get_assistant_by_id("azor")
                resolved_id = "azor"
        
        session = cls(assistant=assistant_obj, session_id=session_id, history=history, title=title, assistant_id=resolved_id)
        return session, None
    
    def save_to_file(self) -> tuple[bool, str | None]:
        """
        Saves this session to disk.
        Only saves if history has at least one complete exchange.
        
        Returns:
            tuple: (success: bool, error_message: str | None)
        """
        # Sync history from LLM session before saving
        if self._llm_chat_session:
            self._history = self._llm_chat_session.get_history()
        
        return session_files.save_session_history(
            self.session_id, 
            self._history, 
            self.assistant.system_prompt, 
            self._llm_client.get_model_name(),
            self._title,
            self.assistant_id,
        )
    
    def send_message(self, text: str):
        """
        Sends a message to the LLM and returns the response.
        Updates internal history automatically and logs to WAL.
        Auto-generates title if missing.
        
        Args:
            text: User's message
            
        Returns:
            Response object from Google GenAI
        """
        if not self._llm_chat_session:
            raise RuntimeError("LLM session not initialized")
        
        response = self._llm_chat_session.send_message(text)
        
        # Sync history after message
        self._history = self._llm_chat_session.get_history()
        
        # Auto-generate title if missing
        if self._title is None and len(self._history) >= 2:
            try:
                from llm.title_generation import generate_title_from_history
                generated_title = generate_title_from_history(self._llm_client, self._history)
                if generated_title:
                    self._title = generated_title
                    # Save the session with the new title
                    self.save_to_file()
            except Exception:
                # Silently fail - don't interrupt the conversation
                pass
        
        # Log to WAL
        total_tokens = self.count_tokens()
        success, error = append_to_wal(
            session_id=self.session_id,
            prompt=text,
            response_text=response.text,
            total_tokens=total_tokens,
            model_name=self._llm_client.get_model_name()
        )
        
        if not success and error:
            # We don't want to fail the entire message sending because of WAL issues
            # Just log the error to stderr or similar - but for now we'll silently continue
            pass
        
        return response
    
    def get_history(self) -> List[Any]:
        """Returns the current conversation history."""
        # Always sync from LLM session to ensure consistency
        if self._llm_chat_session:
            self._history = self._llm_chat_session.get_history()
        return self._history
    
    def clear_history(self):
        """Clears all conversation history and reinitializes the LLM session."""
        self._history = []
        self._initialize_llm_session()
        self.save_to_file()
    
    def pop_last_exchange(self) -> bool:
        """
        Removes the last user-assistant exchange from history.
        
        Returns:
            bool: True if successful, False if insufficient history
        """
        current_history = self.get_history()
        
        if len(current_history) < 2:
            return False
        
        # Remove last 2 entries (user + assistant)
        self._history = current_history[:-2]
        
        # Reinitialize LLM session with modified history
        self._initialize_llm_session()
        
        self.save_to_file()
        
        return True
    
    def count_tokens(self) -> int:
        """
        Counts total tokens in the conversation history.
        
        Returns:
            int: Total token count
        """
        if not self._llm_client:
            return 0
        return self._llm_client.count_history_tokens(self._history)
    
    def is_empty(self) -> bool:
        """
        Checks if session has any complete exchanges.
        
        Returns:
            bool: True if history has less than 2 entries
        """
        return len(self._history) < 2
    
    def get_remaining_tokens(self) -> int:
        """
        Calculates remaining tokens based on context limit.
        
        Returns:
            int: Remaining token count
        """
        total = self.count_tokens()
        return self._max_context_tokens - total
    
    def get_token_info(self) -> tuple[int, int, int]:
        """
        Gets comprehensive token information for this session.
        
        Returns:
            tuple: (total_tokens, remaining_tokens, max_tokens)
        """
        total_tokens = self.count_tokens()
        remaining_tokens = self._max_context_tokens - total_tokens
        max_tokens = self._max_context_tokens
        return total_tokens, remaining_tokens, max_tokens
    
    @property
    def assistant_name(self) -> str:
        """
        Gets the display name of the assistant.
        
        Returns:
            str: The assistant's display name
        """
        return self.assistant.name
    
    def switch_assistant(self, assistant_id: str) -> None:
        """
        Zmienia asystenta w trakcie sesji i dodaje wpis do historii.
        """
        from assistant.registry import get_assistant_by_id
        old_name = self.assistant.name
        new_assistant = get_assistant_by_id(assistant_id)
        new_name = new_assistant.name
        change_message = {
            "role": "model",
            "parts": [{"text": f"[SYSTEM: Zmiana asystenta z {old_name} na {new_name}]"}]
        }
        # Ensure current history is up-to-date
        if self._llm_chat_session:
            self._history = self._llm_chat_session.get_history()
        self._history.append(change_message)
        self.assistant = new_assistant
        self.assistant_id = assistant_id
        # Reinitialize LLM session with new system prompt and existing history
        self._initialize_llm_session()
        # Persist change
        self.save_to_file()
    
    def get_title(self) -> str | None:
        """
        Gets the current session title.
        
        Returns:
            str | None: The session title, or None if not set
        """
        return self._title
    
    def set_title(self, title: str) -> bool:
        """
        Sets the session title (truncated to 60 characters).
        Saves the session to file after updating.
        
        Args:
            title: The new title (will be trimmed to 60 chars)
            
        Returns:
            bool: True if title was set successfully, False if validation failed
        """
        # Remove surrounding quotes if present
        title = title.strip()
        if title.startswith('"') and title.endswith('"'):
            title = title[1:-1]
        elif title.startswith("'") and title.endswith("'"):
            title = title[1:-1]
        
        title = title.strip()
        
        # Validate: must be at least 3 characters
        if len(title) < 3:
            return False
        
        # Trim to 60 characters
        if len(title) > 60:
            title = title[:60]
        
        self._title = title
        # Save to file
        self.save_to_file()
        return True