# Bizora Pilot web app: built with the Angular CLI, served by nginx, which also proxies /api to the API.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
# Where nginx forwards /api requests (the backend service in docker-compose by default).
ENV API_UPSTREAM=http://backend:3000
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist/electrohub-web/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
