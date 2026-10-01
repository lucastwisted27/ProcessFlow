from app.schemas.djen import DjenSubscriptionCreate
from app.services.djen import html_to_text, normalize_process_number


def test_normalize_process_number_accepts_masked_and_plain_values() -> None:
    assert normalize_process_number("0456981-90.2023.8.04.0001") == "04569819020238040001"
    assert normalize_process_number("04569819020238040001") == "04569819020238040001"
    assert normalize_process_number("sem número") == ""


def test_html_to_text_removes_markup_and_decodes_entities() -> None:
    result = html_to_text("<section><b>Intimação</b></section><p>Prazo&nbsp;de 5 dias</p>")

    assert "<" not in result
    assert "Intimação" in result
    assert "Prazo de 5 dias" in result


def test_subscription_normalizes_oab_fields() -> None:
    subscription = DjenSubscriptionCreate(
        lawyer_name=" Carlos Andrade ", oab_number="12.345-A", oab_state="am"
    )

    assert subscription.lawyer_name == "Carlos Andrade"
    assert subscription.oab_number == "12345A"
    assert subscription.oab_state == "AM"
