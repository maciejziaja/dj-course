FROM python:3.13-slim

# Create a non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app

# Install dependencies with cache mount
COPY pyproject.toml .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install .

# Copy application code as non-root
COPY --chown=appuser:appuser . .

USER appuser
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python -c "import socket; s = socket.socket(socket.AF_INET, socket.SOCK_STREAM); s.connect(('localhost', 3001))"
CMD ["python", "src/run.py"]
