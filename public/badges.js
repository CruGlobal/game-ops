// Wait for the DOM to be fully loaded before executing the script
document.addEventListener('DOMContentLoaded', async () => {
    // Get the element where badges will be displayed
    const badgeList = document.getElementById('badge-list');
    try {
        // Fetch the list of badges from the server
        const response = await fetch('/api/badges');
        // Check if the response is not OK (status code is not in the range 200-299)
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        // Parse the JSON response to get the list of badges
        const badges = await response.json();
        // Iterate over each badge and create a corresponding HTML element
        badges.forEach(badge => {
            // Create a div element for the badge
            const badgeItem = document.createElement('div');
            badgeItem.className = 'badge-item'; // Set the class for styling
            // Set the inner HTML of the badge item with the badge image and name
            badgeItem.innerHTML = `
                <img src="/images/badges/${badge}" alt="${badge}">
                <div>${badge.replace('.png', '').replace('-', ' ')}</div>
            `;
            // Append the badge item to the badge list
            badgeList.appendChild(badgeItem);
        });
    } catch (error) {
        // Log any errors that occur during the fetch operation
        console.error('Error fetching badges:', error);
    }
});