# Runbook: install the edge engine at a restaurant

Who: the installer (vendor staff or a camera-installer partner). Time: 1 to 2 hours plus
calibration. Result: `rv-edge` runs as a service on a PC in the restaurant, is paired with the
restaurant's site in the cloud, and the setup wizard has cameras, tables and zones configured.

Before the visit: the site exists in the dashboard, the DPA is signed and the staff notices are
under way (`docs/compliance/README.md`; in NSW/ACT the 14-day notice must have gone out).

## 1. Choose the PC

| Requirement | Why |
|---|---|
| **Always on** during opening hours (and ideally 24/7) | Alerts stop when the PC sleeps. Disable sleep and hibernation. |
| A **back-office PC, not the POS terminal** | A POS freeze at peak time is worse than any missed alert. The engine runs at low priority and backs off above 70% CPU, but keep it off the till. |
| **Same LAN** as the cameras or NVR, ideally wired Ethernet | RTSP substreams need a stable LAN. The cameras/NVR must be reachable from the PC (same subnet or routed). |
| Windows 10/11 or Linux (Ubuntu 22.04+/Debian 12+), 64-bit | The installers support both. |
| 4+ CPU cores, 8 GB RAM, SSD with 5 GB free | YOLOX-tiny at 5 fps per camera. Rough guide: an Intel N100-class mini PC handles about 6 cameras; `rv-edge check` measures the real number. |
| Python 3.11+ (all users) | Not needed for the Docker appliance. |

No suitable PC: use a mini PC (Intel N100/N150, NVMe, fanless) with the Docker image or the
Linux installer. Avoid Raspberry Pi (SD-card reliability) and Wi-Fi cameras.

Check the cameras before installing anything:

- Find each camera's or NVR channel's **substream** (640x360 to 720p). Set it to 5 fps if
  the camera allows; the engine drops frames to 5 fps anyway.
- Create a **dedicated read-only user** on the NVR or cameras for RTSP. Do not reuse the
  admin password.
- Note which cameras see which tables. Tables no camera sees cannot be measured (see the
  coverage step).

## 2. Network and ports

| Direction | Port | Purpose |
|---|---|---|
| Edge → cloud | TCP 443 (HTTPS) | Events, config, commands. Outbound only; no inbound port from the internet. |
| Edge → cameras / NVR | TCP 554 (RTSP; vendor-specific ports possible) | Video substreams, LAN only |
| Edge → cameras | UDP 3702 multicast (WS-Discovery), TCP 80 (ONVIF) | Camera discovery in the setup wizard (optional) |
| LAN → edge | **TCP 8787** | Setup wizard, waiters' offline alert page, local API. **LAN only**; never forward it from the router. |

Waiter phones reach `http://<edge-ip>:8787/local-alerts` over the staff Wi-Fi when the internet is
down, so the staff Wi-Fi must route to the PC. Keep guest Wi-Fi isolated from it where possible.
Give the PC a fixed IP (DHCP reservation) so the offline link stays valid.

## 3. Install on Windows

In an **elevated PowerShell**, from the `restaurant-vision` folder (release bundle or checkout):

```powershell
# Python 3.11+ for all users first: python.org installer, tick "Install for all users".
powershell -ExecutionPolicy Bypass -File deploy\edge\windows\install.ps1 `
    -Cloud https://cloud.example.com -PairCode ABC123
```

What it does: venv in `C:\Program Files\RestaurantVision\venv`, YOLOX-tiny model (SHA-256
verified), settings in `C:\ProgramData\RestaurantVision\edge.yaml`, data in `...\data`, logs in
`...\logs`, service **RestaurantVisionEdge** (delayed auto-start, restart on failure, BelowNormal
priority, virtual account `NT SERVICE\RestaurantVisionEdge`), ACLs so only SYSTEM,
Administrators and the service can read the data folder, and a firewall rule for TCP 8787 from
the local subnet on Private/Domain networks.

Then:

```powershell
powercfg /change standby-timeout-ac 0      # never sleep on AC power
powercfg /change hibernate-timeout-ac 0
Get-Service RestaurantVisionEdge           # Running
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8787/local/health
```

- Network marked **Public** (common on restaurant Wi-Fi): the firewall rule does not apply.
  Set it to Private (`Set-NetConnectionProfile -InterfaceAlias Ethernet -NetworkCategory
  Private`) or re-run the installer with `-FirewallProfile Any`.
- Upgrade: get the new bundle and run `install.ps1` again (settings and pairing are kept).
- Remove: `deploy\edge\windows\uninstall.ps1` (`-RemoveData` also deletes settings and pairing).
- Service fails to start (Application event log, source RestaurantVisionEdge): check
  `C:\ProgramData\RestaurantVision\logs\rv-edge.log`. If pywin32's service host cannot load the
  venv (error 1053), re-run the installer with `-RunAsLocalSystem`, or register
  `C:\Program Files\RestaurantVision\venv\Scripts\rv-edge.exe run --config
  C:\ProgramData\RestaurantVision\edge.yaml` with a service wrapper such as WinSW or NSSM (same
  recovery and priority settings).

## 4. Install on Linux

```bash
sudo deploy/edge/linux/install.sh --cloud https://cloud.example.com --pair-code ABC123
```

What it does: system user `rv-edge`, venv in `/opt/rv-edge/venv`, model in `/opt/rv-edge/models`,
settings in `/etc/rv-edge/edge.yaml`, data in `/var/lib/rv-edge` (mode 0700), systemd unit
`rv-edge.service` (restart on failure, `Nice=10`, low I/O priority, sandboxed: read-only system,
no home access, no capabilities), then enables and starts it. Re-run to upgrade.

```bash
systemctl status rv-edge
journalctl -u rv-edge -f
curl -s http://127.0.0.1:8787/local/health
sudo ufw allow from 192.168.1.0/24 to any port 8787 proto tcp   # your LAN range, if ufw is on
```

Intel iGPU acceleration (OpenVINO GPU): `sudo systemctl edit rv-edge` and add
`PrivateDevices=no` and `SupplementaryGroups=render video` under `[Service]`.

## 5. Mini PC appliance (Docker)

```bash
docker build -f deploy/docker/edge.Dockerfile -t restaurant-vision/edge .     # from restaurant-vision/
docker run -d --name rv-edge --restart unless-stopped --network host \
  -v rv-edge-data:/var/lib/rv-edge restaurant-vision/edge
docker exec rv-edge rv-edge pair --code ABC123 --cloud https://cloud.example.com
docker restart rv-edge
```

`--network host` lets ONVIF discovery and RTSP reach the cameras and serves 8787 on the LAN.

## 6. Pair with the cloud

1. In the dashboard: **Settings → Devices → Pairing code** for the site. The code is valid for
   10 minutes (`RV_PAIRING_CODE_TTL_S`).
2. Pass it to the installer (`-PairCode` / `--pair-code`), or pair later:
   - Linux: `sudo -u rv-edge /opt/rv-edge/venv/bin/rv-edge pair --config /etc/rv-edge/edge.yaml --code ABC123 --cloud https://cloud.example.com && sudo systemctl restart rv-edge`
   - Windows: `& 'C:\Program Files\RestaurantVision\venv\Scripts\rv-edge.exe' pair --config C:\ProgramData\RestaurantVision\edge.yaml --code ABC123 --cloud https://cloud.example.com; Restart-Service RestaurantVisionEdge`
   - or in the setup wizard's pairing step.
3. The device shows as online in **Settings → Devices** within about a minute (heartbeat).

## 7. Setup wizard

Open `http://<edge-ip>:8787/` from a laptop or tablet on the LAN. **The first visitor chooses
the setup PIN**: do this right after installing, and record the PIN in the site's password
manager entry. Then follow the steps:

1. **Pair** (if not done) and confirm the site name.
2. **Cameras**: ONVIF discovery or manual RTSP URL (substream) with the read-only user.
   Credentials stay in the edge's secrets file and never reach the cloud.
3. **Snapshot**: one frame per camera with every person blurred, to draw on.
4. **Tables**: draw a polygon per table, set its label (as on the floor plan) and seats. One
   camera is the **primary** for each table.
5. **Queue zone and entrance line** at the door; the arrow points into the restaurant.
6. **Staff zone** (kitchen pass, service station) where staff tracks start.
7. **Privacy masks**: restrooms, staff room, changing area, kitchen workstations, the street
   through windows, and any screen that shows personal data. Required by the compliance pack.
8. **Uniform calibration**: one staff member stands in view in uniform.
9. **Coverage check**: tables without a primary zone are listed. Recommend a ceiling camera for
   those, or mark them as not measured.
10. **Live test**: boxes over the blurred snapshot; walk through the room to see tracks.

Capacity: `rv-edge check --config <edge.yaml>` prints how many cameras this PC sustains at
5 fps. If it is below the camera count, drop low-value cameras or move to a stronger PC.

## 8. Hand-over checklist

- [ ] Service running, starts on boot (reboot once to prove it), PC set never to sleep.
- [ ] Device online in the dashboard; live floor shows table states.
- [ ] Setup PIN chosen and stored; RTSP uses the read-only camera user.
- [ ] Privacy masks drawn; screenshot of the coverage page saved for the DPIA (section 8).
- [ ] A waiter phone receives a test alert via push and via `http://<edge-ip>:8787/local-alerts`
      with the internet unplugged.
- [ ] Signs posted; staff briefed (`pilot-checklist.md`).
- [ ] Backup of the data directory scheduled (`operations.md`).
