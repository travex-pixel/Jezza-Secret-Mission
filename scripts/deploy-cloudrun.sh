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

# Preflight: Cloud Run and Cloud Build refuse to start without a billing account on the project.
BILLING=$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled)' 2>/dev/null || true)
if [ "$BILLING" != "True" ]; then
  echo
  echo "✋ Billing isn't switched on for $PROJECT_ID yet, so Google won't let us start a server."
  echo "   Fix: open https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
  echo "        and click 'Link a billing account' (or finish the Blaze upgrade in the Firebase console)."
  echo "   Then wait a minute and run this script again."
  exit 1
fi
echo "▶ enabling Google Cloud services (first time takes ~1 min)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com storage.googleapis.com --quiet >/dev/null

# Permissions the build + server need (safe to re-run)
PN=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
SA="$PN-compute@developer.gserviceaccount.com"
for ROLE in roles/cloudbuild.builds.builder roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role="$ROLE" --quiet >/dev/null 2>&1 || true
done

# Bucket for state.json + photos (created once; harmless if it exists)
gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1 || gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --quiet

# Once a save exists in the bucket, the server must find it on boot (REQUIRE_STATE): a copy that comes up with the
# volume missing then waits and exits instead of serving a blank game that would save over the real one.
REQUIRE_STATE=0
gcloud storage ls "gs://$BUCKET/state.json" >/dev/null 2>&1 && REQUIRE_STATE=1
echo "▶ save file in bucket: $([ "$REQUIRE_STATE" = 1 ] && echo yes || echo 'not yet (first deploy)')"

# Stamp this build so the host can see which version is live (Host controls → bottom; also /api/health).
echo "{\"sha\":\"$(git rev-parse --short HEAD 2>/dev/null || echo unknown)\",\"at\":\"$(TZ=Australia/Sydney date '+%a %H:%M')\"}" > build.json
echo "▶ build stamp: $(cat build.json)"

# First deploy (or redeploy): build from source with Cloud Build, mount the bucket at /data.
gcloud run deploy "$SERVICE" \
  --source . --region "$REGION" --allow-unauthenticated \
  --port 8787 --set-env-vars "DATA_DIR=/data,NODE_ENV=production,REQUIRE_STATE=$REQUIRE_STATE" \
  --add-volume "name=data,type=cloud-storage,bucket=$BUCKET" --add-volume-mount "volume=data,mount-path=/data" \
  --min-instances 1 --max-instances 1 --cpu 1 --memory 512Mi \
  --timeout 3600 --session-affinity --execution-environment gen2 \
  --quiet

# Shut down every older version. Otherwise phones still connected to an old copy keep playing in a
# separate game (old copies keep their own list of players) until they happen to reconnect.
LATEST=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.latestReadyRevisionName)')
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-latest --quiet >/dev/null
for REV in $(gcloud run revisions list --service "$SERVICE" --region "$REGION" --format='value(metadata.name)'); do
  if [ "$REV" != "$LATEST" ]; then
    echo "▶ retiring old version $REV"
    gcloud run revisions delete "$REV" --region "$REGION" --quiet >/dev/null 2>&1 || echo "  (couldn't retire $REV, it will shut down on its own)"
  fi
done

URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo
echo "✅ Live at: $URL"
echo "   Open it on your phone to check it loads, then share it."
echo "   Health:  $URL/api/health"
echo "   Share this with the lads: $URL   (the host taps \"I'm the host\" first)"
