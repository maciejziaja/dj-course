"""
Assistant module initialization
Exports the Assistant class and assistant factory functions.
"""

from .assistent import Assistant
from .azor import create_azor_assistant
from .perfectionist import create_perfectionist_assistant
from .businessman import create_businessman_assistant
from .optimist import create_optimist_assistant

__all__ = [
    'Assistant',
    'create_azor_assistant',
    'create_perfectionist_assistant',
    'create_businessman_assistant',
    'create_optimist_assistant',
]
