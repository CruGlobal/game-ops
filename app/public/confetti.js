/**
 * Confetti Animation for Achievement Celebrations
 * Lightweight confetti particle system
 */

class Confetti {
    constructor() {
        this.particles = [];
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
    }

    /**
     * Create and setup canvas
     */
    createCanvas() {
        if (this.canvas) return;

        this.canvas = document.createElement('canvas');
        this.canvas.id = 'confetti-canvas';
        this.canvas.style.position = 'fixed';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.zIndex = '9999';

        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Resize canvas to window size
     */
    resizeCanvas() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    /**
     * Create a single confetti particle
     */
    createParticle(x, y) {
        const colors = [
            '#3b82f6', // Blue
            '#10b981', // Green
            '#f59e0b', // Yellow
            '#ef4444', // Red
            '#8b5cf6', // Purple
            '#ec4899', // Pink
            '#14b8a6', // Teal
            '#f97316'  // Orange
        ];

        return {
            x: x || Math.random() * this.canvas.width,
            y: y || -10,
            width: Math.random() * 8 + 5,
            height: Math.random() * 4 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            rotation: Math.random() * 360,
            rotationSpeed: Math.random() * 10 - 5,
            velocityX: Math.random() * 4 - 2,
            velocityY: Math.random() * -8 - 2,
            gravity: 0.3,
            opacity: 1,
            fadeRate: Math.random() * 0.02 + 0.01
        };
    }

    /**
     * Update particle physics
     */
    updateParticle(particle) {
        particle.x += particle.velocityX;
        particle.y += particle.velocityY;
        particle.velocityY += particle.gravity;
        particle.rotation += particle.rotationSpeed;
        particle.opacity -= particle.fadeRate;

        // Apply air resistance
        particle.velocityX *= 0.99;
    }

    /**
     * Draw particle on canvas
     */
    drawParticle(particle) {
        this.ctx.save();
        this.ctx.globalAlpha = particle.opacity;
        this.ctx.translate(particle.x, particle.y);
        this.ctx.rotate((particle.rotation * Math.PI) / 180);
        this.ctx.fillStyle = particle.color;
        this.ctx.fillRect(
            -particle.width / 2,
            -particle.height / 2,
            particle.width,
            particle.height
        );
        this.ctx.restore();
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Update and draw all particles
        this.particles = this.particles.filter(particle => {
            this.updateParticle(particle);
            this.drawParticle(particle);

            // Remove if faded out or off screen
            return particle.opacity > 0 && particle.y < this.canvas.height + 10;
        });

        // Continue animation if particles remain
        if (this.particles.length > 0) {
            this.animationId = requestAnimationFrame(() => this.animate());
        } else {
            this.cleanup();
        }
    }

    /**
     * Launch confetti burst
     */
    burst(options = {}) {
        // Check if achievements/confetti are enabled
        if (window.notificationSettings && !window.notificationSettings.areAchievementsEnabled()) {
            console.log('Confetti burst suppressed (disabled)');
            return;
        }

        const {
            x = this.canvas ? this.canvas.width / 2 : window.innerWidth / 2,
            y = this.canvas ? this.canvas.height / 2 : window.innerHeight / 2,
            count = 50,
            spread = 360
        } = options;

        this.createCanvas();

        // Create particles
        for (let i = 0; i < count; i++) {
            const particle = this.createParticle(x, y);

            // Apply spread angle
            const angle = (spread / count) * i * (Math.PI / 180);
            const velocity = Math.random() * 8 + 4;

            particle.velocityX = Math.cos(angle) * velocity;
            particle.velocityY = Math.sin(angle) * velocity - 8;

            this.particles.push(particle);
        }

        // Start animation if not already running
        if (!this.animationId) {
            this.animate();
        }
    }

    /**
     * Launch confetti from top
     */
    rain(options = {}) {
        // Check if achievements/confetti are enabled
        if (window.notificationSettings && !window.notificationSettings.areAchievementsEnabled()) {
            console.log('Confetti rain suppressed (disabled)');
            return;
        }

        const {
            duration = 3000,
            particlesPerSecond = 20
        } = options;

        this.createCanvas();

        const interval = 1000 / particlesPerSecond;
        let elapsed = 0;

        const rainInterval = setInterval(() => {
            if (!this.canvas) {
                clearInterval(rainInterval);
                return;
            }

            const particle = this.createParticle(
                Math.random() * this.canvas.width,
                -10
            );
            particle.velocityY = Math.random() * 3 + 2;
            particle.velocityX = Math.random() * 2 - 1;

            this.particles.push(particle);

            elapsed += interval;
            if (elapsed >= duration) {
                clearInterval(rainInterval);
            }
        }, interval);

        // Start animation if not already running
        if (!this.animationId) {
            this.animate();
        }
    }

    /**
     * Launch confetti from sides
     */
    cannon(options = {}) {
        // Check if achievements/confetti are enabled
        if (window.notificationSettings && !window.notificationSettings.areAchievementsEnabled()) {
            console.log('Confetti cannon suppressed (disabled)');
            return;
        }

        const {
            side = 'left', // 'left' or 'right'
            count = 30
        } = options;

        this.createCanvas();

        const x = side === 'left' ? 0 : this.canvas.width;
        const y = this.canvas.height;

        for (let i = 0; i < count; i++) {
            const particle = this.createParticle(x, y);

            const angle = side === 'left'
                ? Math.random() * 60 - 30 // -30 to 30 degrees
                : Math.random() * 60 + 150; // 150 to 210 degrees

            const velocity = Math.random() * 12 + 8;

            particle.velocityX = Math.cos((angle * Math.PI) / 180) * velocity;
            particle.velocityY = Math.sin((angle * Math.PI) / 180) * velocity;

            this.particles.push(particle);
        }

        // Start animation if not already running
        if (!this.animationId) {
            this.animate();
        }
    }

    /**
     * Launch full screen celebration
     */
    celebrate() {
        // Check if achievements/confetti are enabled
        if (window.notificationSettings && !window.notificationSettings.areAchievementsEnabled()) {
            console.log('Confetti celebration suppressed (disabled)');
            return;
        }

        // Burst from center
        this.burst({ count: 100 });

        // Cannons from sides with delay
        setTimeout(() => {
            this.cannon({ side: 'left', count: 40 });
            this.cannon({ side: 'right', count: 40 });
        }, 200);

        // Rain from top with delay
        setTimeout(() => {
            this.rain({ duration: 2000, particlesPerSecond: 15 });
        }, 400);
    }

    /**
     * Clean up canvas
     */
    cleanup() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.canvas) {
            this.canvas.remove();
            this.canvas = null;
            this.ctx = null;
        }

        this.particles = [];
    }

    /**
     * Stop all confetti
     */
    stop() {
        this.particles = [];
        this.cleanup();
    }
}

// Create singleton instance
const confetti = new Confetti();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.confetti = confetti;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = confetti;
}
