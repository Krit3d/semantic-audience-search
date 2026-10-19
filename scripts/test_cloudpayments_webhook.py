"""Send a correctly signed reference CloudPayments webhook to a local endpoint.

Usage:
    python scripts/test_cloudpayments_webhook.py --user-id 1 --plan basic \
        [--event pay|recurrent|fail|cancel] \
        [--url http://localhost:8000/api/v1/billing/cloudpayments/webhook] \
        [--secret $CLOUDPAYMENTS_SECRET_KEY] [--amount 7900]
"""

import argparse
import json
import os
import sys
import uuid
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

import httpx

from src.api.services.cloudpayments_signature import sign_body


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a signed test CloudPayments webhook")
    parser.add_argument("--url", default="http://localhost:8000/api/v1/billing/cloudpayments/webhook")
    parser.add_argument("--secret", default=os.environ.get("CLOUDPAYMENTS_SECRET_KEY", ""))
    parser.add_argument("--user-id", type=int, required=True)
    parser.add_argument("--plan", default="basic")
    parser.add_argument("--amount", type=float, default=7900)
    parser.add_argument("--event", choices=["pay", "recurrent", "fail", "cancel"], default="pay")
    parser.add_argument("--transaction-id", default=None)
    args = parser.parse_args()

    if not args.secret:
        print("ERROR: pass --secret or set CLOUDPAYMENTS_SECRET_KEY")
        return 2

    transaction_id = args.transaction_id or f"dry-{uuid.uuid4().hex[:12]}"
    payload = {
        "TransactionId": transaction_id,
        "Amount": args.amount,
        "Currency": "RUB",
        "Email": "dry-run@example.invalid",
        "AccountId": str(args.user_id),
        "SubscriptionId": f"dry-run-{args.user_id}",
        "Data": json.dumps({"plan": args.plan}),
    }
    body = json.dumps(payload).encode()
    signature = sign_body(body, args.secret)
    response = httpx.post(
        f"{args.url.rstrip('/')}/{args.event}",
        content=body,
        headers={"Content-Type": "application/json", "Content-HMAC": signature},
        timeout=30.0,
    )
    print(f"HTTP {response.status_code}: {response.text}")
    print(f"transaction_id={transaction_id} (repeat with --transaction-id {transaction_id} to test idempotency)")
    return 0 if response.status_code == 200 else 1


if __name__ == "__main__":
    raise SystemExit(main())
