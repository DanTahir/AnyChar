from __future__ import annotations

import base64

import boto3

from config import AWS_REGION, S3_BUCKET


def fetch_image_bytes(s3_key: str) -> tuple[bytes, str] | None:
    if not s3_key or not S3_BUCKET:
        return None
    client = boto3.client("s3", region_name=AWS_REGION)
    try:
        resp = client.get_object(Bucket=S3_BUCKET, Key=s3_key)
        body = resp["Body"].read()
        content_type = resp.get("ContentType") or "image/jpeg"
        return body, content_type
    except client.exceptions.NoSuchKey:
        return None
    except Exception:
        return None


def fetch_image_data_url(s3_key: str, content_type: str | None = None) -> str | None:
    if content_type:
        data = fetch_image_bytes(s3_key)
        if not data:
            return None
        body, ct = data
        mime = content_type or ct
    else:
        data = fetch_image_bytes(s3_key)
        if not data:
            return None
        body, mime = data
    b64 = base64.b64encode(body).decode("ascii")
    return f"data:{mime};base64,{b64}"
