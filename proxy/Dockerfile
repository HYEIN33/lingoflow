# 用官方 Node 20 slim 镜像 —— Cloud Run 默认环境
FROM node:20-slim

WORKDIR /app

# 先拷 package 让依赖层缓存命中
COPY package*.json ./
RUN npm install --omit=dev

# 拷代码
COPY src ./src

# Cloud Run 会用 $PORT 环境变量告诉容器监听哪个端口（默认 8080）
EXPOSE 8080

CMD ["node", "src/server.js"]
