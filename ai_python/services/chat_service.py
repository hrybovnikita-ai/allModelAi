"""Normalize chat payloads for the Python LLM router."""

from __future__ import annotations

from typing import Any, Optional

from providers.base import ChatMessage


def parse_messages(raw: list[dict[str, Any]]) -> list[ChatMessage]:
    messages: list[ChatMessage] = []
    for item in raw or []:
        role = str(item.get("role", "user")).lower()
        content = item.get("content")
        if content is None:
            continue
        if isinstance(content, list):
            text_parts = [part.get("text", "") for part in content if isinstance(part, dict)]
            content = "\n".join([p for p in text_parts if p])
        messages.append(ChatMessage(role=role, content=str(content)))
    return messages


def extract_system(messages: list[ChatMessage]) -> tuple[Optional[str], list[ChatMessage]]:
    system_parts: list[str] = []
    rest: list[ChatMessage] = []
    for msg in messages:
        if msg.role == "system":
            system_parts.append(msg.content)
        else:
            rest.append(msg)
    system = "\n\n".join(system_parts).strip() if system_parts else None
    return system, rest
