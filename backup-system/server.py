#!/usr/bin/env python3
"""
server.py - Python HTTP API server for Universal Backup System
Single Responsibility: serves frontend files and bridges API calls to Bash scripts
Uses only Python stdlib (http.server, json, subprocess, os) - zero pip dependencies.
"""

import http.server
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# ──────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────

BASE_DIR = Path(__file__).parent.resolve()
PROJECTS_DIR = BASE_DIR / "projects"
FRONTEND_DIR = BASE_DIR / "frontend"
CONFIG_EXAMPLE = BASE_DIR / "config" / "backup.yaml.example"
DEFAULT_PORT = 8080

# Valid project name pattern (security: prevent path traversal)
PROJECT_NAME_RE = re.compile(r'^[a-zA-Z0-9_-]+$')
MAX_PROJECT_NAME_LEN = 64


# ──────────────────────────────────────────────
# Project Manager (Single Responsibility: CRUD on projects)
# ──────────────────────────────────────────────

class ProjectManager:
    """Manages project directories and configs."""

    def __init__(self, projects_dir: Path):
        self.projects_dir = projects_dir
        self.projects_dir.mkdir(parents=True, exist_ok=True)

    def validate_name(self, name: str) -> str | None:
        """Returns error message if invalid, None if valid."""
        if not name:
            return "Project name is required"
        if len(name) > MAX_PROJECT_NAME_LEN:
            return f"Project name too long (max {MAX_PROJECT_NAME_LEN} chars)"
        if not PROJECT_NAME_RE.match(name):
            return "Invalid name. Only alphanumeric, hyphens, underscores allowed"
        if ".." in name or "/" in name:
            return "Invalid characters in project name"
        return None

    def list_projects(self) -> list[dict]:
        """List all projects with their status."""
        projects = []
        if not self.projects_dir.exists():
            return projects

        for entry in sorted(self.projects_dir.iterdir()):
            if entry.is_dir() and PROJECT_NAME_RE.match(entry.name):
                projects.append(self._get_project_info(entry.name))
        return projects

    def get_project(self, name: str) -> dict | None:
        """Get project details."""
        project_dir = self.projects_dir / name
        if not project_dir.is_dir():
            return None
        return self._get_project_info(name)

    def create_project(self, name: str, config: dict) -> dict:
        """Create a new project directory with config."""
        project_dir = self.projects_dir / name
        project_dir.mkdir(parents=True, exist_ok=False)
        (project_dir / "logs").mkdir(exist_ok=True)

        # Write config (merge with defaults from example)
        config_path = project_dir / "backup.yaml"
        self._write_config(config_path, config)

        return self._get_project_info(name)

    def update_project(self, name: str, config: dict) -> dict:
        """Update project config."""
        project_dir = self.projects_dir / name
        if not project_dir.is_dir():
            raise FileNotFoundError(f"Project not found: {name}")

        config_path = project_dir / "backup.yaml"
        self._write_config(config_path, config)
        return self._get_project_info(name)

    def delete_project(self, name: str) -> None:
        """Delete project and all its data."""
        project_dir = self.projects_dir / name
        if not project_dir.is_dir():
            raise FileNotFoundError(f"Project not found: {name}")

        # Check if backup is running
        status = self._read_status(name)
        if status.get("status") == "running":
            pid = status.get("pid")
            if pid and self._is_process_running(int(pid)):
                raise RuntimeError(f"Backup is running (PID: {pid}). Stop it first.")

        shutil.rmtree(project_dir)

    def run_backup(self, name: str, dry_run: bool = False) -> dict:
        """Trigger backup for a project (async)."""
        project_dir = self.projects_dir / name
        config_path = project_dir / "backup.yaml"
        log_path = project_dir / "logs" / "backup.log"
        status_path = project_dir / ".status"
        lock_path = project_dir / ".lock"

        if not config_path.exists():
            raise FileNotFoundError(f"Config not found for project: {name}")

        # Check lock
        if lock_path.exists():
            try:
                pid = int(lock_path.read_text().strip())
                if self._is_process_running(pid):
                    return {"status": "already_running", "pid": pid}
            except (ValueError, OSError):
                pass
            lock_path.unlink(missing_ok=True)

        # Build command
        cmd = [str(BASE_DIR / "backup.sh"), "--config", str(config_path)]
        if dry_run:
            cmd.append("--dry-run")

        # Run in background
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_file = open(log_path, "a")

        proc = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=str(BASE_DIR),
            env={**os.environ, "LOG_FILE": str(log_path)},
        )

        # Write lock and status
        lock_path.write_text(str(proc.pid))
        self._write_status(name, "running", proc.pid)

        # Monitor in background thread
        thread = threading.Thread(
            target=self._monitor_backup,
            args=(name, proc, lock_path, log_file),
            daemon=True,
        )
        thread.start()

        return {"status": "started", "pid": proc.pid}

    def get_status(self, name: str) -> dict:
        """Get backup status for a project."""
        return self._read_status(name)

    def get_logs(self, name: str, lines: int = 100) -> str:
        """Get last N lines of project log."""
        log_path = self.projects_dir / name / "logs" / "backup.log"
        if not log_path.exists():
            return ""

        with open(log_path, "r") as f:
            all_lines = f.readlines()
            return "".join(all_lines[-lines:])

    def run_detection(self, name: str) -> list[str]:
        """Run service detection for a project."""
        config_path = self.projects_dir / name / "backup.yaml"
        cmd = [str(BASE_DIR / "backup.sh"), "--config", str(config_path), "--detect"]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=30, cwd=str(BASE_DIR)
            )
            services = [
                line.strip() for line in result.stdout.splitlines()
                if line.strip() and not line.startswith("[")
            ]
            return services
        except subprocess.TimeoutExpired:
            return []

    def get_snapshots(self, name: str) -> list[dict]:
        """Get Restic snapshots for a project."""
        config_path = self.projects_dir / name / "backup.yaml"
        cmd = [
            str(BASE_DIR / "backup.sh"),
            "--config", str(config_path),
            "--status",
        ]

        try:
            result = subprocess.run(
                cmd, capture_output=True, text=True, timeout=30,
                cwd=str(BASE_DIR),
                env={**os.environ, "CONFIG_FILE": str(config_path)},
            )
            return json.loads(result.stdout) if result.stdout.strip() else []
        except (subprocess.TimeoutExpired, json.JSONDecodeError):
            return []

    # ── Private helpers ──

    def _get_project_info(self, name: str) -> dict:
        project_dir = self.projects_dir / name
        config_path = project_dir / "backup.yaml"
        status = self._read_status(name)

        has_config = config_path.exists()
        config_content = ""
        if has_config:
            config_content = config_path.read_text()

        return {
            "name": name,
            "has_config": has_config,
            "config": config_content,
            "status": status.get("status", "never_run"),
            "last_run": status.get("timestamp", ""),
            "errors": int(status.get("errors", 0)),
            "successes": int(status.get("successes", 0)),
        }

    def _read_status(self, name: str) -> dict:
        status_path = self.projects_dir / name / ".status"
        if not status_path.exists():
            return {"status": "never_run"}

        status = {}
        for line in status_path.read_text().strip().splitlines():
            if "=" in line:
                key, val = line.split("=", 1)
                status[key.strip()] = val.strip()

        # Check if "running" process is still alive
        if status.get("status") == "running":
            pid = status.get("pid")
            if pid and not self._is_process_running(int(pid)):
                status["status"] = "failed"
                self._write_status(name, "failed")

        return status

    def _write_status(self, name: str, status: str, pid: int = 0):
        from datetime import datetime
        status_path = self.projects_dir / name / ".status"
        status_path.write_text(
            f"status={status}\npid={pid}\ntimestamp={datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
        )

    def _write_config(self, config_path: Path, config: dict | str):
        if isinstance(config, str):
            config_path.write_text(config)
        elif isinstance(config, dict):
            # Simple YAML serialization (good enough for our config structure)
            import yaml_writer
            yaml_writer.write(config_path, config)
        else:
            # If config is raw YAML text
            config_path.write_text(str(config))

    def _monitor_backup(self, name: str, proc, lock_path: Path, log_file):
        """Monitor backup process and update status on completion."""
        proc.wait()
        lock_path.unlink(missing_ok=True)
        log_file.close()

        status = "success" if proc.returncode == 0 else "failed"
        self._write_status(name, status, proc.pid)

    @staticmethod
    def _is_process_running(pid: int) -> bool:
        try:
            os.kill(pid, 0)
            return True
        except (OSError, ProcessLookupError):
            return False


# ──────────────────────────────────────────────
# Simple YAML writer (avoid external dependency)
# ──────────────────────────────────────────────

class yaml_writer:
    """Minimal YAML writer for config files. No external deps."""

    @staticmethod
    def write(path: Path, data: dict):
        """Write dict as YAML to file."""
        lines = yaml_writer._dict_to_yaml(data, indent=0)
        path.write_text("\n".join(lines) + "\n")

    @staticmethod
    def _dict_to_yaml(data, indent=0) -> list[str]:
        lines = []
        prefix = "  " * indent
        for key, value in data.items():
            if isinstance(value, dict):
                lines.append(f"{prefix}{key}:")
                lines.extend(yaml_writer._dict_to_yaml(value, indent + 1))
            elif isinstance(value, list):
                lines.append(f"{prefix}{key}:")
                for item in value:
                    if isinstance(item, dict):
                        lines.append(f"{prefix}  -")
                        lines.extend(yaml_writer._dict_to_yaml(item, indent + 2))
                    else:
                        lines.append(f"{prefix}  - {yaml_writer._format_value(item)}")
            else:
                lines.append(f"{prefix}{key}: {yaml_writer._format_value(value)}")
        return lines

    @staticmethod
    def _format_value(value) -> str:
        if value is None:
            return '""'
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        s = str(value)
        if not s or " " in s or ":" in s or "#" in s:
            return f'"{s}"'
        return s


# ──────────────────────────────────────────────
# HTTP Request Handler
# ──────────────────────────────────────────────

class BackupAPIHandler(http.server.BaseHTTPRequestHandler):
    """HTTP request handler with REST API routing."""

    manager = ProjectManager(PROJECTS_DIR)

    # Content type mapping for static files
    MIME_TYPES = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
    }

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/"):
            self._handle_api_get(path, parse_qs(parsed.query))
        else:
            self._serve_static(path)

    def do_POST(self):
        self._handle_api_post(self.path)

    def do_PUT(self):
        self._handle_api_put(self.path)

    def do_DELETE(self):
        self._handle_api_delete(self.path)

    def do_OPTIONS(self):
        self._send_cors_headers()
        self.send_response(204)
        self.end_headers()

    # ── API GET routes ──

    def _handle_api_get(self, path: str, query: dict):
        # GET /api/projects
        if path == "/api/projects":
            self._json_response(self.manager.list_projects())
            return

        # GET /api/projects/<name>
        match = re.match(r'^/api/projects/([^/]+)$', path)
        if match:
            name = match.group(1)
            project = self.manager.get_project(name)
            if project:
                self._json_response(project)
            else:
                self._error_response(404, "Project not found")
            return

        # GET /api/projects/<name>/status
        match = re.match(r'^/api/projects/([^/]+)/status$', path)
        if match:
            name = match.group(1)
            self._json_response(self.manager.get_status(name))
            return

        # GET /api/projects/<name>/logs
        match = re.match(r'^/api/projects/([^/]+)/logs$', path)
        if match:
            name = match.group(1)
            lines = int(query.get("lines", [100])[0])
            self._json_response({"logs": self.manager.get_logs(name, lines)})
            return

        # GET /api/projects/<name>/snapshots
        match = re.match(r'^/api/projects/([^/]+)/snapshots$', path)
        if match:
            name = match.group(1)
            self._json_response(self.manager.get_snapshots(name))
            return

        # GET /api/config/example
        if path == "/api/config/example":
            if CONFIG_EXAMPLE.exists():
                self._json_response({"config": CONFIG_EXAMPLE.read_text()})
            else:
                self._error_response(404, "Example config not found")
            return

        self._error_response(404, "Not found")

    # ── API POST routes ──

    def _handle_api_post(self, path: str):
        body = self._read_body()

        # POST /api/projects
        if path == "/api/projects":
            name = body.get("name", "")
            config = body.get("config", "")

            error = self.manager.validate_name(name)
            if error:
                self._error_response(400, error)
                return

            if (self.manager.projects_dir / name).exists():
                self._error_response(409, f"Project '{name}' already exists")
                return

            try:
                project = self.manager.create_project(name, config)
                self._json_response(project, 201)
            except Exception as e:
                self._error_response(500, str(e))
            return

        # POST /api/projects/<name>/backup
        match = re.match(r'^/api/projects/([^/]+)/backup$', path)
        if match:
            name = match.group(1)
            dry_run = body.get("dry_run", False)

            if not self.manager.get_project(name):
                self._error_response(404, "Project not found")
                return

            try:
                result = self.manager.run_backup(name, dry_run)
                self._json_response(result)
            except Exception as e:
                self._error_response(500, str(e))
            return

        # POST /api/projects/<name>/detect
        match = re.match(r'^/api/projects/([^/]+)/detect$', path)
        if match:
            name = match.group(1)
            if not self.manager.get_project(name):
                self._error_response(404, "Project not found")
                return
            services = self.manager.run_detection(name)
            self._json_response({"services": services})
            return

        # POST /api/projects/<name>/restore
        match = re.match(r'^/api/projects/([^/]+)/restore$', path)
        if match:
            name = match.group(1)
            snapshot_id = body.get("snapshot_id", "")
            target = body.get("target", "./restored")

            if not snapshot_id:
                self._error_response(400, "snapshot_id is required")
                return

            self._json_response({"status": "restore_started", "snapshot": snapshot_id, "target": target})
            return

        self._error_response(404, "Not found")

    # ── API PUT routes ──

    def _handle_api_put(self, path: str):
        body = self._read_body()

        # PUT /api/projects/<name>
        match = re.match(r'^/api/projects/([^/]+)$', path)
        if match:
            name = match.group(1)
            config = body.get("config", "")

            try:
                project = self.manager.update_project(name, config)
                self._json_response(project)
            except FileNotFoundError:
                self._error_response(404, "Project not found")
            except Exception as e:
                self._error_response(500, str(e))
            return

        self._error_response(404, "Not found")

    # ── API DELETE routes ──

    def _handle_api_delete(self, path: str):
        # DELETE /api/projects/<name>
        match = re.match(r'^/api/projects/([^/]+)$', path)
        if match:
            name = match.group(1)
            try:
                self.manager.delete_project(name)
                self._json_response({"deleted": name})
            except FileNotFoundError:
                self._error_response(404, "Project not found")
            except RuntimeError as e:
                self._error_response(409, str(e))
            except Exception as e:
                self._error_response(500, str(e))
            return

        self._error_response(404, "Not found")

    # ── Static file serving ──

    def _serve_static(self, path: str):
        if path == "/" or path == "":
            path = "/index.html"

        # Security: prevent path traversal
        safe_path = Path(path.lstrip("/"))
        if ".." in safe_path.parts:
            self._error_response(403, "Forbidden")
            return

        file_path = FRONTEND_DIR / safe_path
        if not file_path.is_file():
            # Fallback to index.html for SPA routing
            file_path = FRONTEND_DIR / "index.html"
            if not file_path.is_file():
                self._error_response(404, "Not found")
                return

        ext = file_path.suffix.lower()
        content_type = self.MIME_TYPES.get(ext, "application/octet-stream")

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    # ── Response helpers ──

    def _json_response(self, data, status: int = 200):
        body = json.dumps(data, indent=2, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _error_response(self, status: int, message: str):
        self._json_response({"error": message}, status)

    def _read_body(self) -> dict:
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        """Override to suppress default logging noise."""
        sys.stderr.write(f"[API] {args[0]} {args[1]} {args[2]}\n")


# ──────────────────────────────────────────────
# Server startup
# ──────────────────────────────────────────────

def main():
    port = DEFAULT_PORT

    # Parse --port argument
    for i, arg in enumerate(sys.argv[1:]):
        if arg == "--port" and i + 1 < len(sys.argv) - 1:
            port = int(sys.argv[i + 2])

    # Ensure directories exist
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

    server = http.server.HTTPServer(("0.0.0.0", port), BackupAPIHandler)

    # Graceful shutdown
    def shutdown_handler(sig, frame):
        print("\nShutting down server...")
        server.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    print(f"Universal Backup System - Dashboard")
    print(f"Server running at http://localhost:{port}")
    print(f"API available at http://localhost:{port}/api/projects")
    print(f"Press Ctrl+C to stop\n")

    server.serve_forever()


if __name__ == "__main__":
    main()
