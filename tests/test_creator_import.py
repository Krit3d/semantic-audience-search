from src.api.routers.crm.creators import _parse_import_rows


def test_parse_import_rows_uses_named_template_columns():
    content = (
        "Платформа*;Username*;TG для рекламы;TG личный;Email;Tel\n"
        "Instagram;@first_author;@ads;@personal;first@example.com;+7 900 000-00-00\n"
        "Telegram;@second_author;;;;\n"
    ).encode("utf-8")

    assert _parse_import_rows("authors.csv", content) == [
        (2, "@first_author", "Instagram"),
        (3, "@second_author", "Telegram"),
    ]


def test_parse_import_rows_preserves_legacy_positional_format():
    content = b"@first_author,Instagram\n@second_author,Telegram\n"

    assert _parse_import_rows("authors.csv", content) == [
        (1, "@first_author", "Instagram"),
        (2, "@second_author", "Telegram"),
    ]
