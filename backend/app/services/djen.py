import re
from datetime import date
from html import unescape
from html.parser import HTMLParser
from typing import Any

import httpx

DJEN_API_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
PROCESS_PATTERN = re.compile(r"\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}")


class _TextExtractor(HTMLParser):
    block_tags = {"article", "br", "div", "footer", "header", "li", "p", "section", "table", "tr"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self.block_tags:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in self.block_tags:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def html_to_text(value: str) -> str:
    parser = _TextExtractor()
    parser.feed(value or "")
    text = unescape("".join(parser.parts)).replace("\xa0", " ")
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line)


def normalize_process_number(value: str) -> str:
    match = PROCESS_PATTERN.search(value or "")
    source = match.group(0) if match else value or ""
    digits = "".join(character for character in source if character.isdigit())
    return digits if len(digits) == 20 else ""


async def fetch_djen_publications(
    *,
    oab_number: str,
    oab_state: str,
    start: date,
    end: date,
    max_pages: int = 10,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        for page in range(1, max_pages + 1):
            response = await client.get(
                DJEN_API_URL,
                params={
                    "numeroOab": oab_number,
                    "ufOab": oab_state,
                    "dataDisponibilizacaoInicio": start.isoformat(),
                    "dataDisponibilizacaoFim": end.isoformat(),
                    "pagina": page,
                    "itensPorPagina": 100,
                },
            )
            if response.status_code == 429:
                raise RuntimeError(
                    "O CNJ limitou temporariamente as consultas. Tente novamente em 1 minuto."
                )
            response.raise_for_status()
            payload = response.json()
            items = payload.get("items") or []
            results.extend(item for item in items if isinstance(item, dict))
            if len(items) < 100:
                break
    return results
