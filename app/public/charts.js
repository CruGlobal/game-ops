document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('fetchButton').addEventListener('click', fetchTopScores);
});

async function fetchTopScores() {
    const range = document.getElementById('range').value;
    const page = 1; // Default page value
    const limit = 10; // Default limit value

    // Fetch top contributors
    const contributorsResponse = await fetch(`/api/top-contributors-date-range?range=${range}&page=${page}&limit=${limit}`);
    const contributorsData = await contributorsResponse.json();

    // Fetch top reviewers
    const reviewersResponse = await fetch(`/api/top-reviewers-date-range?range=${range}&page=${page}&limit=${limit}`);
    const reviewersData = await reviewersResponse.json();

    // Fetch monthly aggregated data with the selected range
    const monthlyAggregatedResponse = await fetch(`/api/monthly-aggregated-data?range=${monthlyRange}`);
    const monthlyAggregatedData = await monthlyAggregatedResponse.json();

    displayResults(contributorsData, reviewersData, monthlyAggregatedData);
}

function displayResults(contributorsData, reviewersData, monthlyAggregatedData) {
    const displayType = document.getElementById('displayType').value;
    const resultsDiv = document.getElementById('top-scores-results');
    resultsDiv.innerHTML = ''; // Clear previous results

    switch (displayType) {
        case 'barChart':
            createBarChart(contributorsData, reviewersData);
            break;
        case 'stackedBarChart':
            createStackedBarChart(contributorsData, reviewersData);
            break;
        case 'dataTable':
            createDataTable(contributorsData, reviewersData);
            break;
        case 'lineChart':
            createLineChart(contributorsData, reviewersData);
            break;
        case 'bubbleChart':
            createBubbleChart(contributorsData, reviewersData);
            break;
        case 'monthlyAggregatedChart':
            createMonthlyAggregatedChart(monthlyAggregatedData);
            break;
        default:
            break;
    }
}

function createBarChart(contributorsData, reviewersData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [...contributorsData.contributors.map(c => c.username),...reviewersData.reviewers.map(r => r.username)],
            datasets: [{
                label: 'Total PRs',
                data: [...contributorsData.contributors.map(c => c.totalPrCount),...Array(reviewersData.reviewers.length).fill(0)],
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }, {
                label: 'Total Reviews',
                data: [...Array(contributorsData.contributors.length).fill(0),...reviewersData.reviewers.map(r => r.totalReviewCount)],
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
    document.getElementById('top-scores-results').appendChild(canvas);
}

function createStackedBarChart(contributorsData, reviewersData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: contributorsData.contributors.map(c => c.username),
            datasets: [{
                label: 'Total PRs',
                data: contributorsData.contributors.map(c => c.totalPrCount),
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }, {
                label: 'Total Reviews',
                data: reviewersData.reviewers.map(r => r.totalReviewCount),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                x: {
                    stacked: true
                },
                y: {
                    beginAtZero: true,
                    stacked: true
                }
            }
        }
    });
    document.getElementById('top-scores-results').appendChild(canvas);
}

function createLineChart(contributorsData, reviewersData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: [...contributorsData.contributors.map(c => c.username),...reviewersData.reviewers.map(r => r.username)],
            datasets: [{
                label: 'Total PRs',
                data: [...contributorsData.contributors.map(c => c.totalPrCount),...Array(reviewersData.reviewers.length).fill(0)],
                fill: false,
                borderColor: 'rgba(54, 162, 235, 1)',
                tension: 0.1
            }, {
                label: 'Total Reviews',
                data: [...Array(contributorsData.contributors.length).fill(0),...reviewersData.reviewers.map(r => r.totalReviewCount)],
                fill: false,
                borderColor: 'rgba(255, 99, 132, 1)',
                tension: 0.1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
    document.getElementById('top-scores-results').appendChild(canvas);
}

function createBubbleChart(contributorsData, reviewersData) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'bubble',
        data: {
            datasets: [{
                label: 'Contributors',
                data: contributorsData.contributors.map(c => ({
                    x: c.totalPrCount,
                    y: 0, // Since we only have one dimension (total PRs)
                    r: c.totalPrCount / 10 // Adjust the divisor to control bubble size
                })),
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }, {
                label: 'Reviewers',
                data: reviewersData.reviewers.map(r => ({
                    x: 0, // Since we only have one dimension (total reviews)
                    y: r.totalReviewCount,
                    r: r.totalReviewCount / 10 // Adjust the divisor to control bubble size
                })),
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                x: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total PRs'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Total Reviews'
                    }
                }
            }
        }
    });
    document.getElementById('top-scores-results').appendChild(canvas);
}

// Function to create data table
function createDataTable(contributorsData, reviewersData) {
    const table = document.createElement('table');

    // Create table header
    const headerRow = table.insertRow();
    headerRow.insertCell().textContent = 'Name';
    headerRow.insertCell().textContent = 'Total PRs';
    headerRow.insertCell().textContent = 'Total Reviews';

    // Add contributor data rows
    contributorsData.contributors.forEach(contributor => {
        const row = table.insertRow();
        row.insertCell().textContent = contributor.username;
        row.insertCell().textContent = contributor.totalPrCount;
        row.insertCell().textContent = 0; // No review data for contributors
    });

    // Add reviewer data rows
    reviewersData.reviewers.forEach(reviewer => {
        const row = table.insertRow();
        row.insertCell().textContent = reviewer.username;
        row.insertCell().textContent = 0; // No PR data for reviewers
        row.insertCell().textContent = reviewer.totalReviewCount;
    });

    document.getElementById('top-scores-results').appendChild(table);
}

function createMonthlyAggregatedChart(data) {
    const ctx = document.getElementById('monthlyAggregatedChart');
    if (ctx) {
        const context = ctx.getContext('2d');
        if (context) {
            new Chart(context, {
                type: 'bar',
                data: {
                    labels: data.labels,
                    datasets: [{
                        label: 'Monthly Aggregated Data',
                        data: data.values,
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        } else {
            console.error('Failed to get 2D context');
        }
    } else {
        console.error('Element with ID "monthlyAggregatedChart" not found');
        }
    }