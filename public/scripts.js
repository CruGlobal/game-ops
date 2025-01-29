document.addEventListener('DOMContentLoaded', () => {
    const images = document.querySelectorAll('.profile-picture');
    images.forEach(img => {
        img.addEventListener('error', () => {
            setDefaultImage(img);
        });
    });
});

function setDefaultImage(img) {
    img.onerror = null; // Prevent infinite loop if the default image also fails
    img.src = 'default-image.png'; // Set the path to your default image
}

async function fetchTopContributors() {
    try {
        const response = await fetch('/top-contributors');
        const contributors = await response.json();
        const list = document.getElementById('top-contributors');
        contributors.forEach(contributor => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <img src="${contributor.avatarUrl}" alt="${contributor.username}" width="50" height="50" class="profile-picture">
                <div class="details">
                    <span class="name">${contributor.username}</span>
                    <span class="total">PRs: ${contributor.prCount}</span>
                </div>
            `;
            list.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error fetching top contributors:', error);
    }
}

async function fetchTopReviewers() {
    try {
        const response = await fetch('/top-reviewers');
        const reviewers = await response.json();
        const list = document.getElementById('top-reviewers');
        reviewers.forEach(reviewer => {
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <img src="${reviewer.avatarUrl}" alt="${reviewer.username}" width="50" height="50" class="profile-picture">
                <div class="details">
                    <span class="name">${reviewer.username}</span>
                    <span class="total">Reviews: ${reviewer.reviewCount}</span>
                </div>
            `;
            list.appendChild(listItem);
        });
    } catch (error) {
        console.error('Error fetching top reviewers:', error);
    }
}

try {
    localStorage.setItem('key', 'value');
} catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') {
        console.error('Access to storage is not allowed from this context.');
    } else {
        console.error('An unexpected error occurred:', error);
    }
}

fetchTopContributors();
fetchTopReviewers();