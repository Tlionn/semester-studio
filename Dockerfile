# syntax=docker/dockerfile:1

# Build the browser bundle from the locked dependency, including SheetJS.
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

COPY scripts/build.mjs ./scripts/build.mjs
COPY dist/ ./dist/
RUN npm run build

# The runtime only serves static files; Node and npm stay in the build stage.
FROM nginx:stable-alpine AS runtime
LABEL org.opencontainers.image.title="Semester Studio" \
      org.opencontainers.image.description="Engineering college timetable and faculty workload planner" \
      org.opencontainers.image.source="https://github.com/Tlionn/semester-studio"

COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist/ /usr/share/nginx/html/

USER nginx
RUN nginx -t

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "-T", "3", "-O", "/dev/null", "http://127.0.0.1:8080/healthz"]

# No startup scripts, configuration rewriting, or runtime downloads are needed.
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
