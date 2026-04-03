#!/usr/bin/env bash
# lib/notify.sh - Notification system
# Observer Pattern: each notification channel is independent, subscribes to backup events

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${SCRIPT_DIR}/common.sh"

# ──────────────────────────────────────────────
# Main dispatcher (Observer Pattern)
# ──────────────────────────────────────────────

notify_all() {
    local config_file="$1"
    local status="$2"
    local project="$3"
    local duration="$4"
    local successes="$5"
    local errors="$6"

    local message
    message="$(build_summary "$status" "$project" "$duration" "$successes" "$errors")"

    # Dispatch to each enabled channel
    local slack_enabled
    slack_enabled="$(get_config '.backup.notifications.slack.enabled' 'false' "$config_file")"
    [[ "$slack_enabled" == "true" ]] && notify_slack "$config_file" "$message" "$status"

    local email_enabled
    email_enabled="$(get_config '.backup.notifications.email.enabled' 'false' "$config_file")"
    [[ "$email_enabled" == "true" ]] && notify_email "$config_file" "$message" "$status"

    local webhook_enabled
    webhook_enabled="$(get_config '.backup.notifications.webhook.enabled' 'false' "$config_file")"
    [[ "$webhook_enabled" == "true" ]] && notify_webhook "$config_file" "$message" "$status"
}

# ──────────────────────────────────────────────
# Summary builder
# ──────────────────────────────────────────────

build_summary() {
    local status="$1"
    local project="$2"
    local duration="$3"
    local successes="$4"
    local errors="$5"

    local emoji="[OK]"
    [[ "$status" == "partial_failure" ]] && emoji="[WARN]"
    [[ "$status" == "failure" ]] && emoji="[FAIL]"

    cat <<EOF
${emoji} Backup ${status}: ${project}
Duration: ${duration}
Successes: ${successes}
Errors: ${errors}
Time: $(date '+%Y-%m-%d %H:%M:%S')
EOF
}

# ──────────────────────────────────────────────
# Slack webhook
# ──────────────────────────────────────────────

notify_slack() {
    local config_file="$1"
    local message="$2"
    local status="$3"

    local webhook_url
    webhook_url="$(get_config '.backup.notifications.slack.webhook_url' '' "$config_file")"

    if [[ -z "$webhook_url" ]]; then
        log_warn "Slack webhook URL not configured"
        return 1
    fi

    local color="#36a64f"
    [[ "$status" == "partial_failure" ]] && color="#ff9900"
    [[ "$status" == "failure" ]] && color="#ff0000"

    local payload
    payload="$(jq -n --arg text "$message" --arg color "$color" '{
        attachments: [{
            color: $color,
            text: $text
        }]
    }')"

    curl -s -X POST -H "Content-Type: application/json" \
        -d "$payload" "$webhook_url" &>/dev/null || {
        log_warn "Failed to send Slack notification"
        return 1
    }

    log_debug "Slack notification sent"
}

# ──────────────────────────────────────────────
# Email notification
# ──────────────────────────────────────────────

notify_email() {
    local config_file="$1"
    local message="$2"
    local status="$3"

    local to smtp_host smtp_port smtp_user smtp_password
    to="$(get_config '.backup.notifications.email.to' '' "$config_file")"
    smtp_host="$(get_config '.backup.notifications.email.smtp_host' '' "$config_file")"
    smtp_port="$(get_config '.backup.notifications.email.smtp_port' '587' "$config_file")"
    smtp_user="$(get_config '.backup.notifications.email.smtp_user' '' "$config_file")"
    smtp_password="$(get_config '.backup.notifications.email.smtp_password' '' "$config_file")"

    if [[ -z "$to" ]]; then
        log_warn "Email recipient not configured"
        return 1
    fi

    local subject="Backup ${status}: $(get_config '.backup.project_name' 'unknown' "$config_file")"

    # Try sendmail/mail first (system MTA)
    if command -v mail &>/dev/null; then
        echo "$message" | mail -s "$subject" "$to" 2>/dev/null || {
            log_warn "Failed to send email via mail command"
            return 1
        }
    elif command -v sendmail &>/dev/null; then
        {
            echo "To: $to"
            echo "Subject: $subject"
            echo ""
            echo "$message"
        } | sendmail "$to" 2>/dev/null || {
            log_warn "Failed to send email via sendmail"
            return 1
        }
    elif [[ -n "$smtp_host" ]]; then
        # Use curl for SMTP
        curl --url "smtp://${smtp_host}:${smtp_port}" \
            --ssl-reqd \
            --mail-from "$smtp_user" \
            --mail-rcpt "$to" \
            --user "${smtp_user}:${smtp_password}" \
            -T <(echo -e "Subject: ${subject}\n\n${message}") \
            &>/dev/null || {
            log_warn "Failed to send email via SMTP"
            return 1
        }
    else
        log_warn "No email transport available (mail, sendmail, or SMTP config needed)"
        return 1
    fi

    log_debug "Email notification sent to: $to"
}

# ──────────────────────────────────────────────
# Custom webhook
# ──────────────────────────────────────────────

notify_webhook() {
    local config_file="$1"
    local message="$2"
    local status="$3"

    local url method
    url="$(get_config '.backup.notifications.webhook.url' '' "$config_file")"
    method="$(get_config '.backup.notifications.webhook.method' 'POST' "$config_file")"

    if [[ -z "$url" ]]; then
        log_warn "Webhook URL not configured"
        return 1
    fi

    local payload
    payload="$(jq -n \
        --arg status "$status" \
        --arg message "$message" \
        --arg project "$(get_config '.backup.project_name' 'unknown' "$config_file")" \
        --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{status: $status, message: $message, project: $project, timestamp: $timestamp}'
    )"

    curl -s -X "$method" -H "Content-Type: application/json" \
        -d "$payload" "$url" &>/dev/null || {
        log_warn "Failed to send webhook notification to: $url"
        return 1
    }

    log_debug "Webhook notification sent to: $url"
}
