/* Phase timeline stepper - clickable circles with viewing state */
const Timeline = {
    render(phases, currentPhase, viewingPhase) {
        return `<div class="timeline">${phases.map(p => {
            let cls = 'timeline-step';
            let icon = p.phase_number;
            if (p.status === 'completed') { cls += ' completed'; icon = '&#10003;'; }
            else if (p.status === 'skipped') { cls += ' skipped'; icon = '&#8211;'; }
            else if (p.phase_number === currentPhase) { cls += ' current'; }
            if (viewingPhase && p.phase_number === viewingPhase && p.phase_number !== currentPhase) {
                cls += ' viewing';
            }
            return `<div class="${cls}" title="${Utils.esc(p.phase_name)}"
                         onclick="ProjectView._viewPhase(${p.phase_number})"
                         style="cursor:pointer">
                <div class="timeline-circle">${icon}</div>
                <div class="timeline-label">${Utils.esc(p.phase_name)}</div>
            </div>`;
        }).join('<div class="timeline-line"></div>')}</div>`;
    }
};
