#!/usr/bin/env bash
# Deploys Project Jezza to Google Cloud Run (same Google account/billing as your Firebase project).
# One always-on instance, WebSockets enabled, party state + photos persisted on a Cloud Storage bucket.
#
# Prereqs (once): gcloud CLI installed and logged in (`gcloud auth login`), and the project on the Blaze
# (pay-as-you-go) plan, which Cloud Run needs. Expected cost for one small always-on instance over a
# weekend: a few dollars at most; the free tier covers most of it.
#
# Usage:  PROJECT_ID=my-firebase-project ./scripts/deploy-cloudrun.sh
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID to your Firebase/Google Cloud project id}"
REGION="${REGION:-australia-southeast1}"       # Sydney
SERVICE="${SERVICE:-project-jezza}"
BUCKET="${BUCKET:-${PROJECT_ID}-jezza-data}"

echo "▶ project=$PROJECT_ID region=$REGION service=$SERVICE bucket=$BUCKET"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com >/dev/null

# Bucket for state.json + photos (created once; harmless if it exists)
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access

# First deploy (or redeploy): build from source with Cloud Build, mount the bucket at /data.
URL_ARG=""
if EXISTING=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)' 2>/dev/null); then
  URL_ARG="--update-build-env-vars=VITE_PUBLIC_URL=$EXISTING"
fi
gcloud run deploy "$SERVICE" \
  --source . --region "$REGION" --allow-unauthenticated \
  --port 8787 --set-env-vars "DATA_DIR=/data,NODE_ENV=production" \
  --add-volume "name=data,type=cloud-storage,bucket=$BUCKET" --add-volume-mount "volume=data,mount-path=/data" \
  --min-instances 1 --max-instances 1 --cpu 1 --memory 512Mi \
  --timeout 3600 --session-affinity --execution-environment gen2 \
  $URL_ARG

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo
echo "✅ Live at: $URL"
echo "   Health:  $URL/api/health"
echo "   Share this with the lads: $URL   (the host taps \"I'm the host\" first)"
if [ -z "$URL_ARG" ]; then echo "   Tip: run this script once more so link previews use the final URL."; fi
