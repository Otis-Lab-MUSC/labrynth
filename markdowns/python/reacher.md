# REACHER Class Documentation

## Overview

The `reacher.py` file defines the `REACHER` class, the backbone of the REACHER Suite (Rodent Experiment Application Controls and Handling Ecosystem for Research). This class manages serial communication with Arduino microcontrollers, processes experimental data in real time, and controls program execution for head-fixed rodent research. It supports both simple and distributed configurations, ensuring reliable data collection through immediate logging and thread-safe operations.

## System Requirements

- **Python**: 3.8 or higher
- **Dependencies**: `pyserial`, `queue`, `threading`, `csv`, `json`, `os`
- **Hardware**: Arduino microcontroller (e.g., Arduino UNO) with string-based command firmware
- **Connectivity**: USB connection via COM port

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

3. Install dependencies:
   ```bash
   from core.reacher import REACHER
   ```

## Key Features

- **Serial Communication**:
    - Establishes connections to Arduino via selectable COM ports (default baud rate: 115200).
    - Uses string-based commands (e.g., `"START-PROGRAM"`, `"ARM_LEVER_LH"`) for readability and debugging.
- **Threaded Data Handling**:
    - Employs a two-thread system:
        - One thread reads serial data and queues it.
        - Another processes the queue into behavioral events and frame timestamps.
    - Thread flags (`serial_flag`, `program_flag`) enable pausing and resuming without data loss.
- **Program Control**:
    - Manages experiment start, pause, resume, and stop, with configurable limits (e.g., time, infusions).
- **Data Collection**:
    - Logs behavioral events and frame timestamps to CSV files in real time.
    - Supports multi-session setups with isolated instances.

## Usage Example

```python
from core.reacher import REACHER

# Initialize REACHER instance
reacher = REACHER()
reacher.set_COM_port("COM3")
reacher.open_serial()

# Send command and start experiment
reacher.send_serial_command("ARM_PUMP")
reacher.start_program()

# Access data
behavior_data = reacher.get_behavior_data()
frame_data = reacher.get_frame_data()

# End session
reacher.stop_program()
reacher.close_serial()
```

## Notable Methods

- `open_serial()`: Opens the serial port and starts data threads.
- `send_serial_command(command: str)`: Sends commands to Arduino with thread synchronization.
- `update_behavioral_events(parts: list)`: Processes and logs events to CSV instantly.
- `start_program()`: Initiates the experiment and logs start time.
- `stop_program()`: Terminates the session and closes the serial connection.

## Data Integrity Measures

- **Real-Time Logging**: Uses `csv.DictWriter` with `flush()` to write data to `log-<timestamp>.csv` immediately, preventing loss.
- **Thread Safety**: Employs `threading.Lock` to avoid data corruption during concurrent access.
- **Default Storage**: Saves logs to `~/REACHER/LOG`, creating the directory if absent.
- **Error Handling**: Logs exceptions to the console for troubleshooting.





