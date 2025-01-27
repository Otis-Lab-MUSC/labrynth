# REACHER Suite

The REACHER Suite is an open-source application framework designed for experimental paradigms on head-fixed rodents. It is designed to connect to multiple microcontrollers and run multiple sessions from the same machine [(see recommended specs)](#recommended-specs). 

The suite comprises of several components:
- Dashboard Application
- Program Framework
- RESTful API *(BETA)*
- Analysis Tool
- Arduino

## Dashboard Application

Launching the application sends the user to an interface designed to be run locally in a browser window built on the [Panel](https://panel.holoviz.org/) library.

## Python Framework

The backbone of the frame work consists of the REACHER class within the `framework` module. Each instantiation of a session tab on the dashboard creates a new instance of a REACHER class, ensuring proper data transmission isolation. 

### Serial data handling

The transmission and processing of data between the REACHER Suite and a microcontroller is handled by a two-threaded system: one thread designated for reading serial data and pushing the data to a queue and another thread designated for processing the data in the queue. This two-threaded system allows for efficient processing of high-volume data.

### Thread flagging for data collection

Although all transmitted data is read while the serial connection is open, the data is not collected until the threads are flagged. Once the signal is received to begin collecting data, received data that matches certain criteria are processed accordingly. Thread flags mark the various conditions to read serial data, process and collect the data, as well as pause and resume a running session.

### Ensuring data integrity

As a method to preserve collected data, data is first sent to a log file and then is processed and saved to a dataframe which can be exported upon session end. If, in the event that no name or save-to location is specified before exporting the data, the data gets exported by default under the REACHER directory, which is automatically created under the running machine's home directory.

## RESTful API *(BETA)*

## Arduino Framework

## Analysis Tool

## Notes

### Recommended specs:

| **Component**         | **Minimum Specs**                        | **Recommended Specs**                   | **High-Performance Specs**             |
|------------------------|------------------------------------------|------------------------------------------|-----------------------------------------|
| **CPU**               | Quad-core processor (e.g., Intel i3)     | 6-core or 8-core processor (e.g., Intel i5/i7, AMD Ryzen 5) | 12-core or higher (e.g., AMD Ryzen 9, Intel i9) |
| **RAM**               | 8 GB                                     | 16 GB                                    | 32 GB or higher                         |
| **Storage**           | 256 GB SSD                               | 512 GB SSD                               | 1 TB NVMe SSD or higher                 |
| **Operating System**  | Linux or Windows (64-bit)                | Linux (Ubuntu/Debian preferred) or macOS | Linux (optimized with custom kernels)   |
| **Cooling**           | Basic air cooling                       | Efficient air cooling or entry-level liquid cooling | High-end liquid cooling                 |
| **GPU (Optional)**    | Integrated graphics                     | Mid-range GPU (e.g., NVIDIA GTX 1660)   | High-end GPU (e.g., NVIDIA RTX 3080)    |

