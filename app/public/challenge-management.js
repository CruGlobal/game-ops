document.addEventListener('DOMContentLoaded', async () => {
    const authStatus = document.getElementById('auth-status');
    const adminContent = document.getElementById('admin-content');
    const unauthorizedContent = document.getElementById('unauthorized-content');
    const challengesList = document.getElementById('challenges-list');
    const challengeCreateForm = document.getElementById('challenge-create-form');
    const challengeCreateStatus = document.getElementById('challenge-create-status');
    const challengeCategorySelect = document.getElementById('challenge-category');
    const generalChallengeFields = document.getElementById('general-challenge-fields');
    const okrChallengeFields = document.getElementById('okr-challenge-fields');
    const challengeTypeSelect = document.getElementById('challenge-type');
    const targetHelpText = document.getElementById('target-help-text');

    // State
    let allChallenges = [];
    let currentTab = 'all';
    let currentStatusFilter = 'active';
    let searchTerm = '';
    let selectedChallenges = new Set();
    let templates = [];

    // Token management
    const setToken = (token) => {
        try {
            localStorage.setItem('token', token);
        } catch (error) {
            console.error('Error setting token in localStorage:', error);
        }
    };

    const getToken = () => {
        try {
            return localStorage.getItem('token');
        } catch (error) {
            console.error('Error getting token from localStorage:', error);
            return null;
        }
    };

    // Check if token is present in URL and store it in localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
        setToken(token);
        window.history.replaceState({}, document.title, "/admin/challenges");
    }

    // Set default dates
    const startDateInput = document.getElementById('start-date');
    const endDateInput = document.getElementById('end-date');
    const today = new Date().toISOString().split('T')[0];
    startDateInput.value = today;
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    endDateInput.value = thirtyDaysFromNow.toISOString().split('T')[0];

    // Toggle challenge fields based on category
    challengeCategorySelect.addEventListener('change', (e) => {
        const category = e.target.value;
        if (category === 'okr') {
            generalChallengeFields.style.display = 'none';
            okrChallengeFields.style.display = 'block';
            challengeTypeSelect.value = 'okr-label';
            challengeTypeSelect.required = false;
            document.getElementById('label-filters').required = true;
        } else {
            generalChallengeFields.style.display = 'block';
            okrChallengeFields.style.display = 'none';
            challengeTypeSelect.required = true;
            document.getElementById('label-filters').required = false;
        }
    });

    // Update target help text based on challenge type
    challengeTypeSelect.addEventListener('change', (e) => {
        const type = e.target.value;
        const helpTexts = {
            'pr-merge': 'Number of PRs to merge',
            'review': 'Number of code reviews to complete',
            'streak': 'Number of consecutive contribution days',
            'points': 'Total points to earn'
        };
        targetHelpText.textContent = helpTexts[type] || 'Number of items to complete';
    });

    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentTab = e.target.dataset.tab;
            filterAndDisplayChallenges();
        });
    });

    // Status filter
    document.getElementById('status-filter').addEventListener('change', (e) => {
        currentStatusFilter = e.target.value;
        filterAndDisplayChallenges();
    });

    // Search filter
    document.getElementById('search-filter').addEventListener('input', (e) => {
        searchTerm = e.target.value.toLowerCase();
        filterAndDisplayChallenges();
    });

    // Load all challenges
    const loadChallenges = async () => {
        try {
            const response = await fetch('/api/challenges/admin/all');
            if (!response.ok) {
                throw new Error('Failed to fetch challenges');
            }

            const data = await response.json();
            allChallenges = data.challenges || [];

            updateStats();
            filterAndDisplayChallenges();
        } catch (error) {
            console.error('Error loading challenges:', error);
            challengesList.innerHTML = '<p class="error">Failed to load challenges. Please try again.</p>';
        }
    };

    // Update stats overview
    const updateStats = () => {
        const total = allChallenges.length;
        const active = allChallenges.filter(c => c.status === 'active').length;
        const completed = allChallenges.filter(c => c.status === 'expired' || c.status === 'completed').length;
        const participants = allChallenges.reduce((sum, c) => sum + (c.participants?.length || 0), 0);

        document.getElementById('total-challenges').textContent = total;
        document.getElementById('active-challenges').textContent = active;
        document.getElementById('completed-challenges').textContent = completed;
        document.getElementById('total-participants').textContent = participants;
    };

    // Filter and display challenges
    const filterAndDisplayChallenges = () => {
        let filtered = allChallenges;

        // Filter by tab
        if (currentTab !== 'all') {
            if (currentTab === 'expired') {
                filtered = filtered.filter(c => c.status === 'expired' || c.status === 'completed');
            } else {
                filtered = filtered.filter(c => c.challengeCategory === currentTab);
            }
        }

        // Filter by status
        if (currentStatusFilter !== 'all') {
            filtered = filtered.filter(c => c.status === currentStatusFilter);
        }

        // Filter by search
        if (searchTerm) {
            filtered = filtered.filter(c =>
                c.title.toLowerCase().includes(searchTerm) ||
                c.description.toLowerCase().includes(searchTerm)
            );
        }

        displayChallenges(filtered);
    };

    // Display challenges
    const displayChallenges = (challenges) => {
        if (challenges.length === 0) {
            challengesList.innerHTML = '<p class="no-data">No challenges found matching your filters.</p>';
            return;
        }

        challengesList.innerHTML = '';
        challenges.forEach(challenge => {
            const card = createChallengeCard(challenge);
            challengesList.appendChild(card);
        });
    };

    // Create challenge card
    const createChallengeCard = (challenge) => {
        const card = document.createElement('div');
        card.className = 'challenge-card';

        const participantCount = challenge.participants ? challenge.participants.length : 0;
        const categoryBadge = getCategoryBadge(challenge.challengeCategory);
        const statusBadge = `<span class="badge badge-${challenge.status}">${challenge.status}</span>`;

        let typeInfo = '';
        if (challenge.challengeCategory === 'okr' && challenge.labelFilters && challenge.labelFilters.length > 0) {
            const labelList = challenge.labelFilters.map(l => `<code>${l}</code>`).join(', ');
            typeInfo = `<div><strong>Label Filters:</strong> ${labelList}</div>`;
        } else {
            typeInfo = `<div><strong>Type:</strong> ${challenge.type}</div>`;
        }

        const okrInfo = challenge.okrMetadata && Object.values(challenge.okrMetadata).some(v => v)
            ? `
                <div class="okr-info">
                    ${challenge.okrMetadata.objective ? `<div><strong>Objective:</strong> ${challenge.okrMetadata.objective}</div>` : ''}
                    ${challenge.okrMetadata.keyResult ? `<div><strong>Key Result:</strong> ${challenge.okrMetadata.keyResult}</div>` : ''}
                    ${challenge.okrMetadata.department ? `<div><strong>Department:</strong> ${challenge.okrMetadata.department}</div>` : ''}
                    ${challenge.okrMetadata.quarter ? `<div><strong>Quarter:</strong> ${challenge.okrMetadata.quarter}</div>` : ''}
                </div>
            `
            : '';

        const isSelected = selectedChallenges.has(challenge.id);

        card.innerHTML = `
            <input type="checkbox" class="challenge-card-checkbox" data-id="${challenge.id}"
                ${isSelected ? 'checked' : ''}
                onchange="toggleChallengeSelection('${challenge.id}', this.checked)">
            <div class="challenge-header">
                <h3>${challenge.title}</h3>
                <div class="challenge-badges">
                    ${categoryBadge}
                    ${statusBadge}
                </div>
            </div>
            <p class="challenge-description">${challenge.description}</p>
            <div class="challenge-details">
                ${typeInfo}
                <div><strong>Target:</strong> ${challenge.target}</div>
                <div><strong>Reward:</strong> ${challenge.reward} points</div>
                <div><strong>Difficulty:</strong> <span class="badge badge-${challenge.difficulty}">${challenge.difficulty}</span></div>
                <div><strong>Participants:</strong> ${participantCount}</div>
                <div><strong>Start:</strong> ${new Date(challenge.startDate).toLocaleDateString()}</div>
                <div><strong>End:</strong> ${new Date(challenge.endDate).toLocaleDateString()}</div>
            </div>
            ${okrInfo}
            <div class="challenge-actions">
                <button class="btn-edit" onclick="openEditModal('${challenge.id}')">Edit</button>
                <button class="btn-duplicate" onclick="duplicateChallenge('${challenge.id}')">Duplicate</button>
                <a href="/challenges" class="btn-secondary">View Public Page</a>
                <button class="btn-danger" onclick="deleteChallenge('${challenge.id}')">Delete</button>
            </div>
        `;

        if (isSelected) {
            card.classList.add('selected');
        }

        return card;
    };

    // Get category badge
    const getCategoryBadge = (category) => {
        const badges = {
            'okr': '<span class="badge badge-okr">🎯 OKR</span>',
            'general': '<span class="badge badge-general">📌 General</span>',
            'weekly': '<span class="badge badge-weekly">📅 Weekly</span>'
        };
        return badges[category] || badges['general'];
    };

    // Delete challenge
    window.deleteChallenge = async (challengeId) => {
        if (!confirm('Are you sure you want to delete this challenge? This action cannot be undone.')) {
            return;
        }

        try {
            const storedToken = getToken();
            const response = await fetch(`/api/challenges/admin/${challengeId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${storedToken}`
                }
            });

            if (response.ok) {
                showNotification('Challenge deleted successfully', 'success');
                loadChallenges();
            } else {
                const result = await response.json();
                showNotification(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error deleting challenge:', error);
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // ===== Edit Modal =====
    window.openEditModal = (challengeId) => {
        const challenge = allChallenges.find(c => c.id === challengeId);
        if (!challenge) return;

        document.getElementById('edit-challenge-id').value = challenge.id;
        document.getElementById('edit-title').value = challenge.title;
        document.getElementById('edit-description').value = challenge.description;
        document.getElementById('edit-type').value = challenge.type || 'pr-merge';
        document.getElementById('edit-difficulty').value = challenge.difficulty || 'medium';
        document.getElementById('edit-target').value = challenge.target;
        document.getElementById('edit-reward').value = challenge.reward;
        document.getElementById('edit-status').value = challenge.status;

        const startDate = challenge.startDate ? new Date(challenge.startDate).toISOString().split('T')[0] : '';
        const endDate = challenge.endDate ? new Date(challenge.endDate).toISOString().split('T')[0] : '';
        document.getElementById('edit-start-date').value = startDate;
        document.getElementById('edit-end-date').value = endDate;

        // Disable type change if participants exist
        const hasParticipants = challenge.participants && challenge.participants.length > 0;
        document.getElementById('edit-type').disabled = hasParticipants;
        document.getElementById('edit-participant-warning').style.display = hasParticipants ? 'block' : 'none';

        document.getElementById('edit-modal').classList.add('show');
    };

    window.closeEditModal = () => {
        document.getElementById('edit-modal').classList.remove('show');
    };

    window.submitEditForm = async () => {
        const challengeId = document.getElementById('edit-challenge-id').value;
        const updateData = {
            title: document.getElementById('edit-title').value,
            description: document.getElementById('edit-description').value,
            type: document.getElementById('edit-type').value,
            difficulty: document.getElementById('edit-difficulty').value,
            target: parseInt(document.getElementById('edit-target').value),
            reward: parseInt(document.getElementById('edit-reward').value),
            status: document.getElementById('edit-status').value,
            startDate: document.getElementById('edit-start-date').value,
            endDate: document.getElementById('edit-end-date').value
        };

        // Don't send type if the field is disabled (has participants)
        if (document.getElementById('edit-type').disabled) {
            delete updateData.type;
        }

        try {
            const storedToken = getToken();
            const response = await fetch(`/api/challenges/admin/${challengeId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${storedToken}`
                },
                body: JSON.stringify(updateData)
            });

            const result = await response.json();

            if (response.ok) {
                showNotification('Challenge updated successfully', 'success');
                closeEditModal();
                loadChallenges();
            } else {
                showNotification(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error updating challenge:', error);
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // ===== Duplicate Challenge =====
    window.duplicateChallenge = async (challengeId) => {
        try {
            const storedToken = getToken();
            const response = await fetch(`/api/challenges/admin/${challengeId}/duplicate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${storedToken}`
                }
            });

            const result = await response.json();

            if (response.ok) {
                showNotification(`Challenge duplicated: "${result.challenge.title}"`, 'success');
                loadChallenges();
            } else {
                showNotification(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error duplicating challenge:', error);
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // ===== Bulk Operations =====
    const updateBulkBar = () => {
        const bar = document.getElementById('bulk-action-bar');
        const countEl = document.getElementById('selected-count');
        countEl.textContent = selectedChallenges.size;

        if (selectedChallenges.size > 0) {
            bar.classList.add('show');
        } else {
            bar.classList.remove('show');
        }
    };

    window.toggleChallengeSelection = (challengeId, checked) => {
        if (checked) {
            selectedChallenges.add(challengeId);
        } else {
            selectedChallenges.delete(challengeId);
        }

        // Update card visual
        const cards = document.querySelectorAll('.challenge-card');
        cards.forEach(card => {
            const checkbox = card.querySelector('.challenge-card-checkbox');
            if (checkbox && checkbox.dataset.id === challengeId) {
                card.classList.toggle('selected', checked);
            }
        });

        // Update select-all state
        const selectAll = document.getElementById('select-all');
        if (selectAll) {
            const allCheckboxes = document.querySelectorAll('.challenge-card-checkbox');
            selectAll.checked = allCheckboxes.length > 0 &&
                [...allCheckboxes].every(cb => cb.checked);
        }

        updateBulkBar();
    };

    window.toggleSelectAll = (checked) => {
        const checkboxes = document.querySelectorAll('.challenge-card-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const id = cb.dataset.id;
            if (checked) {
                selectedChallenges.add(id);
            } else {
                selectedChallenges.delete(id);
            }
            cb.closest('.challenge-card').classList.toggle('selected', checked);
        });
        updateBulkBar();
    };

    window.clearSelection = () => {
        selectedChallenges.clear();
        document.querySelectorAll('.challenge-card-checkbox').forEach(cb => {
            cb.checked = false;
            cb.closest('.challenge-card').classList.remove('selected');
        });
        const selectAll = document.getElementById('select-all');
        if (selectAll) selectAll.checked = false;
        updateBulkBar();
    };

    window.bulkAction = async (action) => {
        if (selectedChallenges.size === 0) return;

        const confirmMsg = action === 'delete'
            ? `Are you sure you want to delete ${selectedChallenges.size} challenge(s)? This cannot be undone.`
            : `Are you sure you want to ${action} ${selectedChallenges.size} challenge(s)?`;

        if (!confirm(confirmMsg)) return;

        try {
            const storedToken = getToken();
            const response = await fetch('/api/challenges/admin/bulk-action', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${storedToken}`
                },
                body: JSON.stringify({
                    ids: [...selectedChallenges],
                    action
                })
            });

            const result = await response.json();

            if (response.ok) {
                showNotification(`Bulk ${action} completed: ${result.count || selectedChallenges.size} challenge(s)`, 'success');
                selectedChallenges.clear();
                updateBulkBar();
                loadChallenges();
            } else {
                showNotification(`Error: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error performing bulk action:', error);
            showNotification(`Error: ${error.message}`, 'error');
        }
    };

    // ===== Templates =====
    const loadTemplates = async () => {
        try {
            const response = await fetch('/api/challenges/admin/templates');
            if (!response.ok) return;

            const data = await response.json();
            templates = data.templates || [];

            const select = document.getElementById('template-select');
            if (!select) return;

            // Group by category
            const byCategory = {};
            templates.forEach(t => {
                if (!byCategory[t.category]) byCategory[t.category] = [];
                byCategory[t.category].push(t);
            });

            // Build optgroups
            for (const [category, items] of Object.entries(byCategory)) {
                const group = document.createElement('optgroup');
                group.label = category.charAt(0).toUpperCase() + category.slice(1);
                items.forEach(t => {
                    const option = document.createElement('option');
                    option.value = t.id;
                    option.textContent = t.name;
                    group.appendChild(option);
                });
                select.appendChild(group);
            }
        } catch (error) {
            console.error('Error loading templates:', error);
        }
    };

    window.applyTemplate = () => {
        const select = document.getElementById('template-select');
        const templateId = select.value;
        if (!templateId) return;

        const template = templates.find(t => t.id === templateId);
        if (!template) return;

        // Pre-fill the create form
        document.getElementById('challenge-title').value = template.title;
        document.getElementById('challenge-description').value = template.description;
        document.getElementById('challenge-type').value = template.type;
        document.getElementById('challenge-target').value = template.target;
        document.getElementById('challenge-reward').value = template.reward;
        document.getElementById('challenge-difficulty').value = template.difficulty;

        // Set category to general
        challengeCategorySelect.value = 'general';
        challengeCategorySelect.dispatchEvent(new Event('change'));

        // Set dates based on template duration
        const start = new Date();
        const end = new Date();
        end.setDate(end.getDate() + template.durationDays);
        startDateInput.value = start.toISOString().split('T')[0];
        endDateInput.value = end.toISOString().split('T')[0];

        showNotification(`Template "${template.name}" applied. Review and submit the form.`, 'info');
    };

    // Handle form submission
    challengeCreateForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(challengeCreateForm);
        const challengeCategory = formData.get('challengeCategory');

        let requestBody;
        let endpoint;

        if (challengeCategory === 'okr') {
            // OKR Challenge
            const labelFiltersText = formData.get('labelFilters');
            const labelFilters = labelFiltersText
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            const okrMetadata = {
                objective: formData.get('objective') || '',
                keyResult: formData.get('keyResult') || '',
                department: formData.get('department') || '',
                quarter: formData.get('quarter') || ''
            };

            requestBody = {
                title: formData.get('title'),
                description: formData.get('description'),
                labelFilters: labelFilters,
                target: parseInt(formData.get('target')),
                reward: parseInt(formData.get('reward')) || 300,
                startDate: formData.get('startDate') || new Date().toISOString(),
                endDate: formData.get('endDate'),
                difficulty: formData.get('difficulty') || 'medium',
                okrMetadata: okrMetadata
            };

            endpoint = '/api/challenges/okr/create';
        } else {
            // General Challenge
            requestBody = {
                title: formData.get('title'),
                description: formData.get('description'),
                type: formData.get('type'),
                target: parseInt(formData.get('target')),
                reward: parseInt(formData.get('reward')) || 300,
                startDate: formData.get('startDate') || new Date().toISOString(),
                endDate: formData.get('endDate'),
                difficulty: formData.get('difficulty') || 'medium'
            };

            endpoint = '/api/challenges/admin/create';
        }

        try {
            const storedToken = getToken();
            if (!storedToken) {
                challengeCreateStatus.innerHTML = '<p class="error">Authentication required. Please log in.</p>';
                return;
            }

            challengeCreateStatus.innerHTML = '<p class="info">Creating challenge...</p>';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${storedToken}`
                },
                body: JSON.stringify(requestBody)
            });

            const result = await response.json();

            if (response.ok) {
                challengeCreateStatus.innerHTML = `
                    <p class="success">
                        ✅ Challenge created successfully!<br>
                        <strong>${result.challenge.title}</strong>
                    </p>
                `;
                challengeCreateForm.reset();
                startDateInput.value = today;
                endDateInput.value = thirtyDaysFromNow.toISOString().split('T')[0];
                challengeCategorySelect.value = 'general';
                challengeCategorySelect.dispatchEvent(new Event('change'));

                setTimeout(() => {
                    loadChallenges();
                    challengeCreateStatus.innerHTML = '';
                }, 3000);
            } else {
                challengeCreateStatus.innerHTML = `<p class="error">❌ Error: ${result.error}</p>`;
            }
        } catch (error) {
            console.error('Error creating challenge:', error);
            challengeCreateStatus.innerHTML = `<p class="error">❌ Error: ${error.message}</p>`;
        }
    });

    // Show notification
    const showNotification = (message, type = 'info') => {
        challengeCreateStatus.innerHTML = `<p class="${type}">${message}</p>`;
        setTimeout(() => {
            challengeCreateStatus.innerHTML = '';
        }, 5000);
    };

    // Check authentication status
    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.isAuthenticated) {
                authStatus.textContent = `Welcome, ${data.username}`;
                adminContent.style.display = 'block';
                unauthorizedContent.style.display = 'none';
                loadChallenges();
                loadTemplates();
            } else {
                adminContent.style.display = 'none';
                unauthorizedContent.style.display = 'block';
            }
        } else {
            adminContent.style.display = 'none';
            unauthorizedContent.style.display = 'block';
        }
    } catch (error) {
        console.error('Error checking authentication status:', error);
        adminContent.style.display = 'none';
        unauthorizedContent.style.display = 'block';
    }
});
