# ---- Multi-stage build for the React/Vite frontend ----

# Stage 1: build the static bundle.
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .

# VITE_API_BASE is left empty by default so the app calls same-origin /api,
# which Nginx proxies to the backend. Override at build time for a split deploy.
ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

# Stage 2: serve the bundle with Nginx.
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
