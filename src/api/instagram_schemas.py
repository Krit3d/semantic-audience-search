from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class InstagramAccountCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    login: str = Field(strict=True, min_length=1, max_length=254)
    password: str = Field(strict=True, min_length=1, max_length=1024)
    country: str | None = Field(default=None, strict=True, min_length=2, max_length=2)
    two_factor: str | None = Field(default=None, strict=True, min_length=1, max_length=64)
    brand_id: int | None = Field(default=None, strict=True, gt=0)

    @field_validator("login")
    @classmethod
    def normalize_login(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("login must not be empty")
        return normalized

    @field_validator("country")
    @classmethod
    def normalize_country(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.lower()
        if not normalized.isascii() or not normalized.isalpha():
            raise ValueError("country must contain two Latin letters")
        if normalized == "ru":
            raise ValueError("country ru is not supported")
        return normalized


class InstagramAccountConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    password: str | None = Field(default=None, strict=True, min_length=1, max_length=1024)
    two_factor: str | None = Field(default=None, strict=True, min_length=1, max_length=64)

    @model_validator(mode="after")
    def require_action(self) -> "InstagramAccountConfirmRequest":
        if self.password is None and self.two_factor is None:
            raise ValueError("password or two_factor is required")
        return self


class InstagramAccountResponse(BaseModel):
    id: int
    login: str
    brand_id: int | None
    country: str | None
    status: str
    last_error_code: str | None
    billing: str | None
    promo: str | None
    remote_status: str | None
    action_required: str | None
    stuck: bool
    created_at: datetime
    updated_at: datetime


class InstagramAccountDeleteResponse(BaseModel):
    status: str
    id: int
    login: str
    was_last_account: bool


class InstagramAccountError(BaseModel):
    code: str
    message: str
    field: str | None = None
