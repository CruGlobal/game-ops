# User Guide - Gamification Features

Complete guide to using the GitHub PR Scoreboard gamification system.

---

## Table of Contents
- [Getting Started](#getting-started)
- [Leaderboards](#leaderboards)
- [Badges & Achievements](#badges--achievements)
- [Streak Tracking](#streak-tracking)
- [Points System](#points-system)
- [Weekly Challenges](#weekly-challenges)
- [Real-time Notifications](#real-time-notifications)
- [Dark Mode](#dark-mode)
- [FAQ](#faq)

---

## Getting Started

### Accessing the Scoreboard

1. Navigate to your organization's scoreboard URL
2. View the main leaderboard showing top contributors
3. Find your username in the list

### First-Time Setup

No signup required! You'll automatically appear on the scoreboard after:
- Merging your first PR
- Completing your first code review

---

## Leaderboards

### Main Leaderboard

The homepage displays contributors ranked by:
- **PR Count** (default)
- **Review Count**
- **Total Points**
- **Current Streak**

**How to View:**
- Homepage: `http://your-scoreboard.com/`

**What You See:**
- Your rank
- Avatar
- PR count
- Review count
- Badges earned
- Current streak

### Switching Views

Click the tabs at the top to view different leaderboards:
- **PRs** - Ranked by merged pull requests
- **Reviews** - Ranked by code reviews completed
- **Points** - Ranked by total points earned
- **Streaks** - Ranked by current contribution streak

### Your Profile

Click on your username to view detailed stats:
- Total contributions
- Points breakdown
- Streak history
- Badges earned
- Active challenges
- Completed challenges

---

## Badges & Achievements

### PR Badges

Earned by merging pull requests:

| Badge | Requirement | Icon |
|-------|------------|------|
| **1st PR** | Merge 1 PR | 🥉 |
| **10 PRs** | Merge 10 PRs | 🥈 |
| **50 PRs** | Merge 50 PRs | 🥇 |
| **100 PRs** | Merge 100 PRs | 🏆 |
| **500 PRs** | Merge 500 PRs | 🌟 |
| **1000 PRs** | Merge 1000 PRs | 💎 |

### Review Badges

Earned by completing code reviews:

| Badge | Requirement | Icon |
|-------|------------|------|
| **1st Review** | Complete 1 review | 👀 |
| **10 Reviews** | Complete 10 reviews | 🔍 |
| **50 Reviews** | Complete 50 reviews | 🎯 |
| **100 Reviews** | Complete 100 reviews | 🛡️ |
| **500 Reviews** | Complete 500 reviews | ⚡ |
| **1000 Reviews** | Complete 1000 reviews | 🚀 |

### Streak Badges

Earned by maintaining daily contribution streaks:

| Badge | Requirement | Icon |
|-------|------------|------|
| **Week Warrior** | 7-day streak | 🔥 |
| **Monthly Master** | 30-day streak | 🌙 |
| **Quarter Champion** | 90-day streak | 👑 |
| **Year-Long Hero** | 365-day streak | 🏅 |

### How Badges Are Awarded

1. Milestone reached automatically
2. You receive a real-time toast notification
3. Badge appears on your profile
4. GitHub comment is posted on your PR (for PR badges)

---

## Streak Tracking

### What is a Streak?

A streak counts consecutive days you contribute to the repository (either by merging PRs or completing reviews).

### How Streaks Work

**Starting a Streak:**
- Merge a PR or complete a review
- Your streak starts at 1 day

**Continuing a Streak:**
- Contribute at least once per day
- Streak increments by 1
- Time zone: UTC (00:00 - 23:59)

**Breaking a Streak:**
- Miss a full day without contributing
- Streak resets to 0
- Longest streak is preserved

### Viewing Your Streak

**On Homepage:**
- Look for 🔥 icon next to your name
- Shows current streak number

**On Profile Page:**
- Current streak
- Longest streak ever achieved
- Last contribution date
- Streak badges earned

### Streak Tips

✅ **Best Practices:**
- Set daily reminders
- Review PRs if you can't merge one
- Check your streak before end of day (UTC)
- Use streak calendar to track progress

❌ **Common Mistakes:**
- Forgetting time zone differences
- Only contributing on workdays
- Not checking if contribution counted

---

## Points System

### How Points Are Earned

**Base Points:**
- **Merge PR:** 10 points
- **Complete Review:** 5 points

**Label Bonuses:**
Add labels to your PRs for bonus points:

| Label | Bonus | Total Points |
|-------|-------|-------------|
| `bug` or `fix` | +5 | 15 points |
| `feature` or `enhancement` | +10 | 20 points |
| `documentation` | +0 | 10 points |

### Example Scenarios

**Scenario 1: Bug Fix PR**
```
Base PR points: 10
Bug fix bonus: +5
Total: 15 points
```

**Scenario 2: New Feature PR**
```
Base PR points: 10
Feature bonus: +10
Total: 20 points
```

**Scenario 3: Code Review**
```
Review points: 5
Total: 5 points
```

**Scenario 4: Complete a Challenge**
```
Challenge reward: 250
Total: 250 points (added to overall total)
```

### Viewing Your Points

**Homepage:**
- Total points displayed next to your name

**Profile Page:**
- Total points
- Points breakdown by category
- Points history with timestamps
- Point events (PR merged, challenge completed)

### Points Leaderboard

Navigate to the **Points** tab to see:
- Top point earners
- Your rank
- Point gaps between ranks

---

## Weekly Challenges

### What Are Challenges?

Challenges are week-long competitions with specific goals and rewards.

**Generated:** Every Monday at 00:00 UTC
**Duration:** 7 days
**Number:** 3 new challenges per week

### Challenge Types

**1. Sprint Master (PR Challenge)**
- **Goal:** Merge X PRs during the week
- **Target:** 3-10 PRs depending on difficulty
- **Reward:** 150-300 points

**2. Review Champion (Review Challenge)**
- **Goal:** Complete X code reviews
- **Target:** 5-15 reviews depending on difficulty
- **Reward:** 150-250 points

**3. Streak Builder (Streak Challenge)**
- **Goal:** Maintain a 7-day streak
- **Target:** 7 consecutive days
- **Reward:** 300 points

**4. Point Hunter (Points Challenge)**
- **Goal:** Earn X points during the week
- **Target:** 300-1000 points depending on difficulty
- **Reward:** 100-200 points

### Difficulty Levels

| Difficulty | Target Range | Reward Range |
|-----------|-------------|--------------|
| **Easy** | Low targets | 100-150 pts |
| **Medium** | Moderate targets | 200-250 pts |
| **Hard** | High targets | 300-500 pts |

### How to Participate

**Step 1: View Challenges**
- Navigate to `/challenges` page
- Browse active weekly challenges
- See difficulty, target, and reward

**Step 2: Join a Challenge**
- Click "Join Challenge" button
- Confirm participation
- Challenge appears in "My Challenges"

**Step 3: Track Progress**
- View real-time progress bar
- Check percentage complete
- See your rank on challenge leaderboard

**Step 4: Complete Challenge**
- Reach the target before deadline
- Receive automatic notification
- Points added to your total
- Challenge moves to "Completed"

### Challenge Rules

✅ **You Can:**
- Join multiple challenges simultaneously
- Leave a challenge before completion
- View challenge leaderboards
- Track progress in real-time

❌ **You Cannot:**
- Join after challenge has started (must join within first day)
- Rejoin a challenge you left
- Earn rewards for partial completion

### Challenge Strategies

**🎯 For Beginners:**
- Start with Easy difficulty
- Join 1-2 challenges at a time
- Focus on Review Champion (easier to control)

**🚀 For Advanced Users:**
- Join all 3 challenges
- Focus on Hard difficulty
- Stack challenges that complement each other

**💡 Pro Tips:**
- Join challenges on Monday morning
- Check progress daily
- Use points challenges to double-dip (earn challenge reward while completing others)

---

## Real-time Notifications

### Toast Notifications

You receive instant notifications for:

**Success Notifications (Green)** 🟢
- PR merged successfully
- Review completed
- Settings saved

**Achievement Notifications (Gold Gradient)** 🏆
- Badge awarded
- Challenge completed
- Streak milestone reached

**Info Notifications (Blue)** 🔵
- Challenge progress updated
- Leaderboard position changed
- New challenges available

**Warning Notifications (Orange)** 🟠
- Streak at risk (23+ hours since last contribution)
- Challenge ending soon

**Error Notifications (Red)** 🔴
- Failed to join challenge
- Connection error
- Action failed

### Notification Settings

Notifications appear automatically:
- **Duration:** 3-5 seconds (auto-dismiss)
- **Position:** Top-right corner
- **Stacking:** Multiple notifications stack vertically
- **Dismissible:** Click X to close immediately

### Live Updates

The page updates automatically when:
- New PR is merged (your leaderboard position updates)
- Someone earns a badge (leaderboard refreshes)
- Challenge progress changes (progress bar updates)
- Streak continues/breaks (streak count updates)

**No page refresh needed!** 🎉

---

## Dark Mode

### Enabling Dark Mode

**Method 1: Toggle Button**
- Look for 🌙 button (floating, bottom-right)
- Click to toggle dark mode
- Icon changes to ☀️ in dark mode

**Method 2: System Preference**
- App automatically detects OS theme
- Follows system dark mode setting
- Override with toggle button

### Theme Persistence

Your preference is saved:
- Stored in browser localStorage
- Persists across sessions
- Applies to all pages

### Dark Mode Features

**What Changes:**
- Background colors (dark grays/blacks)
- Text colors (light grays/whites)
- Card backgrounds
- Button colors
- Toast notifications
- Chart colors

**What Stays the Same:**
- Layout and structure
- Animations
- Functionality
- Avatar images

---

## FAQ

### General Questions

**Q: How often is the leaderboard updated?**
A: Real-time! Updates happen instantly via WebSocket connections.

**Q: Can I see historical data?**
A: Yes, your profile page shows points history, streak history, and completed challenges.

**Q: Are there any costs?**
A: No, the scoreboard is completely free for all team members.

**Q: Can I opt out?**
A: No, but you can choose not to participate in challenges. Your PR/review contributions will still be tracked.

---

### Badges & Achievements

**Q: Why didn't I receive a badge?**
A: Check these common issues:
- Badge was already awarded previously
- Milestone not yet reached
- Bot PRs don't count
- System processing delay (wait 5 minutes)

**Q: Can I lose badges?**
A: No, badges are permanent once earned.

**Q: Do bot PRs count toward badges?**
A: No, contributions from bots (dependabot, github-actions, etc.) are excluded.

---

### Streaks

**Q: What time zone is used for streaks?**
A: UTC (Coordinated Universal Time). Contributions count for the calendar day in UTC.

**Q: I contributed but my streak broke?**
A: Possible reasons:
- Contribution was on same day as previous (doesn't extend streak)
- More than 24 hours passed between contributions (UTC time)
- Contribution type didn't count (bot PR, draft PR)

**Q: Can I recover a broken streak?**
A: No, streaks reset when broken. Your longest streak is preserved for historical records.

**Q: Do weekends count?**
A: Yes! Streaks require daily contributions, including weekends.

---

### Points

**Q: How do I get bonus points?**
A: Add appropriate labels to your PRs:
- `bug` or `fix` for bug fixes (+5 pts)
- `feature` or `enhancement` for new features (+10 pts)

**Q: Do points expire?**
A: No, points are permanent and cumulative.

**Q: Can I see why I got certain points?**
A: Yes, your profile shows complete points history with reasons and timestamps.

---

### Challenges

**Q: When do new challenges appear?**
A: Every Monday at 00:00 UTC, 3 new challenges are generated.

**Q: Can I join a challenge after it starts?**
A: Yes, but progress from before you joined doesn't count.

**Q: What happens if I don't complete a challenge?**
A: Nothing negative. The challenge simply moves to expired status and you don't receive the reward.

**Q: Can I complete the same challenge multiple times?**
A: No, each challenge is unique. New challenges are generated weekly.

**Q: How are challenge participants ranked?**
A: By progress toward the target. Ties are broken by join time (earlier = higher rank).

---

### Technical

**Q: The page isn't updating in real-time. What's wrong?**
A: Possible issues:
- WebSocket connection lost (check browser console)
- Firewall blocking WebSocket connections
- Browser doesn't support WebSockets (update browser)
- Refresh the page to reconnect

**Q: I see "Connection lost" message. What do I do?**
A: The app will automatically reconnect. If it doesn't:
1. Check your internet connection
2. Refresh the page
3. Clear browser cache
4. Contact admin if issue persists

**Q: Dark mode isn't working?**
A: Try:
- Hard refresh (Ctrl+F5 or Cmd+Shift+R)
- Clear browser cache
- Check if JavaScript is enabled
- Try different browser

---

## Tips & Best Practices

### 🎯 Maximizing Your Points

1. **Use Labels Strategically**
   - Always label bug fixes and features
   - Adds up quickly over time

2. **Complete Challenges**
   - Join multiple challenges each week
   - Big point bonuses

3. **Maintain Streaks**
   - Consistency beats intensity
   - Daily small contributions

4. **Review Code**
   - Easy way to contribute daily
   - Helps maintain streaks

### 🔥 Maintaining Streaks

1. **Set Daily Reminders**
   - Calendar reminder at 8pm UTC
   - "Did I contribute today?"

2. **Have Backup Plans**
   - Review PRs if you can't merge
   - Keep list of small tasks

3. **Track Your Progress**
   - Check streak daily
   - Know your longest streak

### 🏆 Winning Challenges

1. **Start Early**
   - Join on Monday
   - More time to complete

2. **Choose Wisely**
   - Match difficulty to your capacity
   - Don't overcommit

3. **Track Progress**
   - Check dashboard daily
   - Adjust effort as needed

4. **Stack Challenges**
   - PRs count for multiple challenges
   - Maximize efficiency

---

## Getting Help

### Support Channels

**For Technical Issues:**
- Check [Troubleshooting Guide](./DEPLOYMENT.md#troubleshooting)
- Open GitHub issue
- Contact system administrator

**For Feature Requests:**
- Open GitHub discussion
- Submit feature request issue

**For Questions:**
- Check this FAQ
- Ask in team chat
- Contact maintainer

---

## Keyboard Shortcuts

- `d` - Toggle dark mode
- `h` - Go to homepage
- `c` - Go to challenges page
- `?` - Show help overlay

---

**Happy Contributing! 🚀**

Last Updated: October 2025
