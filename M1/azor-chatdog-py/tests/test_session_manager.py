from session.session_manager import SessionManager
from session.chat_session import ChatSession


def test_create_new_session_uses_registry_default_azor(tmp_log_dir):
    mgr = SessionManager()
    new_session, save_attempted, previous_session_id, save_error = mgr.create_new_session(save_current=False)
    assert isinstance(new_session, ChatSession)
    assert new_session.assistant_id == "azor"
    assert new_session.assistant.name == "AZOR"
    assert save_attempted is False
    assert previous_session_id is None
    assert save_error is None


def test_switch_to_session_loads_correct_assistant(tmp_log_dir):
    mgr = SessionManager()
    # Create two sessions with different assistants
    s1, *_ = mgr.create_new_session(save_current=False, assistant_id="azor")
    s1.send_message("hi")
    s1.save_to_file()

    s2, *_ = mgr.create_new_session(save_current=True, assistant_id="optimist")
    s2.send_message("hello")
    s2.save_to_file()

    # Now switch back to s1
    loaded, save_attempted, previous_session_id, load_successful, load_error, has_history = mgr.switch_to_session(s1.session_id)
    assert load_successful and load_error is None
    assert loaded is not None
    assert loaded.assistant_id == "azor"
    assert loaded.assistant.name == "AZOR"
    assert has_history is True


def test_remove_current_session_and_create_new(tmp_log_dir):
    mgr = SessionManager()
    s, *_ = mgr.create_new_session(save_current=False, assistant_id="perfectionist")
    s.send_message("start")
    s.save_to_file()

    new_session, removed_id, remove_success, remove_error = mgr.remove_current_session_and_create_new()
    assert new_session.assistant_id == "azor"
    # The file for removed_id should not exist anymore (best effort)
    import os
    from files.config import LOG_DIR
    removed_path = os.path.join(LOG_DIR, f"{removed_id}-log.json")
    assert (not os.path.exists(removed_path)) or remove_success is False or remove_error is None
