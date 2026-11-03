import json
import re
from pathlib import Path


def test_seed_dialog_limits_match_tariffs() -> None:
    root = Path(__file__).resolve().parents[1]
    sources = [
        root / "alembic/versions/a1b2c3d4e5f7_add_subscription_fields_and_payment_events.py",
        root / "migration_a1b2c3d4e5f7.sql",
    ]
    for source in sources:
        text = source.read_text(encoding="utf-8")
        actual = {
            name: json.loads(limits)["dialogs_monthly_limit"]
            for name, limits in re.findall(
                r"\('(trial|basic|pro)',[^\n]*\n\s*'(\{[^']*dialogs_monthly_limit[^']*\})'::jsonb",
                text,
            )
        }
        assert actual == {"trial": 50, "basic": 350, "pro": 1000}
