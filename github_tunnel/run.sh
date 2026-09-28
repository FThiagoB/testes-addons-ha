#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
set -e

readonly BRANCH="main"
readonly GITHUB_FILE="index.html"
readonly CF_LOG="/tmp/cloudflared.log"
readonly GH_GET_BODY="/tmp/gh_get.json"

TOKEN=$(bashio::config 'github_token')
REPO=$(bashio::config 'github_repo')
TARGET=$(bashio::config 'target')

CF_PID=""
TUNNEL_URL=""

check_internet() {
    bashio::log.info "Verificando conectividade com a internet..."
    local max_attempts=5
    local attempt=1

    while [ "$attempt" -le "$max_attempts" ]; do
        if curl -s --connect-timeout 5 --max-time 10 -o /dev/null \
               -w "%{http_code}" "http://cp.cloudflare.com/generate_204" \
               | grep -q "204"; then
            bashio::log.info "Internet OK (tentativa $attempt)."
            return 0
        fi
        bashio::log.warning "Sem internet (tentativa $attempt/$max_attempts). Aguardando..."
        sleep 5
        attempt=$((attempt + 1))
    done

    bashio::log.error "Falha ao verificar internet após $max_attempts tentativas."
    return 1
}

update_github() {
    local tunnel_url="${1:-}"

    if [ -z "$tunnel_url" ]; then
        bashio::log.error "URL do túnel inválida para atualização."
        return 1
    fi

    if [ -z "$TOKEN" ] || [ -z "$REPO" ]; then
        bashio::log.error "github_token ou github_repo não configurados!"
        return 1
    fi

    bashio::log.info "Atualizando ${REPO}/${GITHUB_FILE} (branch: ${BRANCH})..."

    local safe_url
    safe_url=$(printf '%s' "$tunnel_url" | sed 's/&/\&amp;/g; s/"/\&quot;/g')

    local html_raw
    html_raw="<!DOCTYPE html><html><head><meta http-equiv=\"refresh\" content=\"0; url=${safe_url}\"><script>window.location.href='${safe_url}';</script></head><body>Redirecionando para o Home Assistant...</body></html>"

    local b64_content
    b64_content=$(printf '%s' "$html_raw" | base64 | tr -d '\n')

    local sha_http
    sha_http=$(curl -s -o "$GH_GET_BODY" -w "%{http_code}" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${REPO}/contents/${GITHUB_FILE}?ref=${BRANCH}")

    if [ "$sha_http" != "200" ] && [ "$sha_http" != "404" ]; then
        bashio::log.error "Erro ao consultar ${GITHUB_FILE} no GitHub (HTTP ${sha_http})."
        return 1
    fi

    local sha
    sha=$(jq -r '.sha // empty' "$GH_GET_BODY" 2>/dev/null || true)

    local payload
    if [ -n "$sha" ] && [ "$sha" != "null" ]; then
        payload=$(jq -n \
            --arg msg "feat: Atualizando o redirecionamento" \
            --arg content "$b64_content" \
            --arg sha "$sha" \
            --arg branch "$BRANCH" \
            '{message: $msg, content: $content, sha: $sha, branch: $branch}')
    else
        payload=$(jq -n \
            --arg msg "feat: Criando o redirecionamento" \
            --arg content "$b64_content" \
            --arg branch "$BRANCH" \
            '{message: $msg, content: $content, branch: $branch}')
    fi

    local http_status
    http_status=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        -d "$payload" \
        "https://api.github.com/repos/${REPO}/contents/${GITHUB_FILE}")

    if [ "$http_status" -eq 200 ] || [ "$http_status" -eq 201 ]; then
        bashio::log.info "GitHub atualizado com sucesso! (HTTP ${http_status})"
        return 0
    fi

    bashio::log.error "Falha ao atualizar o GitHub. Código HTTP: ${http_status}"
    return 1
}

start_tunnel() {
    local timeout=30
    local count=0
    local url

    if [ -z "$TARGET" ]; then
        bashio::log.error "target não configurado!"
        return 1
    fi

    bashio::log.info "Iniciando Cloudflare Quick Tunnel para ${TARGET}..."

    : > "$CF_LOG"

    cloudflared tunnel --no-tls-verify --url "$TARGET" --no-autoupdate > "$CF_LOG" 2>&1 &
    CF_PID=$!

    while [ "$count" -lt "$timeout" ]; do
        url=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" | head -n1 || true)
        if [ -n "$url" ]; then
            TUNNEL_URL="$url"
            bashio::log.info "Túnel ativo: ${url}"
            return 0
        fi

        if ! kill -0 "$CF_PID" 2>/dev/null; then
            bashio::log.error "cloudflared terminou inesperadamente. Log:"
            cat "$CF_LOG"
            return 1
        fi

        sleep 1
        count=$((count + 1))
    done

    bashio::log.error "Timeout ao capturar URL do túnel. Log:"
    cat "$CF_LOG"
    kill "$CF_PID" 2>/dev/null || true
    return 1
}

monitora_tunel(){
    local max_failures=3
    local failures=0
    local sleep_time=60

    bashio::log.info "Monitorando a URL: $TUNNEL_URL"

    while kill -0 "$CF_PID" 2>/dev/null; do
        sleep "$sleep_time"

        local http_status
        http_status=$(curl -s -m 15 -0 /dev/null -w "%{http_code}" "$TUNNEL_URL" || echo "000")

        if ["$http_status" -ge 200] && ["$http_status" -lt 500]; then
            failures = 0
        
        else
            failures=$((failures + 1))
            bashio::log.warning "Não foi possível acessar o túnel. HTTP $http_status ($failures/$max_failures)."
        fi

        if ["$failures" -ge "$max_failures"]; then
            bashio::log.error "Túnel indisponível... Resetando..."
            return 1
        fi
    done

    bashio::log.warning "Cloudflared encerrado inesperadamente";
    return 1
}

main() {
    while true; do
        if ! check_internet; then
            sleep 60
            continue
        fi

        if start_tunnel; then
            if ! update_github "$TUNNEL_URL"; then
                bashio::log.warning "Falha ao atualizar o Github"
            fi

            monitora_tunel || true
        fi

        bashio::log.info "Limpando o processo"
        kill "$CF_PID" 2>/dev/null || true
        wait "$CF_PID" 2>/dev/null || true
        
        sleep 10
    done
}

main