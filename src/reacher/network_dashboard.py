import panel as pn
import time
import requests
import json
import socket
from threading import Thread
import os, sys, datetime
import pandas as pd
import plotly.graph_objects as go

pn.extension('plotly')

class Dashboard:
    def __init__(self):
        self.header = pn.pane.Alert("Program not started...", alert_type="info")
        self.home_tab = HomeTab(self)
        self.program_tab = ProgramTab(self)
        self.hardware_tab = HardwareTab(self)
        self.monitor_tab = MonitorTab(self)
        self.schedule_tab = ScheduleTab(self)
        self.response_textarea = pn.pane.HTML(
            "REACHER Output:<br><br>",
            styles={"background-color": "#1e1e1e", "color": "white"},
            width=450,
            height=600,
            visible=True
        )
        self.toggle_button = pn.widgets.Button(name="Hide Response", button_type="primary")
        self.toggle_button.on_click(self.toggle_response_visibility)
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
        self.toggle_button.name = "Show Response" if not self.response_textarea.visible else "Hide Response"

    def layout(self):
        header_row = pn.Row(self.header, self.toggle_button)
        main_row = pn.Row(self.tabs, self.response_textarea)
        return pn.Column(header_row, main_row)

    def get_api_config(self):
        return self.api_config

    def set_api_config(self, config: dict):
        self.api_config = config

    def add_response(self, response: str):
        local_time = time.localtime()
        formatted_time = time.strftime("%H:%M:%S", local_time)
        writeout = f"""
        <span style="color: cyan;">>>></span>
        <span style="color: grey;"> [{formatted_time}]:</span>
        <span style="color: white;"> {response}</span><br>
        """
        self.response_textarea.object += writeout

    def add_error(self, response: str, details: str):
        local_time = time.localtime()
        formatted_time = time.strftime("%H:%M:%S", local_time)
        writeout = f"""
        <span style="color: red;">>>></span>
        <span style="color: grey;"> [{formatted_time}]:</span>
        <span style="color: red; font-weight: bold;"> !!!ERROR!!!</span>
        <span style="color: white;"> {response}</span><br>
        <span style="color: grey;">     Details - {details}</span><br>
        """
        self.response_textarea.object += writeout

class HomeTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.server_select = pn.widgets.Select(name="Discovered Devices", options=[])
        self.search_server_button = pn.widgets.Button(icon="search", name="Search Devices")
        self.search_server_button.on_click(self.search_reacher_devices)
        self.set_api_address_button = pn.widgets.Button(name="Set IP Address", icon="address-card")
        self.set_api_address_button.on_click(self.set_ip_address)
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
        self.dashboard.add_response("Searching for REACHER devices...")
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

    def set_ip_address(self, _):
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
        self.dashboard.add_response("Verifying connection to API...")
        api_config = self.dashboard.get_api_config()
        if not api_config['host'] or not api_config['port']:
            self.dashboard.add_error("API configuration incomplete", "Host or port not set")
            return
        try:
            response = requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/home/connection")
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
            pn.Row(self.search_server_button, self.server_select),
            pn.Row(self.set_api_address_button, self.verify_connection_button)
        )
        microcontroller_layout = pn.Column(
            pn.pane.Markdown("### COM Connection"),
            pn.Row(self.microcontroller_menu, self.search_microcontrollers_button),
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
            "LH Lever": ("ARM_LEVER_LH", "DISARM_LEVER_LH"),
            "RH Lever": ("ARM_LEVER_RH", "DISARM_LEVER_RH"),
            "Cue": ("ARM_CS", "DISARM_CS"),
            "Pump": ("ARM_PUMP", "DISARM_PUMP"),
            "Lick Circuit": ("ARM_LICK_CIRCUIT", "DISARM_LICK_CIRCUIT"),
            "Laser": ("ARM_LASER", "DISARM_LASER"),
            "Imaging Microscope": ("ARM_FRAME", "DISARM_FRAME")
        }
        self.state = {key: False for key in self.hardware_components}
        self.buttons = {}
        for name in self.hardware_components:
            self.buttons[name] = pn.widgets.Toggle(name=name, button_type="danger", icon="lock")
            self.buttons[name].param.watch(lambda event, n=name: self.toggle_device(n, event.new), 'value')

    def toggle_device(self, device, value):
        if not self.dashboard.api_connected:
            self.dashboard.add_response("Please connect to the API first.")
            return
        api_config = self.dashboard.get_api_config()
        command = self.hardware_components[device][0 if value else 1]
        try:
            response = requests.post(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/serial/command", 
                                    json={'command': command})
            response.raise_for_status()
            self.state[device] = value
            self.buttons[device].icon = "unlock" if value else "lock"
            self.dashboard.add_response(response.json().get('status', f"{device} {'armed' if value else 'disarmed'}"))
        except Exception as e:
            self.dashboard.add_error(f"Failed to toggle {device}", str(e))

    def arm_devices(self, devices: list):
        for device in devices:
            if device in self.hardware_components and not self.state[device]:
                self.buttons[device].value = True

    def layout(self):
        return pn.Column(pn.pane.Markdown("### Hardware Control"), *[self.buttons[name] for name in self.hardware_components])

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

    def update_summary_table(self, behavior_data):
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
                'config': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/processor/arduino_configuration"),
                'data': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/processor/data"),
                'filename': requests.get(timeout=5, url=f"http://{api_config['host']}:{api_config['port']}/file/filename"),
            }
            for key, resp in responses.items():
                resp.raise_for_status()
                self.dashboard.add_response(resp.json().get('status', f'{key} retrieved'))

            filename = responses['filename'].json().get('name')
            if not filename:
                filename = f"REX_00{int(time.time())}.csv"
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
                'Stims': len(laser_data['Action' == 'STIM']) if not laser_data.empty else 0,
                'Frames Collected': len(frame_data)
            }
            summary_filepath = os.path.join(downloads_dir, "summary.csv")
            pd.Series(summary_dict).to_csv(summary_filepath, index=False)

            config = pd.Series(responses['config'].json()['arduino_configuration'])
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
        return pn.Row(
            pn.Column(pn.pane.Markdown("### Within-Trial Dynamics"),
                      pn.Row(self.timeout_intslider, self.send_timeout_button),
                      pn.Row(self.trace_intslider, self.send_trace_button)),
            pn.Spacer(width=100),
            pn.Column(pn.pane.Markdown("### Training Schedule"),
                      pn.Row(self.fixed_ratio_intslider, self.send_fixed_ratio_button),
                      pn.Row(self.progressive_ratio_intslider, self.send_progressive_ratio_button),
                      pn.Row(self.variable_interval_intslider, self.send_variable_interval_button),
                      pn.Row(self.omission_interval_intslider, self.send_omission_interval_button))
        )

if __name__ == "__main__":
    dashboard = Dashboard()
    pn.serve(dashboard.layout())