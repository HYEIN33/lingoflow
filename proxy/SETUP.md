# gcloud 登录 + 部署一次性步骤

gcloud SDK 已经装在 `~/google-cloud-sdk/`。当前 shell 还没把它加到 PATH，
最简单的做法：用绝对路径 `~/google-cloud-sdk/bin/gcloud` 跑一次登录，
之后开新终端窗口或 `source ~/.zshrc` 就能直接用 `gcloud` 了。

## 1. 登录（用 caizewei11@gmail.com）

```bash
~/google-cloud-sdk/bin/gcloud auth login
```

会弹一个浏览器，登录 → 授权。完成后回到终端会显示 "You are now logged in as ..."

## 2. 设置默认项目

```bash
~/google-cloud-sdk/bin/gcloud config set project memeflow-16ecf
```

## 3. 应用默认凭证（部署 + 让本地能调用 GCP API 用）

```bash
~/google-cloud-sdk/bin/gcloud auth application-default login
```

也是浏览器授权一次。

## 4. 部署代理（一键）

```bash
cd ~/lingoflow/proxy
~/google-cloud-sdk/bin/gcloud config set project memeflow-16ecf
./deploy.sh
```

第一次部署 ~3-5 分钟（构建镜像 + 推送 + 部署）。
之后改代码再跑同样的命令，~1 分钟。

## 5. 部署完成后，把输出的 `WSS URL` 告诉 Claude

```
[deploy] WSS URL: wss://memeflow-proxy-xxxxxx.us-central1.run.app
```
