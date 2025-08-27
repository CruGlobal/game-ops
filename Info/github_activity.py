import requests
import sys

def update_stats(stats, user, stat_type):
    found = False
    for stat in stats:
        if stat[0] == user:
            if stat_type == "approved":
                stat[1] += 1
            elif stat_type == "commented":
                stat[2] += 1
            elif stat_type == "change":
                stat[3] += 1
            elif stat_type == "dismissed":
                stat[4] += 1
            elif stat_type == "pr":
                stat[5] += 1
            found = True
            break
    if not found:
        if stat_type == "approved":
            stats.append([user, 1, 0, 0, 0, 0])
        elif stat_type == "commented":
            stats.append([user, 0, 1, 0, 0, 0])
        elif stat_type == "change":
            stats.append([user, 0, 0, 1, 0, 0])
        elif stat_type == "dismissed":
            stats.append([user, 0, 0, 0, 1, 0])
        elif stat_type == "pr":
            stats.append([user, 0, 0, 0, 0, 1])

def update_change(blocked, user_raised, user, change_type):
    found = False
    for block in blocked:
        if block[0] == user and block[1] == user_raised:
            if change_type == "change":
                block[2] += 1
            found = True
            break
    if not found:
        if change_type == "change":
            blocked.append([user, user_raised, 1, 0])

def main(repo, token, pr_from, pr_to):
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }

    stats = []
    blocked = []

    for i in range(pr_from, pr_to + 1):
        url = f"https://api.github.com/repos/{repo}/pulls/{i}"
        response = requests.get(url, headers=headers).json()
        update_stats(stats, response['user']['login'], "pr")

        new_url = f"https://api.github.com/repos/{repo}/pulls/{i}/reviews"
        new_response = requests.get(new_url, headers=headers).json()

        for comment in new_response:
            if comment['state'] == "APPROVED":
                update_stats(stats, comment['user']['login'], "approved")
            elif comment['state'] == "COMMENTED":
                update_stats(stats, comment['user']['login'], "commented")
            elif comment['state'] == "CHANGES_REQUESTED":
                update_stats(stats, comment['user']['login'], "change")
                update_change(blocked, response['user']['login'], comment['user']['login'], "change")
            elif comment['state'] == "DISMISSED":
                update_stats(stats, comment['user']['login'], "dismissed")

    print("Name                 PRs   Approved  Commented     Change  Dismissed")
    print("----                 ---   --------  ---------     ------  ---------")
    for stat in sorted(stats, key=lambda x: x[0]):
        print(f"{stat[0]:<20} {stat[5]:<3} {stat[1]:<10} {stat[2]:<10} {stat[3]:<10} {stat[4]:<10}")

    print("\nBlocked by   Raised by       Count")
    print("----------   ---------       -----")
    for block in sorted(blocked, key=lambda x: x[0]):
        print(f"{block[0]:<12} {block[1]:<12} {block[2]:<5}")

if __name__ == "__main__":
    if len(sys.argv) != 5:
        print("Usage: python github_activity.py <repo> <token> <PRfrom> <PRto>")
        sys.exit(1)

    repo = sys.argv[1]
    token = sys.argv[2]
    pr_from = int(sys.argv[3])
    pr_to = int(sys.argv[4])

    main(repo, token, pr_from, pr_to)