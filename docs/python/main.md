# Main Application Documentation

## Overview

The `main.py` script serves as the entry point for the REACHER Suite, launching the application and managing experimental sessions. It integrates local and network (beta) dashboards into a tabbed interface using `Panel`, with a `Tkinter` window to maintain runtime. This module supports multiple independent sessions, ensuring isolation and scalability for rodent research experiments.

## System Requirements

- **Python**: 3.8 or higher
- **Dependencies**: `panel`, `tkinter`, `pillow`, `multiprocessing`
- **Operating System**: Windows, macOS, or Linux with browser support
- **Hardware**: Optional Arduino for local sessions

## Installation

This script is part of the REACHER Suite:
1. Clone the repository:
   ```bash
   git clone https://github.com/LogisTechLLC/REACHER-Suite.git
   ```
2. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3. Run the application:
    ```bash
    python main.py
    ```

## Key Features

- **Session Management**:
    - Launches new local sessions with unique identifiers.
    - Supports network sessions (beta) for distributed setups.
- **Tabbed Interface**:
    - "Welcome" tab provides setup instructions.
    - Dynamically adds session tabs with isolated Dashboard instances.
- **Application Framework**:
    - Uses BootstrapTemplate for a responsive, themed GUI.
    - Employs Tkinter for persistent runtime and clean shutdown.
- **Scalability**:
    - Designed for multi-session execution on a single or distributed system.

## Usage Example

Run the script:

```bash
python main.py
```

### GUI Interaction:

1. Open the browser interface and keep the Tkinter window active.
2. Enter a session name (e.g., "Session_001").
3. Click **"New local session"** to create a tab with a Dashboard.
4. Follow instructions in the "Welcome" tab.

## Notable Functions

- `make_new_local_instance_tab()`: Adds a new tab with an isolated Dashboard.
- `serve_interface()`: Starts the Panel server with a responsive layout.
- `create_window()`: Launches a Tkinter window for runtime management.

## Data Integrity Measures

- **Session Isolation**: Ensures each `REACHER` instance operates independently, preventing data overlap.
- **User Guidance**: Links to data export instructions in the "Welcome" tab.
- **Stable Framework**: Maintains session integrity across multiple tabs.



