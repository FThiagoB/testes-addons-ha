# Configuração do ambiente para a interface usando react
# https://contributors.home-assistant.io/apps/guides/ingress/
# Frontend React + Vite + Tailwind
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Backend usando node.js
FROM node:20-alpine
WORKDIR /app

RUN apk add --no-cache iputils traceroute iproute2

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/server.js ./
COPY backend/src ./src

COPY --from=frontend-builder /app/frontend/dist ./public

EXPOSE 8099
CMD ["node", "server.js"]