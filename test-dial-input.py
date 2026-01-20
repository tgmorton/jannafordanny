#!/usr/bin/env python3
"""
Quick script to capture scroll wheel events from the Pico dial.
Run for 30 seconds and print all wheel events.
"""

import time
import sys

try:
    from pynput import mouse
except ImportError:
    print("pynput not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pynput", "-q"])
    from pynput import mouse

events = []
start_time = time.time()
duration = 30  # seconds

def on_scroll(x, y, dx, dy):
    elapsed = time.time() - start_time
    event = {
        'time': round(elapsed, 3),
        'x': x,
        'y': y,
        'dx': dx,
        'dy': dy
    }
    events.append(event)
    direction = "UP" if dy > 0 else "DOWN" if dy < 0 else "HORIZONTAL"
    print(f"[{elapsed:6.2f}s] Scroll {direction}: dx={dx}, dy={dy}")

def on_move(x, y):
    # Ignore mouse moves, just tracking scroll
    pass

print("=" * 50)
print("Dial Input Test - Capturing scroll events")
print("=" * 50)
print(f"Listening for {duration} seconds...")
print("Turn the dial to see events captured.")
print("-" * 50)

listener = mouse.Listener(on_scroll=on_scroll, on_move=on_move)
listener.start()

try:
    while time.time() - start_time < duration:
        remaining = duration - (time.time() - start_time)
        if int(remaining) % 5 == 0 and int(remaining) != duration:
            pass  # Could print countdown but it clutters output
        time.sleep(0.1)
except KeyboardInterrupt:
    print("\nStopped early by user.")

listener.stop()

print("-" * 50)
print(f"\nCapture complete! Total events: {len(events)}")

if events:
    # Analyze the events
    dy_values = [e['dy'] for e in events]
    print(f"\nEvent summary:")
    print(f"  Total scroll events: {len(events)}")
    print(f"  Scroll up events (dy > 0): {sum(1 for d in dy_values if d > 0)}")
    print(f"  Scroll down events (dy < 0): {sum(1 for d in dy_values if d < 0)}")
    print(f"  Unique dy values: {sorted(set(dy_values))}")

    if len(events) > 1:
        intervals = [events[i]['time'] - events[i-1]['time'] for i in range(1, len(events))]
        avg_interval = sum(intervals) / len(intervals)
        print(f"  Average interval between events: {avg_interval*1000:.1f}ms")
else:
    print("\nNo scroll events captured. Make sure the dial is connected and working.")
