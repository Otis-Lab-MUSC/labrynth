import serial
import queue
import threading
import time
import csv
import json
import os
import logging
from typing import List, Dict, Union, Optional
from serial.tools import list_ports

# Configure logging
log_dir = os.path.expanduser('~/REACHER/LOG')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, f"log-{time.strftime('%Y-%m-%d_%H-%M-%S')}.log")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s]: %(message)s',
    handlers=[
        logging.FileHandler(log_file),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class REACHER:
    """A class to manage serial communication and data collection for REACHER experiments."""

    def __init__(self) -> None:
        """Initialize a REACHER instance with default settings."""
        
        # Serial variables
        self.ser: serial.Serial = serial.Serial(baudrate=115200)
        self.queue: queue.Queue = queue.Queue()

        # Thread variables
        self.serial_thread: threading.Thread = threading.Thread(target=self.read_serial, daemon=True)
        self.queue_thread: threading.Thread = threading.Thread(target=self.handle_queue, daemon=True)
        self.time_check_thread: threading.Thread = threading.Thread(target=self.monitor_time_limit, daemon=True)
        self.thread_lock: threading.Lock = threading.Lock()
        self.serial_flag: threading.Event = threading.Event()
        self.program_flag: threading.Event = threading.Event()
        self.time_check_flag: threading.Event = threading.Event()
        self.serial_flag.set()
        self.program_flag.set()
        self.time_check_flag.set()
        self.serial_thread.start()
        self.queue_thread.start()
        self.time_check_thread.start()

        # Data process variables
        self.behavior_data: List[Dict[str, Union[str, int]]] = []
        self.frame_data: List[str] = []

        # Program variables
        self.program_start_time: Optional[float] = None
        self.program_end_time: Optional[float] = None
        self.paused_time: float = 0
        self.paused_start_time: Optional[float] = None
        self.limit_type: Optional[str] = None
        self.infusion_limit: Optional[int] = None
        self.time_limit: Optional[int] = None
        self.stop_delay: Optional[int] = None
        self.last_infusion_time: Optional[float] = None

        # Configuration variables
        self.arduino_configuration: Dict = {}
        self.logging_stream_file: str = f"log-{self.get_time()}.csv"
        self.data_destination: Optional[str] = None
        self.behavior_filename: Optional[str] = None

    def reset(self) -> None:
        """Reset the REACHER instance to its initial state.

        This method stops any running program, clears queues, closes serial connections,
        and reinitializes all variables and threads.
        """
        logger.info("Resetting REACHER instance...")

        if not self.program_flag.is_set():
            self.stop_program()

        self.clear_queue()
        self.close_serial()
        self.time_check_flag.clear()  # Stop the time check thread

        self.behavior_data = []
        self.frame_data = []

        self.program_start_time = None
        self.program_end_time = None
        self.paused_time = 0
        self.paused_start_time = None
        self.limit_type = None
        self.infusion_limit = None
        self.time_limit = None
        self.stop_delay = None
        self.last_infusion_time = None

        self.arduino_configuration = {}
        self.logging_stream_file = f"log-{self.get_time()}.csv"
        self.data_destination = None
        self.behavior_filename = None

        self.ser = serial.Serial(baudrate=115200)
        self.queue = queue.Queue()

        self.serial_flag.clear()
        self.program_flag.set()
        self.time_check_flag.set()
        self.serial_thread = threading.Thread(target=self.read_serial, daemon=True)
        self.queue_thread = threading.Thread(target=self.handle_queue, daemon=True)
        self.time_check_thread = threading.Thread(target=self.monitor_time_limit, daemon=True)
        self.serial_thread.start()
        self.queue_thread.start()
        self.time_check_thread.start()

        logger.info("REACHER instance reset complete.")

    def get_COM_ports(self) -> List[str]:
        """Retrieve a list of available COM ports.

        Returns:
            List[str]: A list of available COM port names, or ["No available ports"] if none found.
        """
        available_ports = [p.device for p in list_ports.comports() if p.vid and p.pid]
        return ["No available ports"] if len(available_ports) == 0 else available_ports
    
    def set_COM_port(self, port: str) -> None:
        """Set the COM port for serial communication.

        Args:
            port (str): The COM port name to set (e.g., "COM1").

        Notes:
            Only sets the port if it exists in the list of available ports.
        """
        if port in [p.device for p in list_ports.comports() if p.vid and p.pid]:
            self.ser.port = port

    def open_serial(self) -> None:
        """Open the serial connection and start communication threads.

        This method initializes the serial port, starts reading and queue handling threads,
        and sends a LINK command to establish communication.
        """
        if self.ser.is_open:
            self.ser.close()
            time.sleep(1)
        self.ser.open()
        if self.serial_flag.is_set():
            self.serial_flag.clear()
        if not self.serial_thread.is_alive(): 
            self.serial_thread = threading.Thread(target=self.read_serial, daemon=True)
            self.serial_thread.start()
        if not self.queue_thread.is_alive():
            self.queue_thread = threading.Thread(target=self.handle_queue, daemon=True)
            self.queue_thread.start()
        time.sleep(2)
        self.send_serial_command("LINK")
        self.ser.reset_input_buffer()

    def clear_queue(self) -> None:
        """Clear the data queue and wait for processing to complete.

        This method sends a sentinel value to terminate queue processing and waits
        for all queued items to be handled.
        """
        logger.debug("Sending sentinel...")
        self.queue.put_nowait(None)
        logger.debug("Waiting for queue to be processed...")
        while not self.queue.empty():
            self.queue.get_nowait()
            self.queue.task_done()
        logger.debug("Queue cleared.")
        logger.debug("Waiting for queue thread to terminate...")
        self.queue.join()
        logger.debug("Queue terminated.")

    def close_serial(self) -> None:
        """Close the serial connection and terminate related threads.

        This method sends an UNLINK command, closes the serial port, and waits for
        the serial thread to terminate.
        """
        try:
            self.serial_flag.set()
            logger.debug("Serial flag set to terminate threads.")
            if self.ser.is_open:
                self.send_serial_command("UNLINK")
                time.sleep(0.5)
                self.ser.flush()
                self.ser.close()
                logger.info("Serial port closed.")
            logger.debug("Waiting for serial thread to terminate...")
            self.serial_thread.join(timeout=5)
            logger.debug("Serial thread terminated.")
        except Exception as e:
            logger.error(f"Error during closure: {e}")
        finally:
            logger.debug("Cleanup complete.")

    def read_serial(self) -> None:
        """Read data from the serial port and queue it for processing.

        This method runs in a thread and continuously reads serial data when available,
        placing it in the queue for handling.
        """
        while not self.serial_flag.is_set():
            if self.ser.is_open and self.ser.in_waiting > 0:
                with self.thread_lock:
                    data = self.ser.readline().decode(encoding='utf-8', errors='replace').strip()
                    logger.debug(f"Serial data received: {data}")
                    self.queue.put(data)
            else:
                time.sleep(0.1)

    def handle_queue(self) -> None:
        """Process data from the queue.

        This method runs in a thread and handles queued data, either processing it
        as configuration or events, or terminating on sentinel value.
        """
        while True:
            try:
                data = self.queue.get(timeout=1)
                self.queue.task_done()
                if data is None:
                    logger.debug("Sentinel received. Exiting queue thread.")
                    break
                logger.debug(f"Processing queue data: {data}")
                for line in str(data).split('\n'):
                    if not self.program_flag.is_set():
                        self.handle_data(line)
            except queue.Empty:
                if self.serial_flag.is_set():
                    break
                continue

    def monitor_time_limit(self) -> None:
        """Continuously monitor the time limit in a separate thread.

        This method runs in a dedicated thread and checks if program limits are met,
        ensuring timely stopping even when no serial data is received.
        """
        while self.time_check_flag.is_set():
            if not self.program_flag.is_set():  # Program is running
                self.check_limit_met()
            time.sleep(0.1)  # Check every 100ms for responsiveness

    def handle_data(self, line: str) -> None:
        """Process a line of data from the queue.

        Args:
            line (str): The data line to process.

        This method attempts to parse the line as JSON configuration or as event data,
        delegating to appropriate handlers.
        """
        logger.debug(f"Handling data: {line}")
        try:
            with self.thread_lock:
                self.arduino_configuration = json.loads(line)
                logger.info(f"Updated arduino_configuration: {self.arduino_configuration}")
            return
        except json.JSONDecodeError:
            pass
        try:
            event_handlers = {
                4: self.update_behavioral_events,
                2: self.update_frame_events,
            }
            parts = str(line).split(',')
            handler = event_handlers.get(len(parts))
            if handler:
                logger.debug(f"Processing parts: {parts}")
                handler(parts)
            else:
                logger.debug(f"No handler found for data: {line}")
        except Exception as e:
            logger.error(f"Error processing data: {e}")

    def update_behavioral_events(self, parts: List[str]) -> None:
        """Reflects lever press occurrences in GUI.

        Args:
            parts (List[str]): List containing [component, action, start_ts, end_ts].

        This method processes behavioral events and logs them to CSV.
        """
        component, action, start_ts, end_ts = parts
        entry_dict: Dict[str, Union[str, int]] = {
            'Component': component,
            'Action': action,
            'Start Timestamp': int(start_ts) if start_ts != '_' else start_ts,
            'End Timestamp': int(end_ts) if end_ts != '_' else end_ts
        }
        with self.thread_lock:
            logger.debug(f"Behavioral event: {entry_dict}")
            self.behavior_data.append(entry_dict)

        with open(self.logging_stream_file, 'a', newline='\n') as file:
            writer = csv.DictWriter(file, fieldnames=['Component', 'Action', 'Start Timestamp', 'End Timestamp'])
            writer.writerow(entry_dict)
            file.flush()

    def update_frame_events(self, parts: List[str]) -> None:
        """Updates frame counts.

        Args:
            parts (List[str]): List containing [_, timestamp].

        This method processes frame events and logs them to CSV.
        """
        _, timestamp = parts
        with self.thread_lock:
            logger.debug(f"Frame event: {timestamp}")
            self.frame_data.append(timestamp)

        with open(self.logging_stream_file, 'a', newline='\n') as file:
            writer = csv.DictWriter(file, fieldnames=['Frame Timestamp'])
            writer.writerow({'Frame Timestamp': timestamp})

    def send_serial_command(self, command: str) -> None:
        """Send a command to the Arduino via serial.

        Args:
            command (str): The command to send.

        Raises:
            Exception: If the serial port is not open.
        """
        with self.thread_lock:
            if not self.ser.is_open:
                raise Exception("Serial port is not open.")
            send = (f"{command}\n").encode()
            logger.debug(f"Sending command '{send}' to Arduino.")
            self.ser.write(send)
            self.ser.flush()

    def set_limit_type(self, limit_type: str) -> None:
        """Set the type of limit for program execution.

        Args:
            limit_type (str): The limit type ('Time', 'Infusion', or 'Both').
        """
        if limit_type in ['Time', 'Infusion', 'Both']: 
            self.limit_type = limit_type
            logger.info(f"Limit type set to: {limit_type}")
        else:
            logger.warning(f"Invalid limit type: {limit_type}")

    def set_infusion_limit(self, limit: int) -> None:
        """Set the maximum number of infusions allowed.

        Args:
            limit (int): The infusion limit.
        """
        self.infusion_limit = limit

    def set_time_limit(self, limit: int) -> None:
        """Set the maximum time allowed in seconds.

        Args:
            limit (int): The time limit in seconds.
        """
        self.time_limit = limit

    def set_stop_delay(self, delay: int) -> None:
        """Set the delay after last infusion before stopping.

        Args:
            delay (int): The delay in seconds.
        """
        self.stop_delay = delay

    def start_program(self) -> None:
        """Start the experimental program.

        This method sends a START-PROGRAM command and records the start time.
        """
        if self.program_flag.is_set():
            self.program_flag.clear()
        self.send_serial_command("START-PROGRAM")
        self.program_start_time = time.time()
        logger.info(f"Program started at {self.get_time()}")

    def stop_program(self) -> None:
        """Stop the experimental program.

        This method sends an END-PROGRAM command, cleans up, and records the end time.
        """
        logger.info("Ending program...")
        self.send_serial_command("END-PROGRAM")
        self.program_flag.set()
        self.clear_queue()
        self.close_serial()
        self.program_end_time = time.time()
        logger.info(f"Program ended at {self.get_time()}")

    def pause_program(self) -> None:
        """Pause the experimental program.

        This method sets the pause flag and records the pause start time.
        """
        self.program_flag.set()
        self.paused_start_time = time.time()

    def resume_program(self) -> None:
        """Resume the experimental program.

        This method clears the pause flag and updates paused time.
        """
        if self.program_flag.is_set():
            self.program_flag.clear()
        self.paused_time = time.time() - self.paused_start_time

    def get_program_running(self) -> bool:
        """Check if the program is currently running.

        Returns:
            bool: True if the program is running, False otherwise.
        """
        return not self.program_flag.is_set()

    def check_limit_met(self) -> None:
        """Check if program limits have been met and stop if necessary.

        This method evaluates time and/or infusion limits based on limit_type,
        logging debug information for verification.
        """
        current_time = time.time()
        if self.program_start_time is None or self.limit_type is None:
            return  # No limits to check if program hasn't started or type unset

        elapsed_time = current_time - self.program_start_time - self.paused_time
        infusion_count = sum(1 for entry in self.behavior_data if entry['Component'] == 'PUMP' and entry['Action'] == 'INFUSION')
        logger.debug(f"Checking limits: elapsed_time={elapsed_time:.2f}, time_limit={self.time_limit}, infusion_count={infusion_count}, infusion_limit={self.infusion_limit}")

        if self.limit_type == "Time":
            if elapsed_time >= self.time_limit:
                logger.info("Time limit met, stopping program")
                self.stop_program()
        elif self.limit_type == "Infusion":
            if infusion_count >= self.infusion_limit:
                if self.last_infusion_time is None:
                    self.last_infusion_time = current_time
                if self.last_infusion_time and (current_time - self.last_infusion_time >= self.stop_delay):
                    logger.info("Infusion limit met and stop delay elapsed, stopping program")
                    self.stop_program()
        elif self.limit_type == "Both":
            if infusion_count >= self.infusion_limit:
                if self.last_infusion_time is None:
                    self.last_infusion_time = current_time
            if (self.last_infusion_time and (current_time - self.last_infusion_time) >= self.stop_delay) or (elapsed_time >= self.time_limit):
                logger.info("Either infusion limit with stop delay or time limit met, stopping program")
                self.stop_program()

    def set_data_destination(self, folder: str) -> None:
        """Set the destination folder for data files.

        Args:
            folder (str): The folder path.
        """
        self.data_destination = folder

    def set_filename(self, filename: str) -> None:
        """Set the filename for behavioral data.

        Args:
            filename (str): The filename (with or without .csv extension).
        """
        if filename.endswith('.csv'):
            self.behavior_filename = filename
        else:
            self.behavior_filename = filename + '.csv'

    def make_destination_folder(self) -> str:
        """Create a destination folder for data files.

        Returns:
            str: The path to the created folder.
        """
        if not self.behavior_filename and not self.data_destination:
            self.data_destination = os.path.expanduser(r'~/REACHER/DATA')
            self.behavior_filename = f"{self.get_time()}.csv"
        containing_folder = os.path.join(self.data_destination, self.behavior_filename.split('.')[0])
        if os.path.exists(containing_folder):
            data_folder_path = os.path.join(self.data_destination, f"{self.behavior_filename.split('.')[0]}-{time.time():.4f}")
        else:
            data_folder_path = containing_folder   
        os.makedirs(data_folder_path, exist_ok=True)
        return data_folder_path         

    def get_data_destination(self) -> Optional[str]:
        """Get the current data destination folder.

        Returns:
            Optional[str]: The folder path or None if not set.
        """
        return self.data_destination
    
    def get_filename(self) -> Optional[str]:
        """Get the current behavioral data filename.

        Returns:
            Optional[str]: The filename or None if not set.
        """
        return self.behavior_filename
    
    def set_logging_stream_destination(self, path: str) -> None:
        """Set the destination for the logging stream CSV file.

        Args:
            path (str): The destination path.
        """
        self.logging_stream_file = os.path.join(path, self.logging_stream_file)

    def get_behavior_data(self) -> List[Dict[str, Union[str, int]]]:
        """Get the collected behavioral data.

        Returns:
            List[Dict[str, Union[str, int]]]: List of behavioral event dictionaries.
        """
        return self.behavior_data
    
    def get_frame_data(self) -> List[str]:
        """Get the collected frame data.

        Returns:
            List[str]: List of frame timestamps.
        """
        return self.frame_data
    
    def get_arduino_configuration(self) -> Dict:
        """Get the current Arduino configuration.

        Returns:
            Dict: The configuration dictionary.
        """
        with self.thread_lock:
            return self.arduino_configuration
    
    def get_start_time(self) -> Optional[float]:
        """Get the program start time.

        Returns:
            Optional[float]: The start time in seconds since epoch, or None if not started.
        """
        return self.program_start_time
    
    def get_end_time(self) -> Optional[float]:
        """Get the program end time.

        Returns:
            Optional[float]: The end time in seconds since epoch, or None if not ended.
        """
        return self.program_end_time
    
    def get_time(self) -> str:
        """Get the current time as a formatted string.

        Returns:
            str: The current time in 'YYYY-MM-DD_HH-MM-SS' format.
        """
        local_time = time.localtime()
        formatted_time = time.strftime("%Y-%m-%d_%H-%M-%S", local_time)
        return formatted_time