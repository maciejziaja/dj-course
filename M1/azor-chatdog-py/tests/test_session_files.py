import json
import os
from typing import List, Dict

from files import session_files


def _write_legacy_file(path: str, session_id: str, history: List[Dict], title: str | None = None):
    data = {
        'session_id': session_id,
        'model': 'stub-model',
        'system_role': 'LEGACY',
        'history': [
            {
                'role': item.get('role', ''),
                'timestamp': '2024-01-01T00:00:00',
                'text': (item.get('parts') or [{}])[0].get('text', ''),
            } for item in history
        ]
    }
    if title is not None:
        data['title'] = title
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4, ensure_ascii=False)


def test_save_and_load_with_assistant_id(tmp_log_dir):
    session_id = 'test-1'
    history = [
        {"role": "user", "parts": [{"text": "Hi"}]},
        {"role": "model", "parts": [{"text": "Hello"}]},
    ]

    ok, err = session_files.save_session_history(
        session_id=session_id,
        history=history,
        system_prompt='PROMPT',
        model_name='stub-model',
        title='My Title',
        assistant_id='optimist',
    )
    assert ok and err is None

    loaded_history, title, assistant_id, error = session_files.load_session_history(session_id)
    assert error is None
    assert title == 'My Title'
    assert assistant_id == 'optimist'
    assert isinstance(loaded_history, list)
    assert len(loaded_history) == 2
    assert loaded_history[0]['parts'][0]['text'] == 'Hi'


def test_load_legacy_file_without_assistant_id(tmp_log_dir):
    session_id = 'legacy-1'
    from files.config import LOG_DIR
    log_filename = os.path.join(LOG_DIR, f"{session_id}-log.json")

    legacy_history = [
        {"role": "user", "parts": [{"text": "U1"}]},
        {"role": "model", "parts": [{"text": "A1"}]},
    ]
    _write_legacy_file(log_filename, session_id, legacy_history)

    loaded_history, title, assistant_id, error = session_files.load_session_history(session_id)
    assert error is None
    assert assistant_id is None  # legacy files do not have assistant_id
    assert len(loaded_history) == 2
    assert loaded_history[1]['role'] == 'model'
