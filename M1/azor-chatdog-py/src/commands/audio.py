"""
Command handler for /audio - generates audio from the last assistant message.
"""
import time
import threading
import warnings
import os
from typing import List, Dict
from TTS.api import TTS
from rich.console import Console
from rich.text import Text
from rich.live import Live
import random
import string
import re

from cli import console as cli_console
from files.config import OUTPUT_DIR

warnings.filterwarnings("ignore", category=UserWarning)

# Animation constants (copied from M2/text-to-speech-xtts/animate.py)
SPECIAL_CHARS = list(string.punctuation + string.digits + "@#$%^&*")
BLUE_PALETTE = [
    "#00FFFF", "#00BFFF", "#1E90FF", "#4169E1", "#0000FF", 
    "#0000CD", "#00008B", "#00CED1", "#4682B4"
]
ANIMATION_DELAY = 0.10
rich_console = Console()


def run_tts_animation(
    target_text: str, 
    thread_to_monitor: threading.Thread | None = None, 
    duration_sec: float | None = None,
    text_length: int = 50
):
    """
    Runs text animation in console, working for specified time 
    or until monitored thread finishes.
    Copied from M2/text-to-speech-xtts/animate.py
    
    Args:
        target_text: Text to display and highlight in animation.
        thread_to_monitor: Thread whose completion will stop animation.
        duration_sec: Animation duration in seconds (ignored if thread_to_monitor is provided).
        text_length: Total width of animation bar.
    
    Returns:
        Animation duration in seconds.
    """
    clean_text = Text.from_markup(target_text).plain
    start_pos = (text_length - len(clean_text)) // 2
    target_regex = re.compile(re.escape(clean_text))
    
    is_timed = duration_sec is not None and thread_to_monitor is None
    
    start_time = time.time()
    
    with Live(console=rich_console, screen=False, refresh_per_second=20) as live:
        while True:
            if is_timed and (time.time() - start_time) >= duration_sec:
                break
            
            if not is_timed and thread_to_monitor and not thread_to_monitor.is_alive():
                break
            
            random_color = random.choice(BLUE_PALETTE)
            random_background = "".join(random.choice(SPECIAL_CHARS) for _ in range(text_length))
            
            end_pos = start_pos + len(clean_text)

            final_text_string = (
                random_background[:start_pos] + 
                clean_text + 
                random_background[end_pos:]
            )
            
            display_text = Text(final_text_string, style=f"bold {random_color}")
            display_text.highlight_regex(target_regex, "bold blue")
            live.update(display_text)
            time.sleep(ANIMATION_DELAY)

    if thread_to_monitor:
        thread_to_monitor.join()
        
    return time.time() - start_time


def get_last_assistant_message(history: List[Dict]) -> str | None:
    """
    Extracts the last assistant message from session history.
    
    Args:
        history: List of dictionaries with format {"role": "user|model", "parts": [{"text": "..."}]}
        
    Returns:
        Last assistant message text or None if not found
    """
    if not history:
        return None
    
    # Iterate backwards to find last model message
    for content in reversed(history):
        role = content.get('role', '')
        if role == 'model':
            # Extract text from parts
            if 'parts' in content and content['parts']:
                text = content['parts'][0].get('text', '')
                if text:
                    return text
    
    return None


def generate_audio_thread(tts_instance, text, file_path, speaker_wav, language, generation_done_event):
    """
    Thread for asynchronous audio file generation.
    
    Args:
        tts_instance: TTS model instance
        text: Text to synthesize
        file_path: Output file path
        speaker_wav: Path to speaker reference audio file
        language: Language code (e.g., "pl")
        generation_done_event: Threading event to signal completion
    """
    try:
        tts_instance.tts_to_file(
            text=text,
            file_path=file_path,
            speaker_wav=speaker_wav,
            language=language
        )
    finally:
        generation_done_event.set()


def generate_audio_command(history: List[Dict], session_id: str, output_dir: str = None):
    """
    Generates audio file from the last assistant message in session history.
    
    Args:
        history: Session history list
        session_id: Session ID for file naming
        output_dir: Optional output directory (defaults to current directory)
    """
    # Get last assistant message
    last_message = get_last_assistant_message(history)
    
    if not last_message:
        cli_console.print_error("Błąd: Brak wiadomości asystenta w historii sesji.")
        return
    
    if output_dir is None:
        output_dir = OUTPUT_DIR
    
    # Ensure output directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    # Determine output file path
    output_filename = f"audio_{session_id}.wav"
    output_path = os.path.join(output_dir, output_filename)
    
    # Check for default speaker file in files/audio directory
    default_speaker_filename = "sample-agent.wav"
    # Path relative to this file: commands/audio.py -> files/audio/sample-agent.wav
    audio_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'files', 'audio')
    default_speaker_path = os.path.join(audio_dir, default_speaker_filename)
    
    if not os.path.exists(default_speaker_path):
        cli_console.print_error(f"Błąd: Nie znaleziono pliku referencyjnego głosu: {default_speaker_path}")
        cli_console.print_info(f"Oczekiwana lokalizacja: {os.path.abspath(default_speaker_path)}")
        return
    
    speaker_path = os.path.abspath(default_speaker_path)
    
    # Language detection - default to Polish
    language = "pl"
    
    try:
        cli_console.print_info(f"\n🤖 Ładowanie modelu TTS...")
        tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cpu")
        cli_console.print_info("✅ Model załadowany pomyślnie.")
    except Exception as e:
        cli_console.print_error(f"❌ Błąd ładowania modelu: {e}")
        return
    
    # Setup threading
    generation_done = threading.Event()
    generation_done.clear()
    
    generation_thread = threading.Thread(
        target=generate_audio_thread,
        args=(tts, last_message, output_path, speaker_path, language, generation_done)
    )
    generation_thread.start()
    
    cli_console.print_info(f"▶️  Uruchomienie generowania pliku audio...")
    
    # Run animation while generating
    elapsed_time = run_tts_animation(
        target_text=" GENEROWANIE PLIKU AUDIO... ",
        thread_to_monitor=generation_thread
    )
    
    if generation_done.is_set():
        cli_console.print_info(f"✅ Sukces! Plik '{output_path}' został wygenerowany w {elapsed_time:.2f}s.")
    else:
        cli_console.print_error(f"❌ BŁĄD: Generowanie pliku '{output_path}' nie powiodło się lub zostało przerwane.")

