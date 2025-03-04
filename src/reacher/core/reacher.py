import serial, queue, threading, time, csv, json, os, logging # FIXME: incorporate formal logging file
from serial.tools import list_ports

class REACHER:
    def __init__(self):

        # Serial variables
        self.ser = serial.Serial(baudrate=115200)
        self.queue = queue.Queue()

        # Thread variables
        self.serial_thread = threading.Thread(target=self.read_serial, daemon=True)
        self.queue_thread = threading.Thread(target=self.handle_queue, daemon=True)
        self.thread_lock = threading.Lock()
        self.serial_flag = threading.Event()
        self.program_flag = threading.Event()
        self.serial_flag.set()
        self.program_flag.set()

        # Data process variables
        self.behavior_data = []
        self.frame_data = []

        # Program variables
        self.program_start_time = None
        self.program_end_time = None
        self.paused_time = 0
        self.paused_start_time = None
        self.limit_type = None
        self.infusion_limit = None
        self.time_limit = None
        self.stop_delay = None
        self.last_infusion_time = None

        # Configuration variables
        self.arduino_configuration = {}
        self.logging_stream_file = f"log-{self.get_time()}.csv"
        self.data_destination = None
        self.behavior_filename = None

    # Serial functions
    def get_COM_ports(self):
        available_ports = [p.device for p in list_ports.comports() if p.vid and p.pid]
        return ["No available ports"] if len(available_ports) == 0 else available_ports
    
    def set_COM_port(self, port: str):
        if port in [p.device for p in list_ports.comports() if p.vid and p.pid]:
            self.ser.port = port

    def open_serial(self):
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

    def clear_queue(self):
        print("[clear_queue]: Sending sentinal...")
        self.queue.put_nowait(None)
        print("[clear_queue]: Waiting for queue to be processed...")
        while not self.queue.empty():
            self.queue.get_nowait()
            self.queue.task_done()
        print("[clear_queue]: Queue cleared.")
        print("[clear_queue]: Waiting for queue thread to terminate...")
        self.queue.join()
        print("[clear_queue]: Queue terminated.")

    def close_serial(self):
        try:
            self.serial_flag.set()
            print("[close_serial]: Serial flag set to terminate threads.")
            if self.ser.is_open:
                self.send_serial_command("UNLINK")
                time.sleep(0.5)
                self.ser.flush()
                self.ser.close()
                print("[close_serial]: Serial port closed.")
            print("[close_serial]: Waiting for serial thread to terminate...")
            self.serial_thread.join(timeout=5)
            print("[close_serial]: Serial thread terminated.")
        except Exception as e:
            print(f"[close_serial]: Error during closure: {e}")
        finally:
            print("[close_serial]: Cleanup complete.")

    def read_serial(self):
        while not self.serial_flag.is_set():
            if self.ser.is_open and self.ser.in_waiting > 0:
                if self.ser.in_waiting > 0:
                    with self.thread_lock:
                        data = self.ser.readline().decode(encoding='utf-8', errors='replace').strip()
                        print(f"[read_serial]: {data}")
                        self.queue.put(data)
                else:
                    time.sleep(.1)

    def handle_queue(self):
        while True:
            try:
                data = self.queue.get(timeout=1)
                self.queue.task_done()
                if data is None:
                    print("[handle_queue]: Sentinel received. Exiting queue thread.")
                    break
                print(f"[handle_queue]: {data}")
                for line in str(data).split('\n'):
                    if not self.program_flag.is_set():
                        self.check_limit_met()
                    if not self.program_flag.is_set():
                        self.handle_data(line)
            except queue.Empty:
                if self.serial_flag.is_set():
                    break
                continue

    def handle_data(self, line):
        print(f"[handle_data]: {line}")
        try:
            self.arduino_configuration = json.loads(line)
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
                print(f"[handle_data]: Processing parts: {parts}")
                handler(parts)
            else:
                print(f"[handle_data]: No handler found for data: {line}")
        except Exception as e:
            print(f"[handle_data]: Error processing data: {e}")

    def update_behavioral_events(self, parts):
        """Reflects lever press occurences in GUI."""
        component, action, start_ts, end_ts = parts
        entry_dict = {
            'Component': component,
            'Action': action,
            'Start Timestamp': int(start_ts) if start_ts != '_' else start_ts,
            'End Timestamp': int(end_ts) if end_ts != '_' else end_ts
        }
        with self.thread_lock:
            print(f"[update_behavioral_events]: {entry_dict}")
            self.behavior_data.append(entry_dict)

        with open(self.logging_stream_file, 'a', newline='\n') as file:
            writer = csv.DictWriter(file, fieldnames=['Component', 'Action', 'Start Timestamp', 'End Timestamp'])
            writer.writerow(entry_dict)
            file.flush()

    def update_frame_events(self, parts):
        """Updates frame counts."""
        _, timestamp = parts
        with self.thread_lock:
            print(f"[update_frame_events]: {timestamp}")
            self.frame_data.append(timestamp)

        with open(self.frame_data, 'a', newline='\n') as file:
            writer = csv.DictWriter(file, fieldnames=['Frame Timestamp'])
            writer.writerow({'Frame Timestamp':timestamp})

    def send_serial_command(self, command: str):
        with self.thread_lock:
            if not self.ser.is_open:
                raise Exception(f"[send_serial_command]: Serial port is not open.")
            send = (f"{command}\n").encode()
            print(f"[send_serial_command]: Sending command '{send}' to Arduino.")
            self.ser.write(send)
            self.ser.flush()

    # Program functions
    def set_limit_type(self, limit_type):
        if limit_type in ['Time', 'Infusion', 'Both']: 
            self.limit_type = limit_type
            print(f"[set_limit_type]: {limit_type}.") 
        else:
            print(f"[set_limit_type]: Not a valid type.")  

    def set_infusion_limit(self, limit: int):
        self.infusion_limit = limit

    def set_time_limit(self, limit: int):
        self.time_limit = limit

    def set_stop_delay(self, delay: int):
        self.stop_delay = delay

    def start_program(self):
        if self.program_flag.is_set():
            self.program_flag.clear()
        self.send_serial_command("START-PROGRAM")
        self.program_start_time = time.time()
        print(f"[start_program]: Program started at {self.get_time()}")

    def stop_program(self):
        print(f"[stop_program]: Ending program...")
        self.send_serial_command("END-PROGRAM")
        self.program_flag.set()
        self.clear_queue()
        self.close_serial()
        self.program_end_time = time.time()
        print(f"[stop_program]: Program ended at {self.get_time()}")

    def pause_program(self):
        self.program_flag.set()
        self.paused_start_time = time.time()

    def resume_program(self):
        if self.program_flag.is_set():
            self.program_flag.clear()
        self.paused_time = time.time() - self.paused_start_time

    def get_program_running(self):
        return not self.program_flag.is_set()

    def check_limit_met(self): 
        current_time = time.time()
        if self.limit_type == "Time":
            elapsed_time = current_time - self.program_start_time - self.paused_time
            if elapsed_time >= self.time_limit:
                self.stop_program()
        elif self.limit_type == "Infusion":
            count = sum(1 for entry in self.behavior_data if entry['Component'] == 'PUMP' and entry['Action'] == 'INFUSION')
            if count >= self.infusion_limit:
                if self.last_infusion_time is None:
                    self.last_infusion_time = current_time
                if self.last_infusion_time and (current_time - self.last_infusion_time >= self.stop_delay):
                    self.stop_program()
        elif self.limit_type == "Both":
            count = sum(1 for entry in self.behavior_data if entry['Component'] == 'PUMP' and entry['Action'] == 'INFUSION')
            if count >= self.infusion_limit:
                if self.last_infusion_time is None:
                    self.last_infusion_time = current_time
            elapsed_time = current_time - self.program_start_time - self.paused_time
            if (self.last_infusion_time and (current_time - self.last_infusion_time) >= self.stop_delay) or (elapsed_time >= self.time_limit):
                self.stop_program()

    # Configuration functions
    def set_data_destination(self, folder: str):
        self.data_destination = folder

    def set_filename(self, filename: str):
        if filename.endswith('.csv'):
            self.behavior_filename = filename
        else:
            self.behavior_filename = filename + '.csv'

    def make_destination_folder(self):
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

    def get_data_destination(self):
        return self.data_destination
    
    def get_filename(self):
        return self.behavior_filename
    
    def set_logging_stream_destination(self, path: str):
        self.logging_stream_file = os.path.join(path, self.logging_stream_file)

    # Data
    def get_behavior_data(self):
        return self.behavior_data
    
    def get_frame_data(self):
        return self.frame_data
    
    def get_arduino_configuration(self):
        return self.arduino_configuration
    
    def get_start_time(self):
        return self.program_start_time
    
    def get_end_time(self):
        return self.program_end_time
    
    def get_time(self):
        local_time = time.localtime()
        formatted_time = time.strftime("%Y-%m-%d_%H-%M-%S", local_time)
        return formatted_time
    
if __name__ == "__main__":
    print("Initializing REACHER...")
    reacher = REACHER()

    print("Available COM Ports:", reacher.get_COM_ports())

    try:
        test_port = "COM3"
        reacher.set_COM_port(test_port)
        print(f"Set COM port to: {test_port}")
    except Exception as e:
        print(f"Error setting COM port: {e}")

    try:
        print("Opening serial connection...")
        reacher.open_serial()
        reacher.send_serial_command("ARM_LEVER_RH")
        reacher.start_program()
        print("Program started at:", reacher.get_start_time())

        print("Pausing program...")
        reacher.pause_program()
        print("Unpausing program...")
        reacher.resume_program()

        print("Stopping program...")
        input()
        reacher.stop_program()
        print("Program ended at:", reacher.get_end_time())
    except Exception as e:
        print(f"Error with serial operations: {e}")
    finally:
        print("Closing serial connection...")
        reacher.close_serial()

    print("Behavior Data:", reacher.get_behavior_data())
    print("Frame Data:", reacher.get_frame_data())
    print("Arduino Configuration:", json.dumps(reacher.get_arduino_configuration(), indent=4))

    print("Setting data destination...")
    reacher.set_data_destination("test_destination_folder")
    print("Data destination:", reacher.get_data_destination())

    print("Setting filename...")
    reacher.set_filename("test_filename")
    print("Filename:", reacher.get_filename())

    print("All tests completed successfully.")