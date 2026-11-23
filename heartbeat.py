#!/usr/bin/env python3
"""Reports the REAL Minecraft backend status to the website. Run on the machine that runs the Minecraft server.
MC_HOST must be the BACKEND address (e.g. 127.0.0.1), NEVER the public Minekube domain: pinging that could wake the server."""
import json, os, socket, struct, time, urllib.request
SITE = os.environ.get("SITE_URL", "http://localhost:3000").rstrip("/")
TOKEN = os.environ["HEARTBEAT_TOKEN"]
HOST = os.environ.get("MC_HOST", "127.0.0.1")
PORT = int(os.environ.get("MC_PORT", "25565"))
def vi(n):
    out = b""
    while True:
        b = n & 0x7F; n >>= 7
        out += bytes([b | (0x80 if n else 0)])
        if not n: return out
def rd(s, n):
    d = b""
    while len(d) < n:
        c = s.recv(n - len(d))
        if not c: raise IOError("closed")
        d += c
    return d
def rvi(s):
    n = 0
    for i in range(5):
        b = rd(s, 1)[0]; n |= (b & 0x7F) << (7 * i)
        if not b & 0x80: return n
    raise IOError("bad varint")
def ping():
    s = socket.create_connection((HOST, PORT), timeout=5)
    try:
        h = HOST.encode()
        hs = b"\x00" + vi(765) + vi(len(h)) + h + struct.pack(">H", PORT) + vi(1)
        s.sendall(vi(len(hs)) + hs + b"\x01\x00")
        rvi(s)
        if rvi(s) != 0: raise IOError("bad packet")
        return json.loads(rd(s, rvi(s)).decode())
    finally:
        s.close()
def report(p):
    r = urllib.request.Request(SITE + "/api/heartbeat", json.dumps(p).encode(),
        {"Content-Type": "application/json", "Authorization": "Bearer " + TOKEN})
    urllib.request.urlopen(r, timeout=10).read()
while True:
    try:
        d = ping()
        payload = {"state": "online", "players": d["players"]["online"], "max": d["players"]["max"],
                   "version": str(d.get("version", {}).get("name", ""))[:40]}
    except Exception:
        payload = {"state": "offline"}
    try: report(payload)
    except Exception as e: print("report failed:", e)
    time.sleep(10)
