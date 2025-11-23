import json

with open('userChats.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

counts = {}
user_chats = data.get('userChats', [])
print(f"userChats length: {len(user_chats)}")
for chat in data.get('userChats', []):
    for tag in chat.get('tags', []):
        t = tag.strip()
        if not t:
            continue
        counts[t] = counts.get(t, 0) + 1

print(f"unique tags: {len(counts)}")
for tag, count in sorted(counts.items()):
    print(tag, count)

