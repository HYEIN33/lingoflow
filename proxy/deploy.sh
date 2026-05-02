#!/usr/bin/env bash
# memeflow Deepgram proxy → Cloud Run 部署脚本
#
# 第一次部署做的事：
#   1. 启用必要的 API（如已启用会跳过）
#   2. 创建 Artifact Registry 仓库（如已存在会跳过）
#   3. 把 DEEPGRAM_API_KEY 共享给 Cloud Run 服务账号
#   4. 用 Cloud Build 构建镜像
#   5. 部署到 Cloud Run（北美区域，allUsers 可访问 wss）
#
# 二次部署只走 4-5 步，~1 分钟。

set -euo pipefail

PROJECT_ID="memeflow-16ecf"
REGION="us-central1"            # Deepgram 主要在美国，同区域延迟最低
SERVICE_NAME="memeflow-proxy"
REPO_NAME="memeflow-proxy"      # Artifact Registry 仓库名
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"

echo "[deploy] project=${PROJECT_ID} region=${REGION} service=${SERVICE_NAME}"

# 确保当前 gcloud 项目 = memeflow-16ecf
~/google-cloud-sdk/bin/gcloud config set project "${PROJECT_ID}"

# 创建 Artifact Registry 仓库（幂等）
if ! ~/google-cloud-sdk/bin/gcloud artifacts repositories describe "${REPO_NAME}" --location="${REGION}" >/dev/null 2>&1; then
  echo "[deploy] creating Artifact Registry repo…"
  ~/google-cloud-sdk/bin/gcloud artifacts repositories create "${REPO_NAME}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="memeflow Deepgram proxy images"
fi

# 构建镜像（Cloud Build 会自动上传源码 + 跑 docker build + 推到 AR）
echo "[deploy] building image…"
~/google-cloud-sdk/bin/gcloud builds submit --tag "${IMAGE_TAG}" .

# 部署到 Cloud Run
# 关键参数说明：
#   --min-instances=0           零流量时不收费（冷启动 ~1s 可接受）
#   --max-instances=5           防被刷爆账单的硬上限
#   --concurrency=80            一个容器实例可同时服务 80 个 WebSocket
#   --timeout=3600              单连接最长 1 小时（一节课够了）
#   --cpu=1 --memory=512Mi      每个实例的资源
#   --set-secrets               把 Firebase Secret Manager 里的 key 注入
#   --allow-unauthenticated     允许公网访问（我们自己在应用层校验 Firebase token）
# 把 ALLOWED_ORIGINS 写到临时 YAML 文件给 --env-vars-file 用 ——
# 直接 --set-env-vars 因为值里含逗号会被 gcloud 解析成多个 key=value，
# YAML 文件能干净地传任意特殊字符。
ENV_FILE=$(mktemp)
trap 'rm -f "${ENV_FILE}"' EXIT
cat > "${ENV_FILE}" <<'EOF'
ALLOWED_ORIGINS: "https://memeflow-16ecf.web.app,https://memeflow-16ecf.firebaseapp.com,https://memeflow-16ecf--*.web.app,http://localhost:3000,http://localhost:5173"
EOF

echo "[deploy] deploying to Cloud Run…"
~/google-cloud-sdk/bin/gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_TAG}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances=0 \
  --max-instances=5 \
  --concurrency=80 \
  --timeout=3600 \
  --cpu=1 \
  --memory=512Mi \
  --set-secrets="DEEPGRAM_API_KEY=DEEPGRAM_API_KEY:latest" \
  --env-vars-file="${ENV_FILE}"

URL=$(~/google-cloud-sdk/bin/gcloud run services describe "${SERVICE_NAME}" --region "${REGION}" --format='value(status.url)')
echo ""
echo "[deploy] ✅ done"
echo "[deploy] HTTPS URL: ${URL}"
echo "[deploy] WSS URL:   ${URL/https:/wss:}"
echo ""
echo "→ 把这个 wss URL 写到前端的 VITE_PROXY_WS_URL 环境变量"
