import pytest
from pydantic import ValidationError

from src.api.schemas import CrmProfileUpdateRequest


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("@creator.name", "creator.name"),
        ("https://instagram.com/creator_name/", "creator_name"),
        ("www.instagram.com/creator.name", "creator.name"),
        ("", None),
        ("   ", None),
    ],
)
def test_instagram_username_normalization(raw: str, expected: str | None) -> None:
    assert CrmProfileUpdateRequest(instagram_username=raw).instagram_username == expected


@pytest.mark.parametrize("raw", ["invalid username", "https://example.com/user", "a" * 31])
def test_invalid_instagram_username_is_rejected(raw: str) -> None:
    with pytest.raises(ValidationError):
        CrmProfileUpdateRequest(instagram_username=raw)
