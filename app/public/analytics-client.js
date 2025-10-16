(function() {
    'use strict';

    let trendsChart = null;
    let topContributorsChart = null;
    let heatmapChart = null;
    let currentDays = 30;

    // Initialize dashboard on page load
    document.addEventListener('DOMContentLoaded', () => {
        loadAnalytics();

        // Set up time period selector
        document.getElementById('timePeriod').addEventListener('change', (e) => {
            currentDays = parseInt(e.target.value);
            loadAnalytics();
        });

        // Set up refresh button
        document.getElementById('refreshBtn').addEventListener('click', () => {
            loadAnalytics();
            showToast('Analytics refreshed', 'success', 2000);
        });
    });

    // Main function to load all analytics
    async function loadAnalytics() {
        try {
            await Promise.all([
                loadOverview(),
                loadTrends(),
                loadTopContributors(),
                loadChallengeStats(),
                loadHeatmap(),
                loadGrowth()
            ]);
        } catch (error) {
            console.error('Error loading analytics:', error);
            showToast('Failed to load analytics', 'error');
        }
    }

    // Load overview statistics
    async function loadOverview() {
        try {
            const response = await fetch(`/api/analytics/overview?days=${currentDays}`);
            if (!response.ok) {
                throw new Error(`Failed to load overview (HTTP ${response.status})`);
            }
            const data = await response.json();

            // Update stats
            document.getElementById('totalPRs').textContent = data.team.summary.totalPRs.toLocaleString();
            document.getElementById('totalReviews').textContent = data.team.summary.totalReviews.toLocaleString();
            document.getElementById('totalPoints').textContent = data.team.summary.totalPoints.toLocaleString();
            document.getElementById('activeContributors').textContent = data.team.activeContributors.toLocaleString();

            // Update growth indicators
            updateGrowthIndicator('prGrowth', data.growth.weekly.growth);
            updateGrowthIndicator('reviewGrowth', data.growth.weekly.growth);
            updateGrowthIndicator('pointsGrowth', data.growth.monthly.growth);

        } catch (error) {
            console.error('Error loading overview:', error);
            showToast('Failed to load overview data. Please refresh the page.', 'error');
        }
    }

    // Load contribution trends
    async function loadTrends() {
        try {
            const response = await fetch(`/api/analytics/team?days=${currentDays}`);
            if (!response.ok) {
                throw new Error(`Failed to load trends (HTTP ${response.status})`);
            }
            const data = await response.json();

            // Check for empty data
            if (!data.timeSeries || data.timeSeries.length === 0) {
                const chartContainer = document.getElementById('trendsChart').parentElement;
                chartContainer.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--text-secondary);">No contribution data available for this period</p>';
                return;
            }

            const ctx = document.getElementById('trendsChart').getContext('2d');

            if (trendsChart) {
                trendsChart.destroy();
            }

            const labels = data.timeSeries.map(d => d.date);
            const contributions = data.timeSeries.map(d => d.contributions);
            const reviews = data.timeSeries.map(d => d.reviews);
            const points = data.timeSeries.map(d => d.points);

            trendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'PRs Merged',
                            data: contributions,
                            borderColor: 'rgb(78, 115, 223)',
                            backgroundColor: 'rgba(78, 115, 223, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Reviews Completed',
                            data: reviews,
                            borderColor: 'rgb(54, 185, 204)',
                            backgroundColor: 'rgba(54, 185, 204, 0.1)',
                            tension: 0.4,
                            fill: true
                        },
                        {
                            label: 'Points Earned',
                            data: points,
                            borderColor: 'rgb(16, 185, 129)',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            tension: 0.4,
                            fill: true,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-primary').trim()
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            titleColor: '#fff',
                            bodyColor: '#fff'
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            },
                            grid: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--border-color').trim()
                            }
                        },
                        y: {
                            type: 'linear',
                            display: true,
                            position: 'left',
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            },
                            grid: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--border-color').trim()
                            }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error loading trends:', error);
            showToast('Failed to load contribution trends.', 'error');
        }
    }

    // Load top contributors comparison
    async function loadTopContributors() {
        try {
            const response = await fetch('/api/analytics/top-contributors?limit=10');
            if (!response.ok) {
                throw new Error(`Failed to load top contributors (HTTP ${response.status})`);
            }
            const data = await response.json();

            const ctx = document.getElementById('topContributorsChart').getContext('2d');

            if (topContributorsChart) {
                topContributorsChart.destroy();
            }

            const labels = data.contributors.map(c => c.username);
            const prCounts = data.contributors.map(c => c.prCount);
            const reviewCounts = data.contributors.map(c => c.reviewCount);
            const points = data.contributors.map(c => c.totalPoints);

            topContributorsChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'PRs',
                            data: prCounts,
                            backgroundColor: 'rgba(78, 115, 223, 0.8)',
                            borderColor: 'rgb(78, 115, 223)',
                            borderWidth: 1
                        },
                        {
                            label: 'Reviews',
                            data: reviewCounts,
                            backgroundColor: 'rgba(54, 185, 204, 0.8)',
                            borderColor: 'rgb(54, 185, 204)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-primary').trim()
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            callbacks: {
                                footer: (tooltipItems) => {
                                    const index = tooltipItems[0].dataIndex;
                                    return `Total Points: ${points[index].toLocaleString()}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            },
                            grid: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--border-color').trim()
                            }
                        },
                        y: {
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            },
                            grid: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--border-color').trim()
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error loading top contributors:', error);
            showToast('Failed to load top contributors data.', 'error');
        }
    }

    // Load challenge statistics
    async function loadChallengeStats() {
        try {
            const response = await fetch('/api/analytics/challenges');
            if (!response.ok) {
                throw new Error(`Failed to load challenge stats (HTTP ${response.status})`);
            }
            const data = await response.json();

            const container = document.getElementById('challengeStats');
            container.innerHTML = `
                <div class="challenge-stat-item">
                    <div class="challenge-stat-value">${data.totalChallenges}</div>
                    <div class="challenge-stat-label">Total Challenges</div>
                </div>
                <div class="challenge-stat-item">
                    <div class="challenge-stat-value">${data.activeChallenges}</div>
                    <div class="challenge-stat-label">Active Challenges</div>
                </div>
                <div class="challenge-stat-item">
                    <div class="challenge-stat-value">${data.uniqueParticipants}</div>
                    <div class="challenge-stat-label">Unique Participants</div>
                </div>
                <div class="challenge-stat-item">
                    <div class="challenge-stat-value">${data.totalCompletions}</div>
                    <div class="challenge-stat-label">Total Completions</div>
                </div>
                <div class="challenge-stat-item">
                    <div class="challenge-stat-value">${data.completionRate}%</div>
                    <div class="challenge-stat-label">Completion Rate</div>
                </div>
                <div class="challenge-stat-item">
                    <div class="challenge-stat-value">${data.avgParticipantsPerChallenge}</div>
                    <div class="challenge-stat-label">Avg Participants</div>
                </div>
            `;

        } catch (error) {
            console.error('Error loading challenge stats:', error);
            showToast('Failed to load challenge statistics.', 'error');
        }
    }

    // Load activity heatmap
    async function loadHeatmap() {
        try {
            const response = await fetch('/api/analytics/heatmap?days=90');
            if (!response.ok) {
                throw new Error(`Failed to load heatmap (HTTP ${response.status})`);
            }
            const data = await response.json();

            const ctx = document.getElementById('heatmapChart').getContext('2d');

            if (heatmapChart) {
                heatmapChart.destroy();
            }

            // Flatten heatmap data for Chart.js
            const heatmapData = [];
            data.heatmap.forEach((dayRow, dayIndex) => {
                dayRow.forEach((value, hourIndex) => {
                    if (value > 0) {
                        heatmapData.push({
                            x: hourIndex,
                            y: dayIndex,
                            v: value
                        });
                    }
                });
            });

            // Note: Chart.js doesn't have native heatmap support
            // For now, we'll create a simple visualization
            // In production, consider using a library like D3.js or Plotly.js

            const hourlyActivity = data.heatmap[0].map((_, hourIndex) =>
                data.heatmap.reduce((sum, day) => sum + day[hourIndex], 0)
            );

            heatmapChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.hourLabels,
                    datasets: [{
                        label: 'Activity by Hour',
                        data: hourlyActivity,
                        backgroundColor: hourlyActivity.map(val => {
                            const max = Math.max(...hourlyActivity);
                            const intensity = val / max;
                            return `rgba(78, 115, 223, ${intensity * 0.8 + 0.2})`;
                        }),
                        borderColor: 'rgb(78, 115, 223)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Activity Distribution by Hour (UTC)',
                            color: getComputedStyle(document.documentElement)
                                .getPropertyValue('--text-primary').trim()
                        }
                    },
                    scales: {
                        x: {
                            title: {
                                display: true,
                                text: 'Hour of Day',
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-primary').trim()
                            },
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            }
                        },
                        y: {
                            title: {
                                display: true,
                                text: 'Number of Activities',
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-primary').trim()
                            },
                            ticks: {
                                color: getComputedStyle(document.documentElement)
                                    .getPropertyValue('--text-secondary').trim()
                            }
                        }
                    }
                }
            });

        } catch (error) {
            console.error('Error loading heatmap:', error);
            showToast('Failed to load activity heatmap.', 'error');
        }
    }

    // Load growth trends
    async function loadGrowth() {
        try {
            const response = await fetch('/api/analytics/growth');
            if (!response.ok) {
                throw new Error(`Failed to load growth trends (HTTP ${response.status})`);
            }
            const data = await response.json();

            // Weekly growth
            const weeklyHTML = `
                <div class="growth-item">
                    <div class="growth-label">This Week</div>
                    <div class="growth-value">${data.weekly.thisWeek}</div>
                </div>
                <div class="growth-item">
                    <div class="growth-label">Last Week</div>
                    <div class="growth-value">${data.weekly.lastWeek}</div>
                </div>
                <div class="growth-item" style="background: var(--bg-tertiary);">
                    <div class="growth-label">Growth</div>
                    <div class="growth-value" style="color: ${data.weekly.growth >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
                        ${data.weekly.growth >= 0 ? '↑' : '↓'} ${Math.abs(data.weekly.growth).toFixed(1)}%
                    </div>
                </div>
            `;

            // Monthly growth
            const monthlyHTML = `
                <div class="growth-item">
                    <div class="growth-label">This Month</div>
                    <div class="growth-value">${data.monthly.thisMonth}</div>
                </div>
                <div class="growth-item">
                    <div class="growth-label">Last Month</div>
                    <div class="growth-value">${data.monthly.lastMonth}</div>
                </div>
                <div class="growth-item" style="background: var(--bg-tertiary);">
                    <div class="growth-label">Growth</div>
                    <div class="growth-value" style="color: ${data.monthly.growth >= 0 ? 'var(--color-success)' : 'var(--color-danger)'}">
                        ${data.monthly.growth >= 0 ? '↑' : '↓'} ${Math.abs(data.monthly.growth).toFixed(1)}%
                    </div>
                </div>
            `;

            document.getElementById('weeklyGrowthContent').innerHTML = weeklyHTML;
            document.getElementById('monthlyGrowthContent').innerHTML = monthlyHTML;

        } catch (error) {
            console.error('Error loading growth trends:', error);
            showToast('Failed to load growth trends.', 'error');
        }
    }

    // Update growth indicator
    function updateGrowthIndicator(elementId, growth) {
        const element = document.getElementById(elementId);
        const growthValue = parseFloat(growth);

        if (growthValue > 0) {
            element.textContent = `↑ ${growthValue.toFixed(1)}% this week`;
            element.className = 'stat-growth positive';
        } else if (growthValue < 0) {
            element.textContent = `↓ ${Math.abs(growthValue).toFixed(1)}% this week`;
            element.className = 'stat-growth negative';
        } else {
            element.textContent = 'No change this week';
            element.className = 'stat-growth neutral';
        }
    }

    // Export data to CSV
    window.exportData = async function(type) {
        try {
            const response = await fetch(`/api/analytics/export?type=${type}&days=${currentDays}`);

            if (!response.ok) {
                throw new Error(`Export failed (HTTP ${response.status})`);
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `scoreboard-${type}-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showToast(`${type} data exported successfully`, 'success');
        } catch (error) {
            console.error('Error exporting data:', error);
            showToast('Failed to export data. Please try again.', 'error');
        }
    };

})();
