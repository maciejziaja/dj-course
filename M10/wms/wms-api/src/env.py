"""Environment variables, read once and typed.

`os.environ.get` is `str | None`, and every caller here needs a `str`. Asserting
and then reading again leaves the type checker with the `None` it cannot rule
out, so the assert and the read are the same call.
"""
import os


def require_env(var_name: str) -> str:
    """The value of a variable that the service cannot start without."""
    value = os.environ.get(var_name)
    if not value:
        raise ValueError(f"{var_name} is not set")
    return value


def assert_env_var(*var_names: str) -> None:
    """Check several at once, for a caller that does not need the values."""
    for var_name in var_names:
        require_env(var_name)
