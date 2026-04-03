#!/usr/bin/env bash
# handlers/kubernetes.sh - Kubernetes resources & PVC backup handler
# Strategy Pattern: implements backup_kubernetes() + detect_kubernetes()

set -euo pipefail

HANDLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -z "${BACKUP_SYSTEM_DIR:-}" ]] && source "${HANDLER_DIR}/../lib/common.sh"
[[ "$(type -t backup_to_all_destinations)" != "function" ]] && source "${HANDLER_DIR}/../lib/destinations.sh"

backup_kubernetes() {
    local config_file="${1:-$CONFIG_FILE}"
    log_info "Starting Kubernetes backup..."

    local kubeconfig
    kubeconfig="$(get_config '.backup.services.kubernetes.kubeconfig' '' "$config_file")"
    [[ -n "$kubeconfig" ]] && export KUBECONFIG="$kubeconfig"

    # Verify cluster access
    if ! kubectl cluster-info &>/dev/null 2>&1; then
        log_error "Cannot connect to Kubernetes cluster"
        return 1
    fi

    local temp_dir
    temp_dir="$(ensure_temp_dir)/kubernetes"
    mkdir -p "$temp_dir"

    _backup_k8s_resources "$config_file" "$temp_dir"

    local backup_pvcs
    backup_pvcs="$(get_config '.backup.services.kubernetes.backup_pvcs' 'true' "$config_file")"
    [[ "$backup_pvcs" == "true" ]] && _backup_k8s_pvcs "$config_file" "$temp_dir"

    # Upload to destinations
    if [[ -d "$temp_dir" ]] && ls "$temp_dir"/* &>/dev/null 2>&1; then
        backup_to_all_destinations "kubernetes" "$temp_dir" || {
            log_error "Failed to upload Kubernetes backup"
            rm -rf "$temp_dir"
            return 1
        }
        log_success "Kubernetes backup complete"
    fi

    rm -rf "$temp_dir"
    return 0
}

_backup_k8s_resources() {
    local config_file="$1"
    local temp_dir="$2"

    # Get namespaces
    local namespaces=()
    while IFS= read -r ns; do
        [[ -n "$ns" ]] && namespaces+=("$ns")
    done < <(get_config_array '.backup.services.kubernetes.namespaces' "$config_file")

    # If no namespaces specified, get all non-system namespaces
    if [[ ${#namespaces[@]} -eq 0 ]]; then
        while IFS= read -r ns; do
            [[ -n "$ns" ]] && namespaces+=("$ns")
        done < <(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr ' ' '\n' | \
            grep -Ev '^(kube-system|kube-public|kube-node-lease)$')
    fi

    # Get resource types to backup
    local resources=()
    while IFS= read -r res; do
        [[ -n "$res" ]] && resources+=("$res")
    done < <(get_config_array '.backup.services.kubernetes.resources' "$config_file")

    if [[ ${#resources[@]} -eq 0 ]]; then
        resources=(deployments services configmaps secrets persistentvolumeclaims ingresses statefulsets)
    fi

    log_info "Backing up K8s resources from ${#namespaces[@]} namespaces"

    for ns in "${namespaces[@]}"; do
        local ns_dir="${temp_dir}/namespaces/${ns}"
        mkdir -p "$ns_dir"

        for resource in "${resources[@]}"; do
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would backup ${resource} in namespace ${ns}"
                continue
            fi

            local output_file="${ns_dir}/${resource}.yaml"
            kubectl get "$resource" -n "$ns" -o yaml > "$output_file" 2>/dev/null || {
                log_debug "No ${resource} found in namespace ${ns}"
                rm -f "$output_file"
                continue
            }

            # Check if output is empty (no resources)
            if grep -q "items: \[\]" "$output_file" 2>/dev/null; then
                rm -f "$output_file"
                continue
            fi

            log_debug "Exported ${resource} from namespace ${ns}"
        done
    done
}

_backup_k8s_pvcs() {
    local config_file="$1"
    local temp_dir="$2"

    log_info "Backing up Kubernetes PVC data..."

    local namespaces=()
    while IFS= read -r ns; do
        [[ -n "$ns" ]] && namespaces+=("$ns")
    done < <(get_config_array '.backup.services.kubernetes.namespaces' "$config_file")

    if [[ ${#namespaces[@]} -eq 0 ]]; then
        while IFS= read -r ns; do
            [[ -n "$ns" ]] && namespaces+=("$ns")
        done < <(kubectl get namespaces -o jsonpath='{.items[*].metadata.name}' 2>/dev/null | tr ' ' '\n' | \
            grep -Ev '^(kube-system|kube-public|kube-node-lease)$')
    fi

    for ns in "${namespaces[@]}"; do
        local pvcs
        pvcs="$(kubectl get pvc -n "$ns" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)" || continue
        [[ -z "$pvcs" ]] && continue

        for pvc in $pvcs; do
            if [[ "$DRY_RUN" == "true" ]]; then
                log_info "[DRY-RUN] Would backup PVC ${pvc} in namespace ${ns}"
                continue
            fi

            log_info "Backing up PVC: ${ns}/${pvc}"
            local pvc_dir="${temp_dir}/pvc/${ns}"
            mkdir -p "$pvc_dir"

            # Create temporary pod to access PVC data
            local pod_name="backup-pvc-${pvc}-$(date +%s)"
            kubectl run "$pod_name" -n "$ns" \
                --image=alpine:latest \
                --restart=Never \
                --overrides="{
                    \"spec\": {
                        \"containers\": [{
                            \"name\": \"backup\",
                            \"image\": \"alpine:latest\",
                            \"command\": [\"tar\", \"czf\", \"/backup/data.tar.gz\", \"-C\", \"/data\", \".\"],
                            \"volumeMounts\": [
                                {\"name\": \"pvc-data\", \"mountPath\": \"/data\", \"readOnly\": true},
                                {\"name\": \"backup-vol\", \"mountPath\": \"/backup\"}
                            ]
                        }],
                        \"volumes\": [
                            {\"name\": \"pvc-data\", \"persistentVolumeClaim\": {\"claimName\": \"${pvc}\"}},
                            {\"name\": \"backup-vol\", \"emptyDir\": {}}
                        ],
                        \"restartPolicy\": \"Never\"
                    }
                }" 2>/dev/null || {
                log_warn "Failed to create backup pod for PVC: ${ns}/${pvc}"
                continue
            }

            # Wait for pod completion
            kubectl wait --for=condition=ready "pod/$pod_name" -n "$ns" --timeout=120s 2>/dev/null || true
            kubectl wait --for=jsonpath='{.status.phase}'=Succeeded "pod/$pod_name" -n "$ns" --timeout=300s 2>/dev/null || {
                log_warn "Backup pod timed out for PVC: ${ns}/${pvc}"
                kubectl delete pod "$pod_name" -n "$ns" --force 2>/dev/null || true
                continue
            }

            # Copy backup from pod
            kubectl cp "${ns}/${pod_name}:/backup/data.tar.gz" "${pvc_dir}/${pvc}.tar.gz" 2>/dev/null || {
                log_warn "Failed to copy PVC backup: ${ns}/${pvc}"
            }

            # Cleanup pod
            kubectl delete pod "$pod_name" -n "$ns" --force 2>/dev/null || true

            log_debug "PVC backed up: ${ns}/${pvc}"
        done
    done
}

restore_kubernetes() {
    local config_file="$1"
    local snapshot_id="$2"
    local target_dir="$3"

    log_info "Restoring Kubernetes from snapshot: $snapshot_id"
    restore_snapshot "$config_file" "$snapshot_id" "$target_dir"
    log_info "Restored K8s manifests to: $target_dir"
    log_info "To restore resources: kubectl apply -f $target_dir/namespaces/<namespace>/"
    log_info "To restore PVC data: extract tar.gz and use kubectl cp"
}
