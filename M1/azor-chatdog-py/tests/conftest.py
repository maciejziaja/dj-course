import os
import sys
import types
import pytest

# Ensure project src is on sys.path
PROJECT_SRC = os.path.join(os.path.dirname(__file__), '..', 'src')
PROJECT_SRC = os.path.abspath(PROJECT_SRC)
if PROJECT_SRC not in sys.path:
    sys.path.insert(0, PROJECT_SRC)


class _StubChatSession:
    """A minimal stub for the LLM chat session used in ChatSession."""
    def __init__(self, history):
        # Keep a reference so that get_history reflects external changes
        self._history = history

    def get_history(self):
        return list(self._history)

    def send_message(self, text: str):
        # Append a dummy model response
        self._history.append({
            'role': 'user',
            'parts': [{'text': text}],
        })
        self._history.append({
            'role': 'model',
            'parts': [{'text': 'stub-response'}],
        })
        return types.SimpleNamespace(text='stub-response')


class _StubLLMClient:
    def __init__(self, history):
        self._history = history

    @classmethod
    def from_environment(cls):
        # Not used directly in tests; ChatSession._initialize_llm_session is patched
        return cls([])

    def create_chat_session(self, system_instruction: str, history, thinking_budget: int = 0):
        # Return stub that wraps provided history list
        return _StubChatSession(history)

    def get_model_name(self) -> str:
        return "stub-model"

    def count_history_tokens(self, history) -> int:
        # Very rough: 1 token per message for test purposes
        return len(history)


@pytest.fixture()
def tmp_log_dir(tmp_path, monkeypatch):
    """Redirect files.config.LOG_DIR to a temporary directory for filesystem-safe tests."""
    # Ensure directory exists
    log_dir = tmp_path / 'logs'
    log_dir.mkdir(parents=True, exist_ok=True)
    # Patch LOG_DIR constant
    from files import config as files_config
    monkeypatch.setattr(files_config, 'LOG_DIR', str(log_dir), raising=True)
    return log_dir


@pytest.fixture(autouse=True)
def stub_llm(monkeypatch):
    """Patch ChatSession._initialize_llm_session to avoid real LLM initialization."""
    from session.chat_session import ChatSession

    def _fake_initialize(self: 'ChatSession'):
        # Install stub client and chat session bound to self._history
        self._llm_client = _StubLLMClient(self._history)
        self._llm_chat_session = self._llm_client.create_chat_session(
            system_instruction=self.assistant.system_prompt,
            history=self._history,
            thinking_budget=0,
        )

    monkeypatch.setattr(ChatSession, '_initialize_llm_session', _fake_initialize, raising=True)
    yield
