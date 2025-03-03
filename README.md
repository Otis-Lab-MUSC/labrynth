<div style="text-align: center;">
    <img src="src/dashboard/utils/assets/reacher-icon-banner.png" alt="REACHER logo">
</div>
<br>
<br>

[![Download REACHER](https://img.shields.io/badge/Download-REACHER_Dashboard-cyan?style=for-the-badge)](#download-options)

The **REACHER Suite** (Rodent Experiment Application Controls and Handling Ecosystem for Research) is an open-source application framework designed for experimental paradigms involving head-fixed rodents. It supports connections to multiple microcontrollers and facilitates running multiple sessions simultaneously from the same computer or across distributed systems.


---

## **Setup Options**

### **Setup 1: Simple Configuration**

This setup is straightforward and ideal for smaller experiments but can become computationally intensive as the number of sessions increases. 
Please refer to the [Recommended Specs](#recommended-specifications) for system requirements.

**Components:**
- A single computer
- Microcontroller (e.g., Arduino UNO)
- USB-A to USB-B connector

### **Setup 2: Distributed Configuration**

For experiments involving multiple sessions, this configuration distributes computational tasks, assigning each microcontroller to a dedicated machine. It is highly efficient and scales better than the simple configuration.

**Components:**
- Primary computer
- Secondary machine (e.g., Raspberry Pi) for each microcontroller
- Microcontroller (e.g., Arduino UNO)
- USB-A to USB-B connector

> **Note:** Linux-based systems are recommended for optimal performance due to their superior handling of concurrent processes.

---

## **Suite Components**

### **Dashboard Application**

The **REACHER Dashboard** is a browser-based interface built using the `Panel` library. The dashboard enables users to:
- Launch multiple experimental sessions through dynamically added tabs.
- Monitor and control each session independently while maintaining isolation between them.

#### **Features**:
- **Session Management**: Each session tab corresponds to an isolated REACHER instance, ensuring independent data handling.
- **Responsive Interface**: The interface supports dynamic updates, with real-time data displayed using `Plotly` graphs.
- **Extensibility**: Designed to be modular, the dashboard can accommodate additional hardware components and experiment types.

To launch the dashboard, the application uses `BootstrapTemplate` for theming and responsive design.

---

### **Python Framework**

At the heart of the REACHER Suite lies the **REACHER class**, which handles core functionality such as serial communication, data acquisition, and program control. Each session is a separate instance of this class.

#### **Key Features:**
1. **Serial Data Handling**:
   - Two-threaded system for serial communication:
     - One thread reads data from the microcontroller and queues it.
     - Another processes the queued data, ensuring no data loss.
   - String-based communication for easy debugging and logging.

2. **Thread Flags for Control**:
   - Flags ensure smooth data collection, pausing, and resuming:
     - `serial_flag`: Controls serial thread activity.
     - `program_flag`: Manages program execution states (e.g., paused or running).

3. **Data Logging and Integrity**:
   - Behavioral and frame data are logged to CSV files and processed into Pandas DataFrames.
   - If no destination or filename is specified, data is saved to a default directory (`~/REACHER/`).

---

### **API (Beta)**

The API enables distributed configurations by allowing communication between primary and secondary computers. It is built using the `Flask` framework and served with `Waitress`. 

#### **Capabilities**:
- **RESTful Endpoints**: Uses standard HTTP `POST` and `GET` requests to control microcontrollers, fetch data, and manage configurations.
- **Device Discovery**: Broadcasts a unique key over UDP to identify devices on the network.
- **Serial Commands**: Provides endpoints to send commands such as `START-PROGRAM` and `STOP-PROGRAM`.

#### **Endpoints**:
- `/serial/comports`: Fetches available COM ports.
- `/serial/command`: Sends serial commands to the microcontroller.
- `/program/start`, `/program/stop`: Controls program execution.
- `/file/destination`: Configures data export locations.

---

### **Arduino Framework**

The Arduino framework is modular, enabling easy integration of new hardware components. Each component is represented as a C++ class with its own header file, defining its behavior and communication protocol.

#### **Supported Components**:
- Levers (e.g., Left-hand and Right-hand levers)
- Cue (e.g., auditory or visual signals)
- Pumps (for delivering infusions)
- Lick circuits
- Imaging timestamp receptors
- Lasers

#### **Communication Protocol**:
- Uses strings for all data exchanges for enhanced readability and debugging.
- Supports modular expansion to add more components with minimal changes.

---

## **Technical Highlights**

### **Data Visualization and Monitoring**
- Real-time event tracking using `Plotly` for clear and interactive visualizations.
- Tabular summaries of behavioral data for detailed analysis.

### **Multi-Session Support**
- Each session runs independently, even when multiple sessions are executed concurrently.

### **Error Handling and Logging**
- Comprehensive error handling for both Python and Arduino frameworks.
- Logs provide clear diagnostics for troubleshooting.

<br>

## **Download Options**

### REACHER Dasboard

You can download the latest version of the **REACHER Suite Dashboard** for your operating system below:

| **Operating System** | **Download Link** |
|----------------------|------------------|
| **Windows** | [Download reacher-dashboard-1.0_win64-setup.exe](https://github.com/thejoshbq/REACHER-Suite/releases/latest/download/reacher-dashboard-1.0-x64.exe) |
| **Linux (Ubuntu/Debian)** | [Download reacher_dashboard_1.0_amd64.deb](https://github.com/thejoshbq/REACHER-Suite/releases/latest/download/reacher_dashboard_1.0_amd64.deb) |
| **macOS** | [Download reacher-dashboard-1.0-macos.dmg](https://github.com/thejoshbq/REACHER-Suite/releases/latest/download/reacher-dashboard-1.0-macos.dmg) |

> **Note:** Linux machines require `python3-tk` for  to run. Before unpacking the .deb file, run `sudo apt install python3-tk`.

<br>

### Arduino Frameworks

You can download the latest version any of the accompanying Arduino projects here as well:

| **Training Schedule** | **Download Link** |
|----------------------|------------------|
| **All Sketches** | [Download reacher_arduino_sketches.zip](https://github.com/thejoshbq/REACHER-Suite/releases/download/v1.0.1-beta/reacher_arduino_sketches.zip) |
| **Operant Fixed Ratio** | [Download operant_FR.zip](https://github.com/thejoshbq/REACHER-Suite/releases/download/v1.0.1-beta/operant_FR.zip) |
| **Operant Progressive Ratio *(BETA)*** | [Download operant_PR.zip](https://github.com/thejoshbq/REACHER-Suite/releases/download/v1.0.1-beta/operant_PR.zip) |
| **Operant Variable Ratio *(BETA)*** | [Download operant_VR.zip](https://github.com/thejoshbq/REACHER-Suite/releases/download/v1.0.1-beta/operant_VR.zip) |
| **Omission *(BETA)*** | [Download omission.zip](https://github.com/thejoshbq/REACHER-Suite/releases/download/v1.0.1-beta/omission.zip) |

<br>

## **Recommended Specifications**

| **Component**         | **Minimum Specs**                        | **Recommended Specs**                   | **High-Performance Specs**             |
|------------------------|------------------------------------------|------------------------------------------|-----------------------------------------|
| **CPU**               | Quad-core processor (e.g., Intel i3)     | 6-core or 8-core processor (e.g., Intel i5/i7, AMD Ryzen 5) | 12-core or higher (e.g., AMD Ryzen 9, Intel i9) |
| **RAM**               | 8 GB                                     | 16 GB                                    | 32 GB or higher                         |
| **Storage**           | 256 GB SSD                               | 512 GB SSD                               | 1 TB NVMe SSD or higher                 |
| **Operating System**  | Linux or Windows (64-bit)                | Linux (Ubuntu/Debian preferred), Windows (64-bit), or macOS | Linux (optimized with custom kernels)   |
| **Cooling**           | Basic air cooling                       | Efficient air cooling or entry-level liquid cooling | High-end liquid cooling                 |
| **GPU (Optional)**    | Integrated graphics                     | Mid-range GPU (e.g., NVIDIA GTX 1660)   | High-end GPU (e.g., NVIDIA RTX 3080)    |

---

<br><br>
<div style="text-align: center; padding: 10px;">
  <h2>Copyright & License</h2>
  <p>© 2025 LogisTech. All rights reserved.</p>
  <p>This project is licensed under the <a href="https://github.com/LogisTechLLC/REACHER-Suite?tab=MIT-1-ov-file"><strong>LICENSE</strong></a>.</p>
</div>

<br><br>
<div style="text-align: center; padding: 10px; background-color: #333; color: white;">
    <p><i>"The heavens declare the glory of God, and the sky above proclaims his handiwork."</i>
    <p>Psalm 19:1</p>
</div>