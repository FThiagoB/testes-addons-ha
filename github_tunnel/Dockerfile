ARG BUILD_FROM
FROM ${BUILD_FROM}

RUN apk add --no-cache curl jq && \
    ARCH=$(apk --print-arch) && \
    case "$ARCH" in \
        x86_64)  CF_ARCH="amd64" ;; \
        aarch64) CF_ARCH="arm64" ;; \
        armv7)   CF_ARCH="arm"   ;; \
        armhf)   CF_ARCH="arm"   ;; \
        i386)    CF_ARCH="386"   ;; \
        *)       CF_ARCH="amd64" ;; \
    esac && \
    curl -L "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${CF_ARCH}" \
         -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared && \
    cloudflared --version

COPY rootfs /
COPY run.sh /run.sh
RUN chmod +x /run.sh && \
    chmod +x /etc/s6-overlay/s6-rc.d/github_tunnel/run