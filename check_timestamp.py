import datetime

ts_ms = 1763368335535
dt = datetime.datetime.utcfromtimestamp(ts_ms / 1000)
print(dt.isoformat())

