"""Chat domain — `chat` schema. Real conversations/messages, genuinely
new (no chat/conversation/message table of any kind existed anywhere in
this codebase before). Kept to exactly 3 conversation types (DIRECT,
GROUP, TRIP) — no DESTINATION/COMMUNITY/ANNOUNCEMENT, which would need a
new "destination membership" concept with zero real precedent to build
on. See `app/websocket/` for the realtime push layer built alongside
this — every mutation here still happens over REST first; WebSocket only
ever broadcasts what already happened.
"""
