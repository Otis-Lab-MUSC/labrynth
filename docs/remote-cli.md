# Running a session on a Raspberry Pi from the terminal CLI

One Raspberry Pi (wired to the Arduino) runs the REACHER backend. A controlling
computer runs the Labrynth CLI. The CLI never talks to the Pi directly: it talks
to the controller's **own** backend, which relays to the Pi through
`/api/proxy/<device_id>/...` and holds the Pi's API key server-side.

```
CLI ──► controller backend (localhost:6229) ──► Pi backend (:6229) ──serial──► Arduino
         /api/proxy/<device_id>/...              REACHER_HOST=0.0.0.0
```

Only the controller needs to reach the Pi on TCP 6229. Firmware hex comes from
the controller's reacher install, so the Pi needs no hex files.

## 1. Set up the Pi (once)

```bash
curl -fsSL https://raw.githubusercontent.com/otis-lab-musc/reacher/main/scripts/install.sh | bash
```

This installs reacher with pipx, adds you to `dialout`, installs and enables
`reacher@<user>.service`, and opens 6229 in ufw if ufw is active. Log out and
back in afterwards so the `dialout` membership takes effect.

**Required: bind to the LAN.** The backend listens on `127.0.0.1` by default,
which the controller cannot reach. Uncomment the host line in the unit file:

```bash
sudo systemctl edit reacher@$USER      # add the two lines below
#   [Service]
#   Environment="REACHER_HOST=0.0.0.0"
sudo systemctl restart reacher@$USER
journalctl -u reacher@$USER -f         # shows the rotating 6-digit pairing code
```

Check from the controller: `curl http://<pi-ip>:6229/health` should return JSON.

## 2. Set up the controller (once)

Use either the `LabrynthCLI` bundle (`labrynth-cli-*-<os>.tar.gz` from a release)
or a source install:

```bash
pip install -e ".[cli]"      # also installs reacher, which ships the firmware hex
```

## 3. Pair the Pi

```bash
python -m cli                # or ./LabrynthCLI/LabrynthCLI
```

In the CLI, go to **Machines**. Use one of:

- **Pair `<hostname>`**: appears when mDNS or the subnet scan finds the Pi. Enter the code from the Pi's journal.
- **Pair by URL + Code**: enter `http://<pi-ip>:6229`, then the code.
- **Add Manually (URL + API key)**: enter the key from `~/.reacher/api_key` on the Pi. The input is masked, and the key is stored only by the controller's backend.

Then select the Pi under **Control target**. The header shows the current target.
Next time you can start straight onto it:

```bash
python -m cli --machine <name|hostname|device-id-prefix>
```

## 4. Run a session

1. **Session > Create New Session**: pick the Arduino port on the Pi, then the paradigm.
2. **Session > Upload Firmware** if the board needs it, then **Connect**.
3. **Program**: apply a preset, or set devices, paradigm, and limits by hand.
   Presets are identical to the web UI's. CI fails if they drift
   (`scripts/check-cli-parity.py`).
4. **Program > Start Session**. **Monitor** shows the live feed. Leaving Monitor does
   **not** drop the live link: the CLI holds a background socket for the whole
   session.
5. When the run ends (limit reached, or **Stop**), the CLI exports the ZIP on the
   Pi and copies it to `~/Downloads/reacher/` on the controller. To change the
   local folder, use **Data > Set Local Download Folder**. If the copy fails, the
   ZIP stays on the Pi; retry with **Data > Download Last Export to This Machine**.

## Walking away

- **Detach (leave session running)** quits the CLI without stopping the run.
  **Attach to Existing Session** picks it back up from any CLI on the
  controller, including counters, settings, and events that happened while
  detached.
- **The Pi stops a running session about 10 minutes after its last client
  disconnects** (observed: stopped at about 600 s, destroyed at about 630 s). It
  auto-exports first. A CLI left running on the controller counts as a client.
  A detached CLI, a closed laptop, or a sleeping controller does not. For long
  runs, keep the CLI open and the controller awake, or re-attach within about
  10 minutes.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Pi not listed, `/health` times out | Pi bound to loopback (`REACHER_HOST`), ufw, or a different subnet |
| "Pairing failed: 429" | 5 pairing attempts per minute per IP; wait a minute |
| "Live link down … retrying" | Pi or Wi-Fi blip; the CLI reconnects on its own and back-fills missed events |
| "Session … no longer exists" | The Pi's orphan cleanup ended it (see above), or another client destroyed it |
| Serial disconnected | USB cable or board reset on the Pi; reconnect from **Session** |
