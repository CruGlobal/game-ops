document.addEventListener('DOMContentLoaded', async () => {
    const badgeList = document.getElementById('badge-list');
    try {
        const response = await fetch('/api/badges');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const badges = await response.json();
        badges.forEach(badge => {
            const badgeItem = document.createElement('div');
            badgeItem.className = 'badge-item';
            badgeItem.innerHTML = `
                <img src="/images/badges/${badge}" alt="${badge}">
                <div>${badge.replace('.png', '').replace('-', ' ')}</div>
            `;
            badgeList.appendChild(badgeItem);
        });
    } catch (error) {
        console.error('Error fetching badges:', error);
    }
});