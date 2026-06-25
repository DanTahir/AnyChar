#!/usr/bin/env bash
# Creates AnyChar DynamoDB table and S3 image bucket. Requires AWS CLI configured.
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
TABLE_NAME="${DYNAMODB_TABLE:-AnyChar}"
BUCKET_NAME="${S3_BUCKET:-anychar-images-$(aws sts get-caller-identity --query Account --output text)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Region: $REGION"
echo "DynamoDB table: $TABLE_NAME"
echo "S3 bucket: $BUCKET_NAME"

if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$REGION" 2>/dev/null; then
  echo "DynamoDB table $TABLE_NAME already exists."
else
  aws dynamodb create-table \
    --cli-input-json "file://${SCRIPT_DIR}/dynamodb-table.json" \
    --region "$REGION"
  echo "Waiting for table..."
  aws dynamodb wait table-exists --table-name "$TABLE_NAME" --region "$REGION"
  echo "DynamoDB table created."
fi

if aws s3api head-bucket --bucket "$BUCKET_NAME" 2>/dev/null; then
  echo "S3 bucket $BUCKET_NAME already exists."
else
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION"
  else
    aws s3api create-bucket --bucket "$BUCKET_NAME" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=$REGION"
  fi
  aws s3api put-public-access-block --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
  echo "S3 bucket created (private)."
fi

echo ""
echo "Done. Set in .env:"
echo "  AWS_REGION=$REGION"
echo "  DYNAMODB_TABLE=$TABLE_NAME"
echo "  S3_BUCKET=$BUCKET_NAME"
echo ""
echo "Attach infra/iam-ec2-policy.json to your EC2 instance role."
