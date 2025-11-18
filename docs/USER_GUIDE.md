# User Guide - Gamification Features

Complete guide to using the Game Ops gamification system.

---

## Table of Contents
- [Getting Started](#getting-started)
- [Leaderboards](#leaderboards)
- [Quarterly Leaderboard System](#quarterly-leaderboard-system)
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

## Quarterly Leaderboard System

The scoreboard tracks contributions across multiple timeframes, allowing you to compete in both all-time and quarterly leaderboards.

### Understanding the Leaderboard Tabs

The leaderboard page has **7 tabs** to view different rankings:

**1-4. Default Views:**
- **PRs** - Ranked by total PR count
- **Reviews** - Ranked by total review count
- **Points** - Ranked by total points earned
- **Streaks** - Ranked by current contribution streak

**5. All-Time Leaderboard:**
- Shows lifetime rankings by total points
- Tracks all contributions since you joined
- Your cumulative stats never reset

**6. This Quarter:**
- Shows current quarter rankings by quarterly points
- Resets at the start of each new quarter
- Fresh competition every 3 months
- Top 3 contributors archived at quarter end

**7. Hall of Fame:**
- Shows past quarterly winners
- Displays top 3 contributors from each quarter
- Historical record of champions
- Celebrates long-term excellence

### How Quarters Work

**Quarter System:**
The system uses configurable quarter calculations (set by admin):
- **Calendar Quarters**: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- **Fiscal Year**: Q1 starts in chosen month (e.g., October for US fiscal year)
- **Academic Year**: Q1 starts in chosen month (e.g., September)
- **Custom**: Any month can be the start of Q1

**Quarter Lifecycle:**
1. **During Quarter**: Your stats accumulate in "This Quarter" leaderboard
2. **Quarter End**: Top 3 contributors are archived to Hall of Fame
3. **Quarter Reset**: Everyone's quarterly stats reset to 0
4. **New Quarter**: Fresh start for all contributors

**What Resets:**
- ✅ Quarterly PR count (resets to 0)
- ✅ Quarterly review count (resets to 0)
- ✅ Quarterly points (resets to 0)
- ❌ All-time totals (NEVER reset)
- ❌ Badges (NEVER reset)
- ❌ Streaks (independent of quarters)

### Viewing All-Time Stats

**Access:** Click the "All-Time" tab on the leaderboard page

**What You See:**
- Rankings by lifetime total points
- Cumulative PR count (all time)
- Cumulative review count (all time)
- Total points earned since joining
- All badges and achievements

**Key Features:**
- Never resets
- Shows your overall contribution history
- Permanent record of all work

### Viewing Quarterly Stats

**Access:** Click the "This Quarter" tab on the leaderboard page

**What You See:**
- Current quarter name (e.g., "2025-Q4")
- Quarter date range (e.g., Oct 1 - Dec 31)
- Quarterly PR count (this quarter only)
- Quarterly review count (this quarter only)
- Quarterly points (this quarter only)
- Your rank for current quarter

**Why It Matters:**
- Fresh competition every quarter
- New contributors can compete equally
- Motivates consistent contribution
- Recognition resets regularly

**Strategy Tips:**
- ⭐ Start strong at beginning of quarter
- ⭐ Consistent contributions beat sprint at end
- ⭐ Track your rank weekly
- ⭐ Top 3 get immortalized in Hall of Fame

### Hall of Fame

**Access:** Click the "Hall of Fame" tab on the leaderboard page

**What You See:**
Each quarter is displayed in a card showing:
- **Quarter name and date range** (e.g., "2025-Q4: Oct 1 - Dec 31")
- **Champion** with crown 👑 (1st place winner)
- **Champion stats**: Points, PRs, Reviews for that quarter
- **Top 3 Podium**: 🥇🥈🥉 with names, avatars, and points
- **Participant count**: Total contributors that quarter

**Example Card:**
```
╔═══════════════════════════════════╗
║          2025-Q4                  ║
║     Oct 1, 2025 - Dec 31, 2025   ║
║                                   ║
║           👑                      ║
║     [Avatar: Username]            ║
║   ⭐ 1660 pts 📝 90 PRs 👀 152   ║
║                                   ║
║         Top 3                     ║
║  🥇 [Avatar] Username - 1660 pts  ║
║  🥈 [Avatar] Username - 1420 pts  ║
║  🥉 [Avatar] Username - 1180 pts  ║
║                                   ║
║     👥 45 contributors            ║
╚═══════════════════════════════════╝
```

**Hall of Fame Features:**
- Historical archive of all past quarters
- Recognition for top performers
- Searchable and sortable
- Shows growth over time
- Celebrates sustained excellence

### Comparing All-Time vs Quarterly

| Feature | All-Time | This Quarter |
|---------|----------|-------------|
| **Resets** | Never | Every quarter (3 months) |
| **Competition** | Long-term excellence | Short-term sprint |
| **For New Users** | Harder to reach top | Fresh start each quarter |
| **Recognition** | Permanent record | Quarterly champions |
| **Best For** | Lifetime achievement | Active competition |

### Quarterly Leaderboard Strategies

**🎯 To Win Quarterly Champion:**
1. **Contribute Early**
   - Build lead at quarter start
   - Don't wait until last week

2. **Stay Consistent**
   - Daily contributions add up
   - Maintain streak for bonus points

3. **Focus on Points**
   - Label PRs correctly (bug, feature)
   - Complete challenges for bonuses
   - Review code for easy points

4. **Track Competition**
   - Check "This Quarter" tab weekly
   - See how close competitors are
   - Adjust effort accordingly

**🏆 To Reach Hall of Fame:**
- Finish in top 3 of any quarter
- Contribute consistently all quarter
- Focus on both PRs and reviews
- Complete weekly challenges

### Quarter Notifications

You'll receive real-time notifications for:
- **Quarter Start**: "New quarter has begun! Quarterly stats reset."
- **Top 3 Position**: "You're in the top 3 for this quarter!"
- **Quarter End Warning**: "Quarter ending in 1 week!"
- **Hall of Fame Entry**: "Congrats! You've been added to the Hall of Fame!"

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

Earned by maintaining **workweek contribution streaks** (Mon-Fri, weekends don't break streaks):

| Badge | Requirement | Icon |
|-------|------------|------|
| **Week Warrior** | 7-day streak | 🔥 |
| **Monthly Master** | 30-day streak | 🌙 |
| **Quarter Champion** | 90-day streak | 👑 |
| **Year-Long Hero** | 365-day streak | 🏅 |

**Note**: Streaks count business days only. Weekend gaps are allowed!

### How Badges Are Awarded

1. Milestone reached automatically
2. You receive a real-time toast notification
3. Badge appears on your profile
4. GitHub comment is posted on your PR (for PR badges)

---

## Streak Tracking

### What is a Streak?

A streak counts consecutive **business days** (Monday-Friday) where you contribute to the repository by either:
- **Merging a Pull Request**, OR
- **Completing a Code Review**

**Key Features:**
- ✅ **Weekends don't break streaks** - Friday → Monday = streak continues!
- ✅ **Reviews count equally** - Both PRs and reviews maintain your streak
- ✅ **Business days only** - Only weekdays (Mon-Fri) are counted
- ❌ **Missing weekdays breaks streak** - Thursday → Tuesday (skipping Friday) = broken

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

**Pull Request Points (by label):**
- **Default PR** (no label): 40 points
- **Bug fix** (`bug` or `fix`): 50 points  
- **Feature** (`feature`): 100 points
- **Enhancement** (`enhancement` or `improve`): 75 points
- **Refactor** (`refactor`): 60 points
- **Hotfix** (`hotfix`): 80 points
- **Documentation** (`doc` or `documentation`): 30 points

**Review Points:**
- **Complete Code Review:** 15 points

**Streak Multipliers:**

Active streaks multiply your PR points! 🔥

| Streak Length | Multiplier | Bonus |
|---------------|-----------|--------|
| 7-29 days | 1.1x | +10% |
| 30-89 days | 1.25x | +25% |
| 90-364 days | 1.5x | +50% |
| 365+ days | 2.0x | +100% (Double!) |

**Note:** Streak multipliers only apply to PR points, not review points.

### Label Priority

If multiple labels are present, points are awarded based on this priority:
1. Hotfix (highest priority - 80 pts)
2. Bug/Fix (50 pts)
3. Feature (100 pts)
4. Enhancement (75 pts)
5. Refactor (60 pts)
6. Documentation (30 pts)
7. Default (no matching label - 40 pts)

### Example Scenarios

**Scenario 1: Regular PR (no label)**
```
Base PR points: 40
Total: 40 points
```

**Scenario 2: Bug Fix PR**
```
Bug fix points: 50
Total: 50 points
```

**Scenario 3: New Feature PR**
```
Feature points: 100
Total: 100 points
```

**Scenario 4: Bug Fix with 30-Day Streak**
```
Bug fix points: 50
Streak multiplier: 1.25x
Total: 63 points (50 × 1.25, rounded)
```

**Scenario 5: Feature with 90-Day Streak**
```
Feature points: 100
Streak multiplier: 1.5x
Total: 150 points (100 × 1.5)
```

**Scenario 6: Code Review**
```
Review points: 15
Total: 15 points (no streak multiplier)
```

**Scenario 7: Complete a Challenge**
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
- `bug` or `fix` for bug fixes (50 pts)
- `feature` for new features (100 pts)
- `enhancement` or `improve` for improvements (75 pts)
- `refactor` for code refactoring (60 pts)
- `hotfix` for critical fixes (80 pts)
- `documentation` for docs (30 pts)

Maintain a streak for multiplier bonuses (up to 2x at 365+ days)!

**Q: Do points expire?**
A: No, points are permanent and cumulative.

**Q: Can I see why I got certain points?**
A: Yes, your profile shows complete points history with reasons and timestamps.

**Q: How do streak multipliers work?**
A: Your current streak multiplies PR points:
- 7+ days: 1.1x (10% bonus)
- 30+ days: 1.25x (25% bonus)
- 90+ days: 1.5x (50% bonus)
- 365+ days: 2.0x (100% bonus - double points!)

Streak bonuses do NOT apply to review points or challenge rewards.

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

### Quarterly Leaderboard

**Q: When do quarters reset?**
A: Automatically at the start of each new quarter based on your organization's quarter configuration. Check the "This Quarter" tab to see the current quarter date range.

**Q: What happens to my all-time stats when quarters reset?**
A: Your all-time stats (total PRs, reviews, points, badges) are NEVER reset. Only the quarterly stats reset.

**Q: How do I get into the Hall of Fame?**
A: Finish in the top 3 of any quarter. The top 3 contributors are automatically archived to the Hall of Fame at the end of each quarter.

**Q: Can I see my stats from previous quarters?**
A: Yes! Visit the Hall of Fame tab to see all past quarterly winners and top 3 contributors. Your all-time stats are always visible on the "All-Time" tab.

**Q: I joined mid-quarter. Can I still compete?**
A: Absolutely! Your quarterly stats start tracking as soon as you contribute. While you may be behind for this quarter, every new quarter is a fresh start.

**Q: Do quarterly stats affect my badges or streaks?**
A: No. Badges and streaks are independent of quarters. Badges are earned based on all-time totals, and streaks track daily consistency regardless of quarter boundaries.

**Q: Which quarter system does my organization use?**
A: Check the "This Quarter" tab header to see the current quarter name and date range. Admins can configure the quarter system (Calendar, Fiscal Year, Academic Year, or Custom).

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
   - Always label PRs appropriately
   - Feature labels give most points (100 pts)
   - Hotfix for urgent fixes (80 pts)
   - Bug fixes are solid (50 pts)

2. **Build and Maintain Streaks**
   - 365+ day streak = double points on PRs!
   - 90+ day streak = 50% bonus
   - Streak multipliers stack with label points
   - Example: Feature (100) × 2.0 = 200 pts!

3. **Complete Challenges**
   - Join multiple challenges each week
   - Big point bonuses (150-500 pts)
   - Stack with regular PR/review points

4. **Review Code Regularly**
   - Easy 15 points per review
   - Helps maintain streaks
   - Consistent contribution

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
