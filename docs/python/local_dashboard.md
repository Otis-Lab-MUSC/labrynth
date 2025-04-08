# Local Dashboard Documentation

## Overview

The `local_dashboard.py` file implements the `Dashboard` class, a browser-based GUI for the REACHER Suite built with the `Panel` library. It enables users to configure, control, and monitor local experiments involving head-fixed rodents. The dashboard provides real-time data visualization and ensures data integrity through structured exports, aligning with the suite's focus on responsive, extensible interfaces.

## System Requirements

- **Python**: 3.8 or higher
- **Dependencies**: `panel`, `pandas`, `plotly`, `matplotlib`, `numpy`
- **Hardware**: Arduino microcontroller connected via USB
- **Connectivity**: Local system with browser support

## Installation

This module is part of the REACHER Suite:

1. Clone the repository:
   ```bash
   git clone https://github.com/LogisTechLLC/REACHER-Suite.git
   ```
2. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
3. Import in your project:
    ```bash
    from core.local_dashboard import Dashboard
    ```

## Key Features

- **Tabbed Interface**:
    - Home Tab: Connects to Arduino via COM port selection.
    - Program Tab: Configures hardware, experiment limits, and storage paths.
    - Hardware Tab: Arms devices (e.g., levers, pumps) and sets parameters.
    - Monitor Tab: Runs experiments with real-time Plotly graphs.
    - Schedule Tab: Adjusts timing settings (e.g., timeouts, ratios).
- **Real-Time Monitoring**:
    - Updates data visualizations every 5 seconds during experiments.
- **Data Visualization**:
    - Uses Plotly for interactive event timelines and Matplotlib for hardware previews.
- **Data Export**:
    - Downloads session data as CSV files for analysis.

## Usage Example

```python
import panel as pn
from core.local_dashboard import Dashboard

# Initialize and serve dashboard
dashboard = Dashboard()
pn.serve(dashboard.layout(), title="REACHER Local Dashboard")
```

### GUI Steps:

1. Select COM port in **Home Tab**.
2. Configure settings in **Program Tab**.
3. Arm hardware in **Hardware Tab**.
4. Set timing in **Schedule Tab**.
5. Start and monitor experiment in **Monitor Tab**, then download data.

## Notable Methods

- `layout()`: Constructs the tabbed GUI with a response terminal.
- `MonitorTab.start_program()`: Launches the experiment and updates data periodically.
- `MonitorTab.download()`: Exports behavioral data, timestamps, and summaries to CSV.
- `add_response(response: str)`: Displays operational logs and errors in real time.

## Data Integrity Measures

- **Real-Time Updates**: Ensures data is visualized as it’s collected.
- **Comprehensive Exports**: Saves all session data to CSV files in `~/REACHER/LOG` or a specified directory.
- **Feedback Mechanism**: Logs errors and status updates for transparency.



