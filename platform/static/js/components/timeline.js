/* Phase timeline stepper - clickable (back only), locked forward */
const Timeline = {
    render(phases, currentPhase, viewingPhase) {
        return `<div class="timeline">${phases.map(p => {
            let cls = 'timeline-step';
            let icon = p.phase_number;
            const canNavigate = p.phase_number <= currentPhase;

            if (p.status === 'completed') { cls += ' completed'; icon = '&#10003;'; }
            else if (p.status === 'skipped') { cls += ' skipped'; icon = '&#8211;'; }
            else if (p.phase_number === currentPhase) { cls += ' current'; }
            else { cls += ' locked'; }

            if (viewingPhase && p.phase_number === viewingPhase && p.phase_number !== currentPhase) {
                cls += ' viewing';
            }

            const onclick = canNavigate ? `onclick="ProjectView._viewPhase(${p.phase_number})"` : '';
            const cursor = canNavigate ? 'cursor:pointer' : 'cursor:not-allowed;opacity:0.5';

            return `<div class="${cls}" title="${Utils.esc(p.phase_name)}" ${onclick} style="${cursor}">
                <div class="timeline-circle">${icon}</div>
                <div class="timeline-label">${Utils.esc(p.phase_name)}</div>
            </div>`;
        }).join('<div class="timeline-line"></div>')}</div>`;
    }
};
