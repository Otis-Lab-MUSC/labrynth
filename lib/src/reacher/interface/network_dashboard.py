import panel as pn
import time
import requests
import json
import socket
import os, sys, datetime
import pandas as pd
import numpy as np
import plotly.graph_objects as go
import matplotlib
matplotlib.use('Qt5Agg')
import matplotlib.pyplot as plt

pn.extension('plotly')

class Dashboard:
    def __init__(self):
        self.header = pn.pane.Alert("Program not started...", alert_type="info")
        self.home_tab = HomeTab(self)
        self.program_tab = ProgramTab(self)
        self.hardware_tab = HardwareTab(self)
        self.monitor_tab = MonitorTab(self)
        self.schedule_tab = ScheduleTab(self)
        self.response_html = pn.pane.HTML(
            "REACHER Output:<br><br>",
            styles={
                "background-color": "#1e1e1e",
                "color": "white",
                "white-space": "pre-wrap",
                "padding": "10px",
            },
            width=450,
        )
        self.response_textarea = pn.Column(
            self.response_html,
            scroll=True,
            height=600,
            width=450,
            visible=True
        )
        self.toggle_button = pn.widgets.Button(name="Hide Response", button_type="primary")
        self.toggle_button.on_click(self.toggle_response_visibility)
        self.reset_button = pn.widgets.Button(name="Reset", icon="reset", button_type="danger")
        self.reset_button.on_click(self.reset_session)
        self.api_config = {"host": None, "port": None, "key": None}
        self.api_connected = False

        self.tabs = pn.Tabs(
            ("Home", self.home_tab.layout()),
            ("Program", self.program_tab.layout()),
            ("Monitor", self.monitor_tab.layout()),
            ("Hardware", self.hardware_tab.layout()),
            ("Schedule", self.schedule_tab.layout()),
            tabs_location="left",
        )

    def toggle_response_visibility(self, event):
        self.response_textarea.visible = not self.response_textarea.visible
        self.toggle_button.name = "Show Responses" if not self.response_textarea.visible else "Hide Responses"

    def layout(self):
        header_row = pn.Row(self.header, self.toggle_button)
        main_row = pn.Row(self.tabs, self.response_textarea)
        return pn.Column(header_row, main_row, self.reset_button)

    def get_api_config(self):
        return self.api_config

    def set_api_config(self, config: dict):
        self.api_config = config
        
    def add_response(self, response: str):
        local_time = time.localtime()
        formatted_time = time.strftime("%H:%M:%S", local_time)
        writeout = f"""<span style="color: cyan;">>>></span><span style="color: grey;"> [{formatted_time}]:</span><span style="color: white;"> {response}</span><br>"""
        self.response_html.object += writeout

    def add_error(self, response: str, details: str):
        local_time = time.localtime()
        formatted_time = time.strftime("%H:%M:%S", local_time)
        writeout = f"""<span style="color: red;">>>></span><span style="color: grey;"> [{formatted_time}]:</span><span style="color: red; font-weight: bold;"> !!!ERROR!!!</span><span style="color: white;"> {response}</span><br><span style="color: grey;">     Details - {details}</span><br>"""
        self.response_html.object += writeout

    def reset_session(self, _):
        if not self.api_connected:
            self.add_response("Please connect to the API first.")
            return
        api_config = self.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/reset")
            response_data = response.json()
            self.add_response(response_data.get('status', 'Session reset.'))
        except Exception as e:
            self.add_error("Failed to reset session.", str(e))

class HomeTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.server_select = pn.widgets.Select(name="Discovered Devices", options=[])
        self.search_server_button = pn.widgets.Button(icon="search", name="Search Devices")
        self.search_server_button.on_click(self.search_reacher_devices)
        self.verify_connection_button = pn.widgets.Button(name="Verify", icon="link")
        self.verify_connection_button.on_click(self.connect_to_api)
        self.search_microcontrollers_button = pn.widgets.Button(name="Search Microcontrollers", icon="search")
        self.search_microcontrollers_button.on_click(self.search_for_microcontrollers)
        self.microcontroller_menu = pn.widgets.Select(name="Microcontroller", options=[])
        self.serial_connect_button = pn.widgets.Button(name="Connect", icon="plug")
        self.serial_connect_button.on_click(self.connect_to_microcontroller)
        self.serial_disconnect_button = pn.widgets.Button(name="Disconnect", icon="plug-circle-xmark")
        self.serial_disconnect_button.on_click(self.disconnect_from_microcontroller)
        self.devices_dict = {}

    def search_reacher_devices(self, _):
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        self.dashboard.add_response(f"Listening for REACHER devices broadcasting on {local_ip}")
        try:
            services = self.discover_reacher_services(timeout=5)
            if services:
                self.dashboard.add_response(f"Found {len(services)} device(s)")
                for _, info in services.items():
                    self.devices_dict[info['name']] = {
                        "host": info['address'],
                        "port": info['port'],
                        "key": info['key']
                    }
                    self.dashboard.add_response(f"{info['name']} at {info['address']}:{info['port']}")
                self.server_select.options = list(self.devices_dict.keys())
            else:
                self.dashboard.add_response("No devices found.")
        except Exception as e:
            self.dashboard.add_error("Error during device search", str(e))

    def discover_reacher_services(self, timeout=5):
        UDP_PORT = 7899
        services = {}
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(('', UDP_PORT))
            sock.settimeout(timeout)
            start_time = time.time()
            while time.time() - start_time < timeout:
                try:
                    data, addr = sock.recvfrom(1024)
                    payload = json.loads(data.decode('utf-8'))
                    if payload.get('message') == "REACHER_DEVICE_DISCOVERY":
                        key = payload['key']
                        services[key] = {
                            'name': payload['name'],
                            'address': payload['address'],
                            'port': payload['port'],
                            'key': key
                        }
                except socket.timeout:
                    break
                except Exception as e:
                    self.dashboard.add_error("Error receiving broadcast", str(e))
        return services

    def set_ip_address(self):
        try:
            selected_device = self.server_select.value
            if selected_device:
                self.dashboard.set_api_config(self.devices_dict[selected_device])
                self.dashboard.add_response(f"Set API to {self.devices_dict[selected_device]['host']}:{self.devices_dict[selected_device]['port']}")
            else:
                self.dashboard.add_response("No device selected.")
        except Exception as e:
            self.dashboard.add_error("Unable to set API address", str(e))

    def connect_to_api(self, _):
        self.set_ip_address()
        self.dashboard.add_response("Verifying connection to API...")
        api_config = self.dashboard.get_api_config()
        if not api_config['host'] or not api_config['port']:
            self.dashboard.add_error("API configuration incomplete", "Host or port not set")
            return
        try:
            response = requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/connection")
            response.raise_for_status()
            response_data = response.json()
            if response_data.get('connected'):
                self.dashboard.api_connected = True
                self.dashboard.add_response(response_data.get('status', 'Connected successfully'))
            else:
                self.dashboard.add_response("Connection failed.")
        except Exception as e:
            self.dashboard.add_error(f"Failed to connect to {api_config['host']}:{api_config['port']}", str(e))

    def search_for_microcontrollers(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        self.dashboard.add_response("Searching for microcontrollers...")
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/comports")
            response_data = response.json()
            ports = response_data.get('ports', [])
            self.dashboard.add_response(response_data.get('status', 'Ports retrieved'))
            if ports and "No available ports" not in ports:
                self.microcontroller_menu.options = ports
                self.dashboard.add_response(f"Found {len(ports)} available ports.")
            else:
                self.dashboard.add_response("No valid COM ports found.")
        except Exception as e:
            self.dashboard.add_error("Failed to search for microcontrollers", str(e))

    def connect_to_microcontroller(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        port = self.microcontroller_menu.value
        if not port:
            self.dashboard.add_response("Please select a microcontroller.")
            return
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/port", json={'port': port})
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', f'COM port set to {port}'))
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/transmission")
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Serial connection opened'))
        except Exception as e:
            self.dashboard.add_error(f"Failed to connect to {port}", str(e))

    def disconnect_from_microcontroller(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Not connected to API.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/termination")
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Serial connection closed'))
        except Exception as e:
            self.dashboard.add_error("Failed to disconnect from microcontroller", str(e))

    def layout(self):
        server_layout = pn.Column(
            pn.pane.Markdown("### API Connection"),
            self.search_server_button,
            self.server_select,
            self.verify_connection_button
        )
        microcontroller_layout = pn.Column(
            pn.pane.Markdown("### COM Connection"),
            self.microcontroller_menu,
            self.search_microcontrollers_button,
            pn.Row(self.serial_connect_button, self.serial_disconnect_button)
        )
        return pn.Column(server_layout, pn.Spacer(height=50), microcontroller_layout)

class ProgramTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.hardware_checkbuttongroup = pn.widgets.CheckButtonGroup(
            name="Select hardware to use:",
            options=["LH Lever", "RH Lever", "Cue", "Pump", "Lick Circuit", "Laser", "Imaging Microscope"],
            value=["LH Lever", "RH Lever", "Cue", "Pump"],
            orientation='vertical',
            button_style="outline"
        )
        self.presets_dict = {
            "Custom": lambda: None,
            "SA High": lambda: self.set_preset("Both", 10, 3600, 10),
            "SA Mid": lambda: self.set_preset("Both", 20, 3600, 10),
            "SA Low": lambda: self.set_preset("Both", 40, 3600, 10),
            "SA Extinction": lambda: self.set_preset("Time", 0, 3600, 0)
        }
        self.presets_menubutton = pn.widgets.Select(
            name="Select a preset:",
            options=list(self.presets_dict.keys())
        )
        self.limit_type_radiobutton = pn.widgets.RadioButtonGroup(
            name="Limit Type",
            options=["Time", "Infusion", "Both"]
        )
        self.time_limit_hour = pn.widgets.IntInput(name="Hour(s)", value=0, start=0, end=10, step=1)
        self.time_limit_min = pn.widgets.IntInput(name="Minute(s)", value=0, start=0, end=59, step=1)
        self.time_limit_sec = pn.widgets.IntInput(name="Second(s)", value=0, start=0, end=59, step=5)
        self.time_limit_area = pn.Row(
            pn.Column(self.time_limit_hour, self.time_limit_min, self.time_limit_sec),
            pn.pane.Markdown(pn.bind(lambda h, m, s: f"**{h}hr {m}min {s}s**", 
                                     self.time_limit_hour, self.time_limit_min, self.time_limit_sec))
        )
        self.infusion_limit_intslider = pn.widgets.IntInput(name="Infusion(s)", value=0, start=0, end=100, step=1)
        self.stop_delay_intslider = pn.widgets.IntInput(name="Stop Delay (s)", value=0, start=0, end=59, step=1)
        self.set_program_limit_button = pn.widgets.Button(name="Set Program Limit", icon="gear")
        self.set_program_limit_button.on_click(self.set_program_limit)
        self.filename_textinput = pn.widgets.TextInput(name="File name:", placeholder="e.g., experiment1.csv")
        self.file_destination_textinput = pn.widgets.TextInput(name="Folder name:", placeholder="e.g., ~/REACHER/DATA")
        self.set_file_config_button = pn.widgets.Button(name="Set File Configuration", icon="file")
        self.set_file_config_button.on_click(self.set_file_configuration)

    def set_preset(self, limit_type, infusion_limit, time_limit, stop_delay):
        self.limit_type_radiobutton.value = limit_type
        self.infusion_limit_intslider.value = infusion_limit
        hours, remainder = divmod(time_limit, 3600)
        minutes, seconds = divmod(remainder, 60)
        self.time_limit_hour.value = hours
        self.time_limit_min.value = minutes
        self.time_limit_sec.value = seconds
        self.stop_delay_intslider.value = stop_delay

    def set_program_limit(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        data = {
            'type': self.limit_type_radiobutton.value,
            'infusion_limit': self.infusion_limit_intslider.value,
            'time_limit': (self.time_limit_hour.value * 3600) + 
                          (self.time_limit_min.value * 60) + 
                          self.time_limit_sec.value,
            'delay': self.stop_delay_intslider.value
        }
        try:
            preset_func = self.presets_dict.get(self.presets_menubutton.value)
            if preset_func and self.presets_menubutton.value != "Custom":
                preset_func()
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/limit", json=data)
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Limits set successfully'))
        except Exception as e:
            self.dashboard.add_error("Failed to set program limits", str(e))

    def set_file_configuration(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/file/filename", 
                                    json={'name': self.filename_textinput.value})
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Filename set'))
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/file/destination", 
                                    json={'destination': self.file_destination_textinput.value})
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Destination set'))
        except Exception as e:
            self.dashboard.add_error("Failed to set file configuration", str(e))

    def get_hardware(self):
        return self.hardware_checkbuttongroup.value

    def layout(self):
        return pn.Column(
            pn.Row(self.presets_menubutton, self.set_program_limit_button),
            pn.Spacer(height=50),
            pn.Row(
                pn.Column(pn.pane.Markdown("### Components"), self.hardware_checkbuttongroup),
                pn.Spacer(width=100),
                pn.Column(pn.pane.Markdown("### Limits"), self.limit_type_radiobutton, self.time_limit_area, 
                          self.infusion_limit_intslider, self.stop_delay_intslider)
            ),
            pn.Spacer(height=50),
            pn.Column(pn.pane.Markdown("### File Configuration"), self.filename_textinput, 
                      self.file_destination_textinput, self.set_file_config_button)
        )

class HardwareTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.hardware_components = {
            "LH Lever": self.arm_lh_lever,
            "RH Lever": self.arm_rh_lever,
            "Cue": self.arm_cs,
            "Pump": self.arm_pump,
            "Lick Circuit": self.arm_lick_circuit,
            "Laser": self.arm_laser,
            "Imaging Timestamp Receptor": self.arm_frames    
        }

        self.active_lever_button = pn.widgets.MenuButton(
            name="Active Lever", items=[("LH Lever", "LH Lever"), ("RH Lever", "RH Lever")], button_type="primary"
        )
        self.active_lever_button.on_click(self.set_active_lever)

        self.rh_lever_armed = False
        self.arm_rh_lever_button = pn.widgets.Toggle(
            name="Arm RH Lever",
            icon="lock",
            value=False,
            button_type="danger"
        )
        self.arm_rh_lever_button.param.watch(self.arm_rh_lever, 'value')

        self.lh_lever_armed = False
        self.arm_lh_lever_button = pn.widgets.Toggle(
            name="Arm LH Lever",
            icon="lock",
            value=False,
            button_type="danger"
        )
        self.arm_lh_lever_button.param.watch(self.arm_lh_lever, 'value')

        self.cue_armed = False
        self.arm_cue_button = pn.widgets.Toggle(
            name="Arm Cue",
            icon="lock",
            value=False,
            button_type="danger"
        )
        self.arm_cue_button.param.watch(self.arm_cs, 'value')
        self.send_cue_configuration_button = pn.widgets.Button(
            name="Send",
            icon="upload",
            button_type="primary"
        )
        self.send_cue_configuration_button.on_click(self.send_cue_configuration)
        
        self.cue_frequency_intslider = pn.widgets.IntInput(
            name="Cue Frequency (Hz)",
            start=0,
            end=20000,
            value=8000,
            step=50
        )
        self.cue_duration_intslider = pn.widgets.IntInput(
            name="Cue Duration (ms)",
            start=0,
            end=10000,
            value=1600,
            step=50
        )

        self.pump_armed = False
        self.arm_pump_button = pn.widgets.Toggle(
            name="Arm Pump",
            icon="lock",
            value=False,
            button_type="danger"
        )
        self.arm_pump_button.param.watch(self.arm_pump, 'value')

        self.lick_circuit_armed = False
        self.arm_lick_circuit_button = pn.widgets.Toggle(
            name="Arm Lick Circuit",
            icon="lock",
            value=False,
            button_type="danger"
        )
        self.arm_lick_circuit_button.param.watch(self.arm_lick_circuit, 'value')

        self.microscope_armed = False
        self.arm_microscope_button = pn.widgets.Toggle(
            name="Arm Scope",
            icon="lock",
            value=False,
            button_type="danger"
        )
        self.arm_microscope_button.param.watch(self.arm_frames, 'value')

        self.laser_armed = False
        self.arm_laser_button = pn.widgets.Toggle(
            name="Arm Laser",
            button_type="danger",
            value=False,
            icon="lock",
            disabled=False
        )
        self.arm_laser_button.param.watch(self.arm_laser, 'value')

        self.stim_mode_widget = pn.widgets.Select(
            name="Stim Mode",
            options=["Cycle", "Active-Press"],
            value="Cycle"
        )
        self.stim_frequency_slider = pn.widgets.IntInput(
            name="Frequency (Hz)",
            start=1,
            end=100,
            step=1,
            value=20
        )
        self.stim_duration_slider = pn.widgets.IntInput(
            name="Stim Duration (s)",
            start=1,
            end=60,
            step=5,
            value=30
        )
        self.send_laser_config_button = pn.widgets.Button(
            name="Send",
            button_type="primary",
            icon="upload",
            disabled=False
        )
        self.send_laser_config_button.on_click(self.send_laser_configuration)

        self.interactive_plot = pn.bind(
            self.plot_square_wave, 
            frequency=self.stim_frequency_slider, 
        )

    def set_active_lever(self, event):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        if event.new == "LH Lever":
            data = {'command': 'ACTIVE_LEVER_LH'}
        elif event.new == "RH Lever":
            data = {'command': 'ACTIVE_LEVER_RH'}
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to set active lever", str(e))
            
    def arm_rh_lever(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.rh_lever_armed:
                data = {'command': 'ARM_LEVER_RH'}
                self.rh_lever_armed = True
                self.arm_rh_lever_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_LEVER_RH'}
                self.rh_lever_armed = False
                self.arm_rh_lever_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm RH lever", str(e))

    def arm_lh_lever(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.lh_lever_armed:
                data = {'command': 'ARM_LEVER_LH'}
                self.lh_lever_armed = True
                self.arm_lh_lever_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_LEVER_LH'}
                self.lh_lever_armed = False
                self.arm_lh_lever_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm LH lever", str(e))

    def arm_cs(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.cue_armed:
                data = {'command': 'ARM_CS'}
                self.cue_armed = True
                self.arm_cue_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_CS'}
                self.cue_armed = False
                self.arm_cue_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm CS", str(e)) 

    def send_cue_configuration(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            data = {'command': f"SET_FREQUENCY_CS:{self.cue_frequency_intslider.value}"}
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
            
            data = {'command': f"SET_DURATION_CS:{self.cue_duration_intslider.value}"}
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to send CS configuration", str(e)) 
            
    def arm_pump(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.pump_armed:
                data = {'command': 'ARM_PUMP'}
                self.pump_armed = True
                self.arm_pump_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_PUMP'}
                self.pump_armed = False
                self.arm_pump_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm pump", str(e)) 

    def arm_lick_circuit(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.lick_circuit_armed:
                data = {'command': 'ARM_LICK_CIRCUIT'}
                self.lick_circuit_armed = True
                self.arm_lick_circuit_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_LICK_CIRCUIT'}
                self.lick_circuit_armed = False
                self.arm_lick_circuit_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm lick circuit", str(e)) 

    def arm_frames(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.microscope_armed:
                data = {'command': 'ARM_FRAME'}
                self.microscope_armed = True
                self.arm_microscope_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_FRAME'}
                self.microscope_armed = False
                self.arm_microscope_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm 2P", str(e)) 

    def arm_laser(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            if not self.laser_armed:
                data = {'command': 'ARM_LASER'}
                self.laser_armed = True
                self.arm_laser_button.icon = "unlock"
            else:
                data = {'command': 'DISARM_LASER'}
                self.laser_armed = False
                self.arm_laser_button.icon = "lock"
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to arm or disarm laser", str(e)) 

    def send_laser_configuration(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            data = {'command': f"LASER_STIM_MODE_{str(self.stim_mode_widget.value).upper()}"}
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
            
            data = {'command': f"LASER_DURATION:{str(self.stim_duration_slider.value)}"}
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
            
            data = {'command': f"LASER_FREQUENCY:{str(self.stim_frequency_slider.value)}"}
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", json=data)
            response.raise_for_status()
        except Exception as e:
            self.dashboard.add_error("Failed to send laser configuration", str(e))

    def plot_square_wave(self, frequency):
        """
        Function to plot a square wave for one second.
        Frequency represents the number of pulses per second.
        """
        total_duration = 1
        t = np.linspace(0, total_duration, 1000)
        square_wave = np.zeros_like(t)
        
        if frequency == 1:
            square_wave[1:999] = 1
        else:
            period = 1 / frequency
            for i, time_point in enumerate(t):
                if (time_point % period) < (period / 2):
                    square_wave[i] = 1
        
        plt.figure(figsize=(5, 2))
        plt.plot(t, square_wave, drawstyle='steps-pre')
        plt.title(f'Square Wave - {frequency} Hz')
        plt.xlabel('Time [s]')
        plt.ylabel('Amplitude')
        plt.ylim([-0.1, 1.1])
        plt.grid(True)
        return plt.gcf()

    def arm_devices(self, devices: list):
        for device in devices:
            arm_device = self.hardware_components.get(device)
            if arm_device:
                arm_device(None)

    def layout(self):

        levers_area = pn.Column(
            pn.pane.Markdown("### Levers"),
            self.active_lever_button,
            self.arm_rh_lever_button,
            self.arm_lh_lever_button,
        )

        cue_area = pn.Column(
            pn.pane.Markdown("### Cue"),
            self.arm_cue_button,
            self.cue_duration_intslider,
            self.cue_frequency_intslider,
            self.send_cue_configuration_button
        )

        reward_area = pn.Column(
            pn.pane.Markdown("### Pump"),
            self.arm_pump_button,
            pn.Spacer(height=50),
            pn.pane.Markdown("### Lick Circuit"),
            self.arm_lick_circuit_button,
        )

        opto_area = pn.Column(
            pn.pane.Markdown("### Scope"),
            self.arm_microscope_button,
            pn.Spacer(height=50),
            pn.pane.Markdown("### Laser"),
            self.arm_laser_button,
            self.stim_mode_widget,
            self.stim_frequency_slider,
            self.stim_duration_slider,
            self.send_laser_config_button,
            pn.pane.Matplotlib(self.interactive_plot, width=500, height=200)
        )

        return pn.Row(
            pn.Column(
                levers_area,
                pn.Spacer(height=50),
                cue_area,
                pn.Spacer(height=50),
                reward_area
            ),
            pn.Spacer(width=100),
            opto_area
        )

class MonitorTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.program_tab = dashboard.program_tab
        self.hardware_tab = dashboard.hardware_tab
        assets_dir = os.path.join(sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(__file__), 'assets')
        self.img_path = os.path.join(assets_dir, 'mouse_still.jpg')
        self.gif_path = os.path.join(assets_dir, 'mouse.gif')
        self.animation_image = pn.pane.Image(self.img_path, width=200)
        self.animation_markdown = pn.pane.Markdown("`Waiting...`")
        self.behavior_data = pd.DataFrame()
        self.plotly_pane = pn.pane.Plotly(sizing_mode="stretch_width", height=600)
        self.summary_pane = pn.pane.DataFrame(index=False, max_rows=10, styles={"background-color": "#1e1e1e", "color": "white"})
        self.start_program_button = pn.widgets.Button(icon="player-play")
        self.start_program_button.on_click(self.start_program)
        self.pause_program_button = pn.widgets.Button(icon="player-pause")
        self.pause_program_button.on_click(self.pause_program)
        self.stop_program_button = pn.widgets.Button(icon="player-stop")
        self.stop_program_button.on_click(self.stop_program)
        self.download_button = pn.widgets.Button(name="Export data", icon="download")
        self.download_button.on_click(self.download)
        self.periodic_callback = None

    def fetch_data(self):
        if not self.dashboard.api_connected:
            return pd.DataFrame()
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/processor/behavior_data")
            response.raise_for_status()
            data = response.json().get('data', [])
            self.dashboard.add_response(response.json().get('status', 'Data fetched'))
            return pd.DataFrame(data)
        except Exception as e:
            self.dashboard.add_error("Failed to fetch data", str(e))
            return pd.DataFrame()

    def update_summary_table(self, behavior_data: pd.DataFrame):
        if behavior_data.empty:
            return pd.DataFrame(columns=["Action", "Component", "Count"])
        return behavior_data.groupby(["Action", "Component"]).size().reset_index(name="Count")

    def generate_plotly_plot(self):
        if self.behavior_data.empty:
            fig = go.Figure()
            fig.add_annotation(text="No data available", showarrow=False, x=0.5, y=0.5, xref="paper", yref="paper")
            return fig
        components = self.behavior_data['Component'].unique()
        y_positions = {comp: i for i, comp in enumerate(components)}
        colors = {'ACTIVE_PRESS': 'red', 'TIMEOUT_PRESS': 'grey', 'INACTIVE_PRESS': 'black', 'LICK': 'pink', 'INFUSION': 'red', 'STIM': 'green'}
        fig = go.Figure()
        for _, row in self.behavior_data.iterrows():
            y_pos = y_positions[row['Component']]
            fig.add_trace(go.Scatter(
                x=[row['Start Timestamp'], row['End Timestamp']],
                y=[y_pos, y_pos],
                mode='lines+markers',
                line=dict(color=colors.get(row['Action'], 'blue'), width=2),
                marker=dict(symbol='line-ew-open', size=10),
                name=row['Component']
            ))
        fig.update_layout(
            title="Event Timeline", xaxis_title="Timestamp",
            yaxis=dict(title="Components", tickvals=list(y_positions.values()), ticktext=list(y_positions.keys())),
            showlegend=False, height=600
        )
        return fig

    def update_plot(self):
        if not self.dashboard.api_connected:
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/activity")
            is_active = response.json().get('activity', False)
            self.dashboard.add_response(response.json().get('status', 'Activity checked'))
            if not is_active and self.periodic_callback:
                self.periodic_callback.stop()
                self.periodic_callback = None
                self.animation_image.object = self.img_path
                self.animation_markdown.object = "`Finished.`"
                self.dashboard.header.alert_type = "success"
                self.dashboard.header.object = "Program finished."
            new_data = self.fetch_data()
            if not new_data.empty:
                self.behavior_data = new_data
            self.plotly_pane.object = self.generate_plotly_plot()
            self.summary_pane.object = self.update_summary_table(new_data)
        except Exception as e:
            self.dashboard.add_error("Failed to update plot", str(e))

    def start_program(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/start")
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Program started'))
            if pn.state.curdoc and not self.periodic_callback:
                self.periodic_callback = pn.state.add_periodic_callback(self.update_plot, period=5000)
            self.animation_image.object = self.gif_path
            self.animation_markdown.object = "`Running...`"
            self.hardware_tab.arm_devices(self.program_tab.get_hardware())
            self.start_program_button.disabled = True
            self.dashboard.header.alert_type = "warning"
            self.dashboard.header.object = "WARNING: Program in progress..."
        except Exception as e:
            self.dashboard.add_error("Failed to start program", str(e))

    def pause_program(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/interim")
            response.raise_for_status()
            data = response.json()
            if data.get('state'):
                self.animation_image.object = self.img_path
                self.animation_markdown.object = "`Paused...`"
                self.pause_program_button.icon = "player-play"
            else:
                self.animation_image.object = self.gif_path
                self.animation_markdown.object = "`Running...`"
                self.pause_program_button.icon = "player-pause"
            self.dashboard.add_response(data.get('status', 'Program state toggled'))
        except Exception as e:
            self.dashboard.add_error("Failed to pause/resume program", str(e))

    def stop_program(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/end")
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', 'Program stopped'))
            if self.periodic_callback:
                self.periodic_callback.stop()
                self.periodic_callback = None
            self.animation_image.object = self.img_path
            self.animation_markdown.object = "`Finished.`"
            self.start_program_button.disabled = False
            self.dashboard.header.alert_type = "success"
            self.dashboard.header.object = "Program finished."
        except Exception as e:
            self.dashboard.add_error("Failed to stop program", str(e))

    def download(self, _):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            responses = {
                'start_time': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/start_time"),
                'end_time': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/program/end_time"),
                'arduino_configuration': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/processor/arduino_configuration"),
                'data': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/processor/data"),
                'filename': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/file/filename"),
            }
            
            for key, resp in responses.items():
                resp.raise_for_status()
                self.dashboard.add_response(resp.json().get('status', f'{key} retrieved'))

            filename = responses['filename'].json().get('name')
            filename_root = filename.split('.')[0]
            downloads_dir = os.path.expanduser(f'~/Downloads/{filename_root}')
            if not os.path.exists(downloads_dir):
                os.makedirs(downloads_dir, exist_ok=True)

            behavior_data = pd.DataFrame(responses['data'].json()['data'])
            behavior_filepath = os.path.join(downloads_dir, filename)
            behavior_data.to_csv(behavior_filepath, index=False)

            frame_data = pd.Series(responses['data'].json()['frames'])
            frame_filepath = os.path.join(downloads_dir, "frame-timestamps.csv")
            frame_data.to_csv(frame_filepath, index=False)

            start_time = datetime.datetime.fromtimestamp(responses['start_time'].json()['start_time']).strftime('%H:%M:%S')
            end_time = datetime.datetime.fromtimestamp( responses['end_time'].json()['end_time']).strftime('%H:%M:%S')
            rh_active_data = behavior_data[(behavior_data['Component'] == 'RH_LEVER') & (behavior_data['Action'] == 'ACTIVE_PRESS')]
            rh_timeout_data = behavior_data[(behavior_data['Component'] == 'RH_LEVER') & (behavior_data['Action'] == 'TIMEOUT_PRESS')]
            rh_inactive_data = behavior_data[(behavior_data['Component'] == 'RH_LEVER') & (behavior_data['Action'] == 'INACTIVE_PRESS')]
            lh_active_data = behavior_data[(behavior_data['Component'] == 'LH_LEVER') & (behavior_data['Action'] == 'ACTIVE_PRESS')]
            lh_timeout_data = behavior_data[(behavior_data['Component'] == 'LH_LEVER') & (behavior_data['Action'] == 'TIMEOUT_PRESS')]
            lh_inactive_data = behavior_data[(behavior_data['Component'] == 'LH_LEVER') & (behavior_data['Action'] == 'INACTIVE_PRESS')]
            pump_data = behavior_data[behavior_data['Component'] == 'PUMP']
            lick_data = behavior_data[behavior_data['Component'] == 'LICK_CIRCUIT']
            laser_data = behavior_data[behavior_data['Component'] == 'LASER']
            summary_dict = {
                'Start Time': start_time,
                'End Time': end_time,
                'RH Active Presses': len(rh_active_data) if not rh_active_data.empty else 0,
                'RH Timeout Presses': len(rh_timeout_data) if not rh_timeout_data.empty else 0,
                'RH Inactive Presses': len(rh_inactive_data) if not rh_inactive_data.empty else 0,
                'LH Active Presses': len(lh_active_data) if not lh_active_data.empty else 0,
                'LH Timeout Presses': len(lh_timeout_data) if not lh_timeout_data.empty else 0,
                'LH Inactive Presses': len(lh_inactive_data) if not lh_inactive_data.empty else 0,
                'Infusions': len(pump_data['Action'] == 'INFUSION') if not pump_data.empty else 0,
                'Licks': len(lick_data['Action'] == 'LICK') if not lick_data.empty else 0,
                'Stims': len(laser_data['Action'] == 'STIM') if not laser_data.empty else 0,
                'Frames Collected': len(frame_data)
            }
            summary_filepath = os.path.join(downloads_dir, "summary.csv")
            pd.Series(summary_dict).to_csv(summary_filepath, index=False)

            config = pd.Series(responses['arduino_configuration'].json()['arduino_configuration'])
            config_filepath = os.path.join(downloads_dir, "arduino_configuration.csv")
            config.to_csv(config_filepath, index=False)

            self.dashboard.add_response(f"Data saved to {downloads_dir}")
        except Exception as e:
            self.dashboard.add_error("Failed to download data", str(e))

    def layout(self):
        return pn.Column(
            pn.Row(self.start_program_button, self.pause_program_button, self.stop_program_button, self.download_button),
            pn.Row(self.plotly_pane, pn.Column(self.animation_image, self.animation_markdown, self.summary_pane, width=250))
        )

class ScheduleTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.timeout_intslider = pn.widgets.IntSlider(name="Timeout Duration(s)", value=20, start=0, end=600, step=5)
        self.send_timeout_button = pn.widgets.Button(icon="upload")
        self.send_timeout_button.on_click(self.send_timeout)
        self.trace_intslider = pn.widgets.IntSlider(name="Trace Duration(s)", value=0, start=0, end=60, step=1)
        self.send_trace_button = pn.widgets.Button(icon="upload")
        self.send_trace_button.on_click(self.send_trace)
        self.fixed_ratio_intslider = pn.widgets.IntSlider(name="Fixed Ratio Interval", value=1, start=1, end=50, step=1)
        self.send_fixed_ratio_button = pn.widgets.Button(icon="upload")
        self.send_fixed_ratio_button.on_click(self.send_fixed_ratio)
        self.progressive_ratio_intslider = pn.widgets.IntSlider(name="Progressive Ratio", value=2, start=1, end=50, step=1)
        self.send_progressive_ratio_button = pn.widgets.Button(icon="upload")
        self.send_progressive_ratio_button.on_click(self.send_progressive_ratio)
        self.variable_interval_intslider = pn.widgets.IntSlider(name="Variable Interval", value=15, start=1, end=100, step=1)
        self.send_variable_interval_button = pn.widgets.Button(icon="upload")
        self.send_variable_interval_button.on_click(self.send_variable_interval)
        self.omission_interval_intslider = pn.widgets.IntSlider(name="Omission Interval", value=20, start=1, end=100, step=1)
        self.send_omission_interval_button = pn.widgets.Button(icon="upload")
        self.send_omission_interval_button.on_click(self.send_omission_interval)

    def send_command(self, command, value):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", 
                                    json={'command': f"{command}:{value}"})
            response.raise_for_status()
            self.dashboard.add_response(response.json().get('status', f"{command} set to {value}"))
        except Exception as e:
            self.dashboard.add_error(f"Failed to send {command}", str(e))

    def send_timeout(self, _):
        self.send_command("SET_TIMEOUT_PERIOD_LENGTH", self.timeout_intslider.value * 1000)

    def send_trace(self, _):
        self.send_command("SET_TRACE_INTERVAL", self.trace_intslider.value * 1000)

    def send_fixed_ratio(self, _):
        self.send_command("SET_RATIO", self.fixed_ratio_intslider.value)

    def send_progressive_ratio(self, _):
        self.send_command("SET_RATIO", self.progressive_ratio_intslider.value)

    def send_variable_interval(self, _):
        self.send_command("SET_VARIABLE_INTERVAL", self.variable_interval_intslider.value)

    def send_omission_interval(self, _):
        self.send_command("SET_OMISSION_INTERVAL", self.omission_interval_intslider.value * 1000)

    def layout(self):
        within_trial_dynamics_area = pn.Column(
            pn.pane.Markdown("### Within-Trial Dynamics"),
            pn.Row(self.timeout_intslider, self.send_timeout_button),
            pn.Row(self.trace_intslider, self.send_trace_button)
        )
        training_schedule_area = pn.Column(
            pn.pane.Markdown("### Training Schedule"),
            pn.Row(self.fixed_ratio_intslider, self.send_fixed_ratio_button),
            pn.Row(self.progressive_ratio_intslider, self.send_progressive_ratio_button),
            pn.Row(self.variable_interval_intslider, self.send_variable_interval_button),
            pn.Row(self.omission_interval_intslider, self.send_omission_interval_button),
        )

        return pn.Row(within_trial_dynamics_area, pn.Spacer(width=100), training_schedule_area)

if __name__ == "__main__":
    dashboard = Dashboard()
    pn.serve(dashboard.layout())