#!/usr/bin/env bash
set -e

# ── Start Xvfb (virtual display for Chromium) ────────────────
echo "[entrypoint] starting Xvfb on :99"
Xvfb :99 -screen 0 1280x800x24 -ac +extension RANDR &
export DISPLAY=:99

# ── Session D-Bus (PulseAudio expects one) ──────────────────
eval "$(dbus-launch --sh-syntax)"
export DBUS_SESSION_BUS_ADDRESS DBUS_SESSION_BUS_PID

# ── Start PulseAudio with a null-sink "virtual_speaker" ──────
# The browser writes audio to virtual_speaker; ffmpeg captures its .monitor
mkdir -p /tmp/pulse /root/.config/pulse
export PULSE_RUNTIME_PATH=/tmp/pulse

echo "[entrypoint] starting PulseAudio"
pulseaudio \
  --exit-idle-time=-1 \
  --disallow-module-loading=false \
  --disable-shm=true \
  --daemonize=false \
  --log-target=stderr \
  --log-level=2 \
  --load="module-null-sink sink_name=virtual_speaker sink_properties=device.description=virtual_speaker" &
PULSE_PID=$!

# Wait for Pulse to be ready
for i in $(seq 1 10); do
  if pactl info >/dev/null 2>&1; then break; fi
  sleep 0.5
done

pactl set-default-sink virtual_speaker || true
pactl list short sinks || true

mkdir -p "$RECORDINGS_DIR"
chmod 777 "$RECORDINGS_DIR"

echo "[entrypoint] handing off to: $@"
exec "$@"
