# Stage 1: Build
FROM node:24-alpine AS build
WORKDIR /app

# Install dependencies first (layer-cached separately from source)
COPY package*.json ./
RUN npm ci

# Build production assets
COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginxinc/nginx-unprivileged:1.30-alpine
# Pull in patched Alpine packages at build time so the image isn't pinned to
# whatever CVEs were unfixed when this base tag was published (e.g. openssl).
# apk needs root; the base image's non-root user (101) is restored after.
USER root
RUN apk update && apk upgrade --no-cache
USER 101
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/security-headers.conf /etc/nginx/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
