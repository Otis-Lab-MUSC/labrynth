# src/reacher/interface/__init__.py
from .cli import main as run_cli
from .local_dashboard import Dashboard as LocalDashboard
from .network_dashboard import Dashboard as NetworkDashboard

__all__ = ["run_cli", "LocalDashboard", "NetworkDashboard"]