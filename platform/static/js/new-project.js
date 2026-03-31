/**
 * New Project Wizard Logic
 */
(function() {
    'use strict';

    var currentStep = 1;
    var totalSteps = 3;
    var clients = [];

    // Form data
    var formData = {
        useExistingClient: false,
        clientId: null,
        clientName: '',
        clientCompany: '',
        clientEmail: '',
        clientPhone: '',
        projectName: '',
        serviceType: '',
        budget: '',
        timelineWeeks: ''
    };

    var serviceLabels = {
        'ai_agents': 'AI Agents & Automation',
        'nocode_to_prod': 'NoCode to Production',
        'web_dev': 'Web Development',
        'retainer': 'Maintenance Retainer'
    };

    function init() {
        Utils.initMobileMenu();
        loadClients();
        bindEvents();
        showStep(1);
    }

    async function loadClients() {
        try {
            var data = await API.get('/clients');
            clients = data.clients || data || [];
            renderClientDropdown();
        } catch (err) {
            // Clients endpoint might not have data yet, that's fine
            clients = [];
            renderClientDropdown();
        }
    }

    function renderClientDropdown() {
        var select = document.getElementById('existing-client');
        if (!select) return;
        var html = '<option value="">-- Select a client --</option>';
        for (var i = 0; i < clients.length; i++) {
            var c = clients[i];
            var label = Utils.escapeHtml(c.name || '');
            if (c.company) label += ' (' + Utils.escapeHtml(c.company) + ')';
            html += '<option value="' + c.id + '">' + label + '</option>';
        }
        select.innerHTML = html;
    }

    function bindEvents() {
        // Step navigation
        var nextBtns = document.querySelectorAll('[data-action="next"]');
        for (var i = 0; i < nextBtns.length; i++) {
            nextBtns[i].addEventListener('click', function() { goToStep(currentStep + 1); });
        }

        var prevBtns = document.querySelectorAll('[data-action="prev"]');
        for (var j = 0; j < prevBtns.length; j++) {
            prevBtns[j].addEventListener('click', function() { goToStep(currentStep - 1); });
        }

        // Client toggle
        var existingClientSelect = document.getElementById('existing-client');
        if (existingClientSelect) {
            existingClientSelect.addEventListener('change', function() {
                var val = this.value;
                formData.useExistingClient = !!val;
                formData.clientId = val || null;
                var newFields = document.getElementById('new-client-fields');
                if (val) {
                    newFields.classList.add('hidden');
                    // Find client info
                    for (var k = 0; k < clients.length; k++) {
                        if (String(clients[k].id) === val) {
                            formData.clientName = clients[k].name || '';
                            formData.clientCompany = clients[k].company || '';
                            break;
                        }
                    }
                } else {
                    newFields.classList.remove('hidden');
                    formData.useExistingClient = false;
                    formData.clientId = null;
                }
            });
        }

        // Service type selection
        var serviceOptions = document.querySelectorAll('.service-option');
        for (var s = 0; s < serviceOptions.length; s++) {
            serviceOptions[s].addEventListener('click', function() {
                // Deselect all
                var allOpts = document.querySelectorAll('.service-option');
                for (var x = 0; x < allOpts.length; x++) {
                    allOpts[x].classList.remove('selected');
                }
                this.classList.add('selected');
                formData.serviceType = this.getAttribute('data-service');
            });
        }

        // Submit
        var submitBtn = document.getElementById('btn-create');
        if (submitBtn) {
            submitBtn.addEventListener('click', handleSubmit);
        }
    }

    function goToStep(step) {
        if (step < 1 || step > totalSteps) return;

        // Validate before advancing
        if (step > currentStep && !validateStep(currentStep)) {
            return;
        }

        // Collect data from current step before moving
        collectStepData(currentStep);

        currentStep = step;
        showStep(step);

        // If going to review, populate it
        if (step === 3) {
            populateReview();
        }
    }

    function showStep(step) {
        for (var i = 1; i <= totalSteps; i++) {
            var panel = document.getElementById('step-' + i);
            if (panel) {
                panel.classList.toggle('hidden', i !== step);
            }
        }

        // Update step indicators
        var stepItems = document.querySelectorAll('.wizard-step-item');
        for (var j = 0; j < stepItems.length; j++) {
            var num = j + 1;
            stepItems[j].classList.remove('active', 'done');
            if (num < step) {
                stepItems[j].classList.add('done');
            } else if (num === step) {
                stepItems[j].classList.add('active');
            }
        }
    }

    function collectStepData(step) {
        if (step === 1) {
            if (!formData.useExistingClient) {
                formData.clientName = getVal('client-name');
                formData.clientCompany = getVal('client-company');
                formData.clientEmail = getVal('client-email');
                formData.clientPhone = getVal('client-phone');
            }
        } else if (step === 2) {
            formData.projectName = getVal('project-name');
            formData.budget = getVal('project-budget');
            formData.timelineWeeks = getVal('project-timeline');
        }
    }

    function validateStep(step) {
        clearErrors();

        if (step === 1) {
            if (!formData.useExistingClient) {
                var name = getVal('client-name');
                var email = getVal('client-email');
                if (!name.trim()) {
                    showError('client-name', 'Name is required.');
                    return false;
                }
                if (email && email.indexOf('@') === -1) {
                    showError('client-email', 'Please enter a valid email.');
                    return false;
                }
            }
            return true;
        }

        if (step === 2) {
            var projName = getVal('project-name');
            if (!projName.trim()) {
                showError('project-name', 'Project name is required.');
                return false;
            }
            if (!formData.serviceType) {
                Toast.warning('Please select a service type.');
                return false;
            }
            return true;
        }

        return true;
    }

    function populateReview() {
        collectStepData(2);
        var container = document.getElementById('review-content');
        if (!container) return;

        var clientDisplay = formData.useExistingClient
            ? formData.clientName + (formData.clientCompany ? ' (' + formData.clientCompany + ')' : '')
            : (formData.clientName || 'New Client') + (formData.clientCompany ? ' (' + formData.clientCompany + ')' : '');

        var html = '<div class="review-summary">';
        html += reviewItem('Client', Utils.escapeHtml(clientDisplay));
        html += reviewItem('Project', Utils.escapeHtml(formData.projectName));
        html += reviewItem('Service', Utils.escapeHtml(serviceLabels[formData.serviceType] || formData.serviceType));
        if (formData.budget) {
            html += reviewItem('Budget', '$' + Utils.escapeHtml(formData.budget));
        }
        if (formData.timelineWeeks) {
            html += reviewItem('Timeline', Utils.escapeHtml(formData.timelineWeeks) + ' weeks');
        }
        html += '</div>';

        html += '<div class="review-note">';
        html += '<div><span class="check-icon">&#10003;</span> Client record' + (formData.useExistingClient ? ' (existing)' : ' will be created') + '</div>';
        html += '<div><span class="check-icon">&#10003;</span> Project with 11 phases</div>';
        html += '<div><span class="check-icon">&#10003;</span> 45+ automated & manual tasks</div>';
        html += '</div>';

        container.innerHTML = html;
    }

    function reviewItem(label, value) {
        return '<div class="review-item">' +
            '<span class="review-label">' + label + '</span>' +
            '<span class="review-value">' + value + '</span>' +
            '</div>';
    }

    async function handleSubmit() {
        var btn = document.getElementById('btn-create');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Creating...';
        }

        try {
            var clientId = formData.clientId;

            // Create client if new
            if (!formData.useExistingClient) {
                var clientPayload = {
                    name: formData.clientName,
                    company: formData.clientCompany || null,
                    email: formData.clientEmail || null,
                    phone: formData.clientPhone || null
                };
                var clientResult = await API.post('/clients', clientPayload);
                clientId = clientResult.id;
            }

            // Create project
            var projectPayload = {
                client_id: clientId ? Number(clientId) : null,
                name: formData.projectName,
                service_type: formData.serviceType,
                budget: formData.budget ? Number(formData.budget) : null,
                timeline_weeks: formData.timelineWeeks ? Number(formData.timelineWeeks) : null
            };
            var projectResult = await API.post('/projects', projectPayload);

            Toast.success('Project created successfully!');

            // Redirect to project detail
            setTimeout(function() {
                window.location.href = 'project.html?id=' + projectResult.id;
            }, 800);

        } catch (err) {
            Toast.error('Failed to create project: ' + err.message);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '&#9654; Create Project';
            }
        }
    }

    // Helpers
    function getVal(id) {
        var el = document.getElementById(id);
        return el ? el.value : '';
    }

    function showError(inputId, message) {
        var el = document.getElementById(inputId);
        if (el) {
            el.classList.add('error');
            var errDiv = document.createElement('div');
            errDiv.className = 'form-error';
            errDiv.textContent = message;
            el.parentNode.appendChild(errDiv);
        }
    }

    function clearErrors() {
        var errors = document.querySelectorAll('.form-error');
        for (var i = 0; i < errors.length; i++) {
            errors[i].remove();
        }
        var inputs = document.querySelectorAll('.form-input.error');
        for (var j = 0; j < inputs.length; j++) {
            inputs[j].classList.remove('error');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
