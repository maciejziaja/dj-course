import json
import os

from session.chat_session import ChatSession
from files.config import LOG_DIR


def test_chat_session_loads_legacy_file_defaults_to_azor(tmp_log_dir):
    session_id = 'legacy-chat-1'
    path = os.path.join(LOG_DIR, f"{session_id}-log.json")

    legacy = {
        'session_id': session_id,
        'model': 'stub-model',
        'system_role': 'LEGACY',
        # No assistant_id here on purpose
        'history': [
            {'role': 'user', 'timestamp': '2024-01-01T00:00:00', 'text': 'Hello'},
            {'role': 'model', 'timestamp': '2024-01-01T00:00:01', 'text': 'Hi!'},
        ],
    }

    with open(path, 'w', encoding='utf-8') as f:
        json.dump(legacy, f, indent=4, ensure_ascii=False)

    session, error = ChatSession.load_from_file(session_id)
    assert error is None
    assert session is not None
    assert session.assistant_id == 'azor'
    assert session.assistant.name == 'AZOR'
    assert len(session.get_history()) == 2
