# Prototype index

`Guestnote Planner.dc.html`, 3,179 lines. Read **only your slice's range** with `Read offset/limit`.
Markup is lines 1–2135. Logic and sample data start at line 2143 (`class Component`).

| Screen | Slice | Markup | Logic (view model) |
|---|---|---|---|
| Sidebar, app shell (top of the app surface) | F3 | 100–319 | 2728–2860 |
| Wedding settings | S1 | 320–447 | 2773–2790 |
| New wedding | S1 | 448–545 | 2728–2850 |
| Today | S8 | 546–625 | 2900–2918 |
| Wedding overview | S1 | 626–691 | 2963–2976 |
| Checklist | S2 | 692–760 | 2919–2962 |
| Task detail and comments | S2 | 761–941 | 2919–2962 |
| Budget and payments | S4 | 942–1066 | 2977–3009 |
| Vendors | S3 | 1067–1148 | 3010–3034 |
| Run sheet (desktop and phone) | S9 | 1149–1239 | 3035–3056 |
| Files | S5 | 1240–1273 | 3057–3063 |
| Moodboard | S5 | 1274–1315 | 3064–3072 |
| Templates | S7 | 1316–1368 | 3073–3089 |
| Team | S6 | 1369–1427 | 3090–3110 |
| Couple portal (not in spec 0003) | — | 1428–1551 | — |
| Vendor signed-link slice | S10 | 1552–1624 | — |
| Anatomy sheet (design notes) | — | 1625–1771 | — |

Sample data (weddings, tasks, vendors) is in the first ~150 lines after 2143. Copy the shape, not the values.
All strings in the prototype are hard-coded English. Real copy is NL first, in message files.
Where the prototype and the schema disagree, the schema wins (`docs/specs/README.md`).
