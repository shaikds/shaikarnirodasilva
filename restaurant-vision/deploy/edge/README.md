# Edge packaging

How `rv_edge` gets onto a restaurant PC. Step-by-step install: `docs/runbooks/install-edge.md`.

| Target | Files | Result |
|---|---|---|
| Linux PC (systemd) | `linux/install.sh`, `linux/rv-edge.service` | venv `/opt/rv-edge/venv`, settings `/etc/rv-edge/edge.yaml`, data `/var/lib/rv-edge`, service `rv-edge` (user `rv-edge`, `Nice=10`, sandboxed) |
| Windows PC | `windows/install.ps1`, `windows/rv_edge_service.py`, `windows/uninstall.ps1` | venv `C:\Program Files\RestaurantVision\venv`, settings + data + logs `C:\ProgramData\RestaurantVision`, service `RestaurantVisionEdge` (delayed auto-start, restart on failure, BelowNormal priority, virtual account) |
| Mini PC appliance | `../docker/edge.Dockerfile` | image with rv-edge, rv-sim, YOLOX-tiny and edge-ui; run with `--network host` |
| All | `edge.example.yaml` | commented settings: yolox_tiny, `cpu_limit_pct: 70`, port 8787 |

All installers are idempotent: re-run to upgrade. They install from a `restaurant-vision/`
checkout or release bundle, never overwrite an existing `edge.yaml`, and keep the data
directory (pairing token, camera credentials, outbox). The setup wizard UI is copied from
`web/apps/edge-ui/dist` when it has been built; Node is not needed on the restaurant PC.

## Later: single-file installer (PyInstaller)

The installers above need Python 3.11+ on the PC. The planned next step is one self-contained
installer per OS, so a restaurant PC needs nothing preinstalled:

1. A PyInstaller spec (`deploy/edge/pyinstaller/rv-edge.spec`) in one-folder mode (one-file
   mode unpacks ~200 MB to a temp folder on every start, which is slow and trips antivirus).
   It bundles `rv_edge`, `rv_contracts`, ONNX Runtime and OpenCV native libraries
   (`collect_dynamic_libs`), the edge-ui build and the YOLOX-tiny model as data files, plus a
   hidden-imports list for uvicorn's loop and protocol modules.
2. Windows: run the service through the frozen executable (pywin32 supports frozen services via
   `servicemanager` when `sys.frozen` is set), wrap the folder in an Inno Setup or WiX MSI that
   creates the service, the firewall rule and the ProgramData ACLs (the same steps as
   `install.ps1`), and sign both the executable and the installer (unsigned binaries trigger
   SmartScreen and antivirus quarantines on restaurant PCs).
3. Linux: a `.deb` with the frozen folder in `/opt/rv-edge`, the same systemd unit and a
   `postinst` that creates the user.
4. CI builds the bundles on `windows-latest` and `ubuntu-latest`, smoke-tests
   `rv-edge --version` and `rv-edge check`, and attaches them to a release.

Until then, the model and edge-ui are not frozen into anything: `fetch_models.py` verifies the
model by SHA-256, and updates are a `git pull` (or a new bundle) plus re-running the installer.
