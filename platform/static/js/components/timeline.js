/* Phase timeline stepper */
const Timeline = {
    render(phases, currentPhase) {
        return `<div class="timeline">${phases.map(p => {
            let cls = 'timeline-step';
            let icon = p.phase_number;
            if (p.status === 'completed') { cls += ' completed'; icon = '&#10003;'; }
            else if (p.status === 'skipped') { cls += ' skipped'; icon = '&#8211;'; }
            else if (p.phase_number === currentPhase) { cls += ' current'; }
            return `<div class="${cls}" title="${Utils.esc(p.phase_name)}" data-phase="${p.phase_number}">
                <div class="timeline-circle">${icon}</div>
                <div class="timeline-label">${Utils.esc(p.phase_name)}</div>
            </div>`;
        }).join('<div class="timeline-line"></div>')}</div>`;
    }
};
