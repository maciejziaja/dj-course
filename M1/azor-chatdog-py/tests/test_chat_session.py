from assistant.registry import get_assistant_by_id
from session.chat_session import ChatSession
from files import session_files


def test_switch_assistant_appends_system_message_and_updates_id(tmp_log_dir):
    # Start with default azor
    asst = get_assistant_by_id("azor")
    session = ChatSession(assistant=asst, assistant_id="azor")

    # History before switch
    initial_len = len(session.get_history())

    # Switch to perfectionist
    session.switch_assistant("perfectionist")

    hist = session.get_history()
    assert len(hist) == initial_len + 1
    last = hist[-1]
    assert last["role"] == "model"
    assert "Zmiana asystenta" in last["parts"][0]["text"]
    assert session.assistant_id == "perfectionist"
    assert session.assistant.name == "PERFEKCJONISTA"


def test_save_and_load_roundtrip_persists_assistant_id(tmp_log_dir):
    # Create session with businessman
    businessman = get_assistant_by_id("businessman")
    session = ChatSession(assistant=businessman, assistant_id="businessman")

    # Create at least one full exchange so that save writes the file
    session.send_message("Hello")

    ok, err = session.save_to_file()
    assert ok and err is None

    # Load back using stored assistant_id
    loaded, error = ChatSession.load_from_file(session.session_id)
    assert error is None
    assert loaded is not None
    assert loaded.assistant_id == "businessman"
    assert loaded.assistant.name == "BIZNESMEN"
    # History should be preserved
    assert len(loaded.get_history()) >= 2
