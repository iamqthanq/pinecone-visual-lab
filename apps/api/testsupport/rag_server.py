"""Explicit browser-test entry: real cached E5 OR NOT-E5 fixture, always MOCK OLLAMA."""

import os

from app.main import create_app
from testsupport.embedding_fixture import FixtureProvider
from testsupport.fixture_server import fixture_engine
from testsupport.ollama_mock import MockOllama

mock = MockOllama()
app = create_app(
    **(
        dict(engine_provider=fixture_engine, embedding_provider=FixtureProvider())
        if os.getenv("PVL_E2E_FIXTURE") == "1"
        else {}
    ),
    llm_provider=mock.provider(),
)
