FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock README.md ./
COPY *.py ./

RUN uv sync --frozen --no-dev

ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uv run uvicorn api:app --host 0.0.0.0 --port ${PORT:-8000}"]
