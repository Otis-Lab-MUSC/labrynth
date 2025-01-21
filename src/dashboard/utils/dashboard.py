import panel as pn
import time
import requests
import socket
from threading import Thread
from utils.tools import *
from reacher_api.wsgi import serve_flask
from reacher_api.app import run_service, end_service
import os, sys, datetime
import pandas as pd
import plotly.graph_objects as go

class Dashboard:
    def __init__(self):
        self.home_tab = HomeTab(self)
        self.program_tab = ProgramTab(self)
        self.hardware_tab = HardwareTab(self)
        self.monitor_tab = MonitorTab(self)
        self.schedule_tab = ScheduleTab(self)
        self.response_terminal = pn.widgets.Terminal(
            "Welcome to the REACHER Suite!\n-----------------------------\n\n",
            options={
                "cursorBlink": True,
                "theme": {
                    "background": "#1e1e1e",
                    "foreground": "#ffffff",
                    "cursor": "#00FFFF",
                    "selection": "#ffffff33"
                }
            },
            disabled=True,
            width=500,
            height=600
        )
        self.api_config = {
            "host": None,
            "port": None,
            "key": None
        }

        self.dashboard = pn.Tabs(
            ("Home", self.home_tab.layout()),
            ("Program", self.program_tab.layout()),
            ("Monitor", self.monitor_tab.layout()),
            
            ("Schedule", self.schedule_tab.layout()),
            tabs_location="left",
        )    

    def layout(self):
        layout = pn.Row(self.dashboard, self.response_terminal)
        return layout
    
    def get_api_config(self):
        return self.api_config
    
    def set_api_config(self, config: dict):
        self.api_config = config

    def get_response_terminal(self):
        return self.response_terminal
    
    def get_program_tab(self):
        return self.program_tab
    
    def get_hardware_tab(self):
        return self.hardware_tab
    
    def add_response(self, response: str):
        local_time = time.localtime()
        formatted_time = time.strftime("%H:%M:%S", local_time)
        cyan = "\033[36m"
        grey = "\033[90m"
        reset = "\033[0m"
        self.response_terminal.write(f"{cyan}>>>{grey} [{formatted_time}]:{reset} {response}.\n\n")

    def add_error(self, response: str, details: str):
        local_time = time.localtime()
        formatted_time = time.strftime("%H:%M:%S", local_time)
        red = "\033[31m"
        grey = "\033[90m"
        reset = "\033[0m"
        self.response_terminal.write(f"{red}>>>{grey} [{formatted_time}]: {red}!!!ERROR!!!{reset} {response}.\n     Details - {details}\n\n")

class HomeTab():
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.server_select = pn.widgets.Select(name="Discovered Devices", options=[])
        self.search_server_button = pn.widgets.Button(icon="search", name="Search Devices")
        self.devices_dict = {}
        self.search_server_button.on_click(self.search_reacher_devices)
        self.start_api_button = pn.widgets.Button(name="Start API", icon="rocket")
        self.start_api_button.on_click(self.start_api)
        self.set_api_address_button = pn.widgets.Button(name="Set IP Address", icon="address")
        self.set_api_address_button.on_click(self.set_ip_address)
        self.verify_connection_button = pn.widgets.Button(name="Verify")
        self.verify_connection_button.on_click(self.connect_to_api)
        self.search_microcontrollers_button = pn.widgets.Button(name="Search Microcontrollers", icon="search")
        self.search_microcontrollers_button.on_click(self.search_for_microcontrollers)
        self.microcontroller_menu = pn.widgets.Select(name="Microcontroller", options=[])
        self.serial_connect_button = pn.widgets.Button(name="Connect")
        self.serial_connect_button.on_click(self.connect_to_microcontroller)
        self.serial_disconnect_button = pn.widgets.Button(name="Disconnect")
        self.serial_disconnect_button.on_click(self.disconnect_from_microcontroller)
        self.api_connected = False
        self.com_connected = False

    def start_api(self, _):
        try:
            self.dashboard.add_response("Starting broadcast...")
            self.service_thread = Thread(target=run_service, daemon=True)
            self.service_thread.start()
            self.start_api_button.disabled = True
            self.dashboard.add_response("Broadcast running. Search for device on network.")
        except Exception as e:
            self.dashboard.add_error("Failed to launch API server", e)

    def search_reacher_devices(self, _):
        try:
            self.dashboard.add_response("Searching for devices broadcasting the REACHER service...")
            services = discover_reacher_services(timeout=5)
            if services:
                self.dashboard.add_response(f"Found {len(services)} device(s)")
                for _, info in services.items():
                    self.devices_dict[info['name']] = {
                        "host": info['address'],
                        "port": info['port'],
                        "key": info['key']
                    }
                    self.dashboard.add_response(f"    - {info['name']} at {info['address']}")
                self.server_select.options = [f"{info['name']}" for _, info in services.items()]
            else:
                self.dashboard.add_response("No devices found broadcasting the REACHER service")
        except Exception as e:
            self.dashboard.add_error(f"Error during search", e)

    def set_ip_address(self, _): # FIXME: can only assign one instance per laptop - good or bad?
        try:
            new_api_config = self.devices_dict[str(self.server_select.value)]
            new_api_config = {
                "host": self.devices_dict[str(self.server_select.value)]["host"],
                "port": scan_ports(self.devices_dict[str(self.server_select.value)]["host"], 49152, 49162),
                "key": self.devices_dict[str(self.server_select.value)]["key"]
            }
            self.dashboard.set_api_config(new_api_config)
            self.dashboard.add_response(f"Set API host to {new_api_config["host"]} and port to {new_api_config["port"]}")
        except Exception as e:
            self.dashboard.add_error(f"Unable to set API address", e)

    def connect_to_api(self, _):
        self.dashboard.add_response("Verifying connection to API...")
        api_config = self.dashboard.get_api_config()
        end_service()
        if self.service_thread.is_alive():
            self.service_thread.join()
        try:
            self.api_thread = Thread(target=serve_flask, args=(api_config,), daemon=True)
            self.api_thread.start()
            time.sleep(1)

            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/home/connection")
            response_data = handle_response(response)
            connected = response_data.get('connected')

            status = response_data.get('status')
            if connected:
                self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Failed to connect to host {api_config["host"]}", e)

    def search_for_microcontrollers(self, _):
        self.dashboard.add_response("Searching for microcontrollers...")
        api_config = self.dashboard.get_api_config()
        available_ports = []
        response = requests.get(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/serial/comports")
        response_data = handle_response(response)
        available_ports = response_data.get('ports')

        status = response_data.get('status')
        self.dashboard.add_response(status)
        if available_ports and "No available ports" not in available_ports:
            self.microcontroller_menu.options = available_ports
            self.dashboard.add_response(f"Found {len(available_ports)} available ports.")
        else:
            self.dashboard.add_response(f"No valid COM ports found. Please connect a device and try again.")

    def set_COM(self):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(url=f"http://{api_config["host"]}:{api_config["port"]}/serial/port", json={'port': str(self.microcontroller_menu.value)})
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Exception caught while setting COM port", e)

    def connect_to_microcontroller(self, _):
        api_config = self.dashboard.get_api_config()
        self.set_COM()
        try:
            response = requests.post(url=f"http://{api_config["host"]}:{api_config["port"]}/serial/transmission")
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Failed to connect to {self.microcontroller_menu.value}", e)

    def disconnect_from_microcontroller(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(url=f"http://{api_config["host"]}:{api_config["port"]}/serial/termination")
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Failed to disconnect from {self.microcontroller_menu.value}", e)

    def get_local_ip(self):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))  # Google DNS (doesn't send data)
                return s.getsockname()[0]
        except Exception as e:
            self.dashboard.add_error("Failed to get local IP address", e)
    
    def reset(self):
        api_config = self.dashboard.get_api_config()
        self.dashboard.add_response("Resetting home tab")
        if self.api_connected:
            try:
                response = requests.post(url=f"http://{api_config["host"]}:{api_config["port"]}/serial/termination")
                response_data = handle_response(response)

                status = response_data.get('status')
                self.dashboard.add_response(status)
            except Exception as e:
                self.dashboard.add_error(f"Failed to disconnect from {self.microcontroller_menu.value if self.microcontroller_menu.value else "COM"}", e)
            self.api_connected = False
        self.server_select.options = []
        self.start_api_button.disabled = True
        self.microcontroller_menu.options = []

    def layout(self):
        """
        Returns the layout of the Home tab.
        """
        server_layout = pn.Column(
            pn.pane.Markdown("### API Connection"),
            pn.Row(self.start_api_button, self.search_server_button),
            pn.Spacer(height=20),
            pn.Row(self.server_select, self.set_api_address_button, self.verify_connection_button)
        )
        microcontroller_layout = pn.Column(
            pn.pane.Markdown("### COM Connection"),
            pn.Row(self.microcontroller_menu, self.search_microcontrollers_button),
            pn.Row(self.serial_connect_button, self.serial_disconnect_button)
        )

        return pn.Column(
                server_layout,
                pn.Spacer(height=50),
                microcontroller_layout,
        ) 

class ProgramTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.hardware_checkbuttongroup = pn.widgets.CheckButtonGroup(
            name="Select hardware to use:",
            options=["LH Lever", "RH Lever", "Cue", "Pump", "Lick Circuit", "Imaging Microscope"],
            value=["LH Lever", "RH Lever", "Cue", "Pump"],
            orientation='vertical',
            button_style="outline"
        )
        self.presets_menubutton = pn.widgets.Select(
            name="Select a preset:",
            options=["Custom", "SA High Day", "SA Mid Day", "SA Low Day", "SA Extinction Day"],
        )
        self.limit_type_radiobutton = pn.widgets.RadioButtonGroup(
            name="Limit Type",
            options=["Time", "Infusion", "Both"]
        )
        self.time_limit_hour_intslider = pn.widgets.IntInput(
            name="Hour(s)",
            value=0,
            start=0,
            end=10,
            step=1
        )
        self.time_limit_min_intslider = pn.widgets.IntInput(
            name="Minute(s)",
            value=0,
            start=0,
            end=59,
            step=1
        )
        self.time_limit_sec_intslider = pn.widgets.IntInput(
            name="Second(s)",
            value=0,
            start=0,
            end=59,
            step=5
        )
        self.formatted_time_limit_output = pn.bind(self.format_time, self.time_limit_hour_intslider, self.time_limit_min_intslider, self.time_limit_sec_intslider)
        self.time_limit_area = pn.Row(
            pn.Column(self.time_limit_hour_intslider, self.time_limit_min_intslider, self.time_limit_sec_intslider),
            pn.pane.Markdown(pn.bind(lambda x: f"**{x}**", self.formatted_time_limit_output))
        )
        self.infusion_limit_intslider = pn.widgets.IntInput(
            name="Infusion(s)",
            value=0,
            start=0,
            end=100,
            step=1
        )
        self.stop_delay_intslider = pn.widgets.IntInput(
            name="Stop Delay",
            value=0,
            start=0,
            end=59,
            step=1
        )
        self.set_program_limit_button = pn.widgets.Button(
            name="Set Program Limit"
        )
        self.set_program_limit_button.on_click(self.set_program_limit)
        self.filename_textinput = pn.widgets.TextInput(
            name="File name:",
            placeholder="What do you want to name your file?",
        )
        self.file_destination_textinput = pn.widgets.TextInput(
            name="Folder name:",
            placeholder="Where do you want to save your file?",
        )
        self.set_file_config_button = pn.widgets.Button(
            name="Set File Configuration"
        )
        self.set_file_config_button.on_click(self.set_file_configuration)

    def set_program_limit(self, _):
        api_config = self.dashboard.get_api_config()
        data = {
            'type': self.limit_type_radiobutton.value,
            'infusion_limit': self.infusion_limit_intslider.value,
            'time_limit': (self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value,
            'delay': self.stop_delay_intslider.value
        }
        try:
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/program/limit", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Failed to get file desitination", e)

    def format_time(self, hours, minutes, seconds):
        total_minutes = minutes
        extra_hours, minutes = divmod(total_minutes, 60)
        hours += extra_hours
        return f"{hours}hr {minutes}min {seconds}s"

    def get_hardware(self):
        return self.hardware_checkbuttongroup.value
    
    def set_file_configuration(self, _):
        api_config = self.dashboard.get_api_config()
        data = {'name': self.filename_textinput.value}
        try:
            response = requests.post(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/file/filename", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Failed to get file name", e)
        data = {'destination': self.file_destination_textinput.value}

        try:
            response = requests.post(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/file/destination", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"Failed to get file desitination", e)

    def reset(self):
        self.dashboard.add_response("Resetting program tab")

        self.hardware_checkbuttongroup.value = ["LH Lever", "RH Lever", "Cue", "Pump"]
        self.presets_menubutton.name = "Select a preset:"
        self.limit_type_radiobutton.value = None
        self.time_limit_hour_intslider.value = 0
        self.time_limit_min_intslider.value = 0
        self.time_limit_sec_intslider.value = 0
        self.infusion_limit_intslider.value = 0
    
    def layout(self):
        components_area = pn.Column(
            pn.pane.Markdown("### Components"),
            self.hardware_checkbuttongroup
        )
        limits_area = pn.Column(
            pn.pane.Markdown("### Limits"),
            self.limit_type_radiobutton,
            self.time_limit_area,
            self.infusion_limit_intslider,
            self.stop_delay_intslider, 
        )
        file_configuration_area = pn.Column(
                pn.pane.Markdown("### File Configuration"), 
                self.filename_textinput, 
                self.file_destination_textinput,
                self.set_file_config_button
        )

        return pn.Column(
            pn.Row(self.presets_menubutton, self.set_program_limit_button),
            pn.Spacer(height=50),
            pn.Row(components_area, pn.Spacer(width=100), limits_area),
            pn.Spacer(height=50),
            file_configuration_area
        )
    
class MonitorTab:
    def __init__(self, dashboard: Dashboard):
        self.dashboard = dashboard
        self.program_tab = self.dashboard.get_program_tab()
        self.hardware_tab = self.dashboard.get_hardware_tab()

        if getattr(sys, 'frozen', False):
            base_dir = sys._MEIPASS
        else:
            base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__)))

        assets_dir = os.path.join(base_dir, 'assets')
        self.img_path = os.path.join(assets_dir, 'mouse_still.jpg')
        self.gif_path = os.path.join(assets_dir, 'mouse.gif')
        self.animation_image = pn.pane.Image(
            self.img_path,
            width=200
        )
        self.animation_markdown = pn.pane.Markdown(f"""`Waiting...`""")
        self.df = pd.DataFrame()
        self.plotly_pane = pn.pane.Plotly(
            sizing_mode="stretch_width",
            height=600
        )
        self.start_program_button = pn.widgets.Button(
            icon="player-play"
        )
        self.start_program_button.on_click(self.start_program)
        self.pause_program_button = pn.widgets.Button(
            icon="player-pause"
        )
        self.pause_program_button.on_click(self.pause_program)
        self.stop_program_button = pn.widgets.Button(
            icon="player-stop"
        )
        self.stop_program_button.on_click(self.stop_program)
        self.periodic_callback = None
        self.download_button = pn.widgets.Button(name="Export data", icon="download")
        self.download_button.on_click(self.download)

    def fetch_data(self):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.get(f"http://{api_config["host"]}:{api_config["port"]}/processor/behavior_data", timeout=5)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)

            return pd.DataFrame(response_data.get('data', []))

        except requests.exceptions.RequestException as e:
            self.dashboard.add_error(f"RequestException caught while attempting to fetch data", e)
        except Exception as e:
            self.dashboard.add_error(f"Unexpected error fetching data", e)
        return pd.DataFrame() 

    def generate_plotly_plot(self):
        if self.df.empty:
            fig = go.Figure()
            fig.add_annotation(text="No data available", showarrow=False, x=0.5, y=0.5, xref="paper", yref="paper")
            return fig

        components = self.df['Component'].unique()
        y_positions = {component: i for i, component in enumerate(components)}
        colors = {
            'ACTIVE_PRESS': 'red',
            'TIMEOUT_PRESS': 'grey',
            'INACTIVE_PRESS': 'black',
            'LICK': 'pink',
            'INFUSION': 'red',
            'STIM': 'green'
        }

        fig = go.Figure(layout=dict(height=600))
        for _, row in self.df.iterrows():
            component = row['Component']
            action = row['Action']
            start = row['Start Timestamp']
            end = row['End Timestamp']
            y_pos = y_positions[component]

            fig.add_trace(go.Scatter(
                x=[start, end],
                y=[y_pos, y_pos],
                mode='lines+markers',
                line=dict(color=colors.get(action, 'blue'), width=2),
                marker=dict(symbol='line-ew-open', size=10),
                name=component
            ))

        fig.update_layout(
            title="Event Timeline",
            xaxis_title="Timestamp",
            yaxis=dict(
                title="Components",
                tickvals=list(y_positions.values()),
                ticktext=list(y_positions.keys())
            ),
            showlegend=False,
        )

        return fig

    def update_plot(self):
        api_config = self.dashboard.get_api_config()
        response = requests.get(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/program/activity")
        response_data = handle_response(response)
        is_active = response_data.get('activity')

        status = response_data.get('status')
        self.dashboard.add_response(status)

        if not is_active:
            self.periodic_callback.stop() 
            self.periodic_callback = None  
            self.animation_image.object = self.img_path
            self.animation_markdown.object = """`Finished.`"""
        new_data = self.fetch_data()
        if not new_data.empty:
            self.df = new_data
        self.plotly_pane.object = self.generate_plotly_plot()

    # def apply_preset(self): # FIXME: add presets
    #     """
    #     Applies the selected program preset.
    #     """
    #     self.preset_name = self.presets_menubutton.value
    #     # preset_action = preset_functions.get(preset_name)
    #     # if preset_action:
    #     #     preset_action()

    def start_program(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/program/start")
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)

            if pn.state.curdoc:  # Ensure running in a Bokeh/Panel server environment
                if self.periodic_callback is None:  # Avoid duplicate callbacks
                    self.periodic_callback = pn.state.add_periodic_callback(self.update_plot, period=5000)
            self.animation_image.object = self.gif_path
            # apply_preset() # FIXME: coming soon
            self.hardware_tab.arm_devices(self.program_tab.get_hardware())
            self.animation_markdown.object = f"""`Running...`"""
        except Exception as e:
            self.dashboard.add_error("Failed to start program", e)

    def pause_program(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/program/interim")
            response_data = handle_response(response)

            pause = response_data.get('state')
            if pause:
                status = response_data.get('status')
                self.dashboard.add_response(status)
                self.animation_image.object = self.img_path
                self.animation_markdown.object = f"""`Paused...`"""
            else:
                status = response_data.get('status')
                self.dashboard.add_response(status)
                self.animation_image.object = self.gif_path
                self.animation_markdown.object = f"""`Running...`"""               
        except Exception as e:
            self.dashboard.add_error("Failed to pause program", e)

    def stop_program(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.post(timeout=5, url=f"http://{api_config["host"]}:{api_config["port"]}/program/end")
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)

            self.animation_image.object = self.img_path
            self.periodic_callback.stop() 
            self.periodic_callback = None
            self.animation_markdown.object = f"""`Finished.`"""
        except Exception as e:
            self.dashboard.add_error("Failed to end program", e)

    def download(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/program/start_time")
            response_data = handle_response(response)
            start_time = datetime.datetime.fromtimestamp(response_data.get('start_time')).strftime('%H:%M:%S')

            status = response_data.get('status')
            self.dashboard.add_response(status)
        
            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/program/end_time")
            response_data = handle_response(response)
            end_time = datetime.datetime.fromtimestamp(response_data.get('end_time')).strftime('%H:%M:%S')

            status = response_data.get('status')
            self.dashboard.add_response(status)

            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/processor/arduino_configuration")
            response_data = handle_response(response)
            arduino_configuration = response_data.get('arduino_configuration')

            arduino_configuration_summary = pd.Series(arduino_configuration)

            status = response_data.get('status')
            self.dashboard.add_response(status)

            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/processor/data")
            response_data = handle_response(response)
            data = response_data.get('data')
            frames = response_data.get('frames')

            df = pd.DataFrame.from_records(data, columns=['Component', 'Action', 'Start Timestamp', 'End Timestamp'])
            series = pd.Series(frames)

            rh_active_data = df[(df['Component'] == 'RH_LEVER') & (df['Action'] == 'ACTIVE_PRESS')]
            rh_timeout_data = df[(df['Component'] == 'RH_LEVER') & (df['Action'] == 'TIMEOUT_PRESS')]
            rh_inactive_data = df[(df['Component'] == 'RH_LEVER') & (df['Action'] == 'INACTIVE_PRESS')]
            lh_active_data = df[(df['Component'] == 'LH_LEVER') & (df['Action'] == 'ACTIVE_PRESS')]
            lh_timeout_data = df[(df['Component'] == 'LH_LEVER') & (df['Action'] == 'TIMEOUT_PRESS')]
            lh_inactive_data = df[(df['Component'] == 'LH_LEVER') & (df['Action'] == 'INACTIVE_PRESS')]
            pump_data = df[df['Component'] == 'PUMP']
            lick_data = df[df['Component'] == 'LICK_CIRCUIT']
            laser_data = df[df['Component'] == 'LASER']
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
                'Frames Collected': len(frames)
            }
            
            summary = pd.Series(summary_dict)

            status = response_data.get('status')
            self.dashboard.add_response(status)

            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/file/filename")
            response_data = handle_response(response)
            name = response_data.get('name')

            status = response_data.get('status')
            self.dashboard.add_response(status)

            response = requests.get(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/file/destination_folder")
            response_data = handle_response(response)
            destination = response_data.get('destination')

            status = response_data.get('status')
            self.dashboard.add_response(status)

            base_folder_path = os.path.join(destination, name.split('.')[0])
            if os.path.exists(base_folder_path):
                data_folder_path = os.path.join(destination, f"{name.split('.')[0]} - {time.strftime('%Y%m%d%H%M%S', time.localtime())}")
            else:
                data_folder_path = base_folder_path   
            os.makedirs(data_folder_path, exist_ok=True) 
            df.to_csv(os.path.join(data_folder_path, name))
            series.to_csv(os.path.join(data_folder_path, "frame-timestamps.csv"))
            summary.to_csv(os.path.join(data_folder_path, 'summary.csv'))
            arduino_configuration_summary.to_csv(os.path.join(data_folder_path, 'arduino_configuration.csv'))    
            self.dashboard.add_response(f"Data saved successfully at '{data_folder_path}'")
        except Exception as e:
            self.dashboard.add_error("Failed to save data", e)

    def reset(self):
        self.dashboard.add_response("Resetting monitor tab")

        self.df = pd.DataFrame(data=[])
        self.plotly_pane.object = None
        self.animation_image.object = self.img_path
        self.animation_markdown.object = f"""`Waiting...`"""

    def layout(self):
        program_control_area = pn.Column(
            pn.pane.Markdown("### Program Controls"), 
            pn.Row(self.start_program_button, self.pause_program_button, self.stop_program_button, self.download_button)
        )
        plot_area = pn.Row(
            self.plotly_pane, pn.Column(
                pn.VSpacer(),
                self.animation_image,
                self.animation_markdown,
                pn.VSpacer(),
                width=210
            ),
            styles=dict(background="white")
        )

        return pn.Column(
            program_control_area,
            plot_area
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
        self.rh_lever_armed = False
        self.arm_rh_lever_button = pn.widgets.Button(
            name="Arm RH Lever",
            icon="lock"
        )
        self.arm_rh_lever_button.on_click(self.arm_rh_lever)

        self.lh_lever_armed = False
        self.arm_lh_lever_button = pn.widgets.Button(
            name="Arm LH Lever",
            icon="lock"
        )
        self.arm_lh_lever_button.on_click(self.arm_lh_lever)

        self.cue_armed = False
        self.arm_cue_button = pn.widgets.Button(
            name="Arm Cue",
            icon="lock"
        )
        self.cue_frequency_intslider = pn.widgets.IntSlider(
        )
        self.cue_duration_intslider = pn.widgets.IntSlider(
        )

        self.pump_armed = False
        self.arm_pump_button = pn.widgets.Button(
            name="Arm Pump",
            icon="lock"
        )

        self.lick_circuit_armed = False
        self.arm_lick_circuit_button = pn.widgets.Button(
            name="Arm Lick Circuit",
            icon="lock"
        )

        self.microscope_armed = False
        self.arm_microscope_button = pn.widgets.Button(
            name="Arm Scope",
            icon="lock"
        )

        self.laser_armed = False
        self.arm_laser_button = pn.widgets.Button(
            name="Arm Laser",
            icon="lock"
        )

    def arm_rh_lever(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.rh_lever_armed:
                data = {'command': "ARM_LEVER_RH"}
                self.rh_lever_armed = True
            else:
                data = {'command': "DISARM_LEVER_RH"}
                self.rh_lever_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")
 

    def arm_lh_lever(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.lh_lever_armed:
                data = {'command': "ARM_LEVER_LH"}
                self.lh_lever_armed = True
            else:
                data = {'command': "DISARM_LEVER_LH"}
                self.lh_lever_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_cs(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.cue_armed:
                data = {'command': "ARM_CS"}
                self.cue_armed = True
            else:
                data = {'command': "DISARM_CS"}
                self.cue_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")
            
    def arm_pump(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.pump_armed:
                data = {'command': "ARM_PUMP"}
                self.pump_armed = True
            else:
                data = {'command': "DISARM_PUMP"}
                self.pump_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_lick_circuit(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.lick_circuit_armed:
                data = {'command': "ARM_LICK_CIRCUIT"}
                self.lick_circuit_armed = True
            else:
                data = {'command': "ARM_LICK_CIRCUIT"}
                self.lick_circuit_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_frames(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.microscope_armed:
                data = {'command': "ARM_FRAME"}
                self.microscope_armed = True
            else:
                data = {'command': "DISARM_FRAME"}
                self.microscope_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_laser(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            if self.laser_armed:
                data = {'command': "ARM_LASER"}
                self.laser_armed = True
            else:
                data = {'command': "DISARM_LASER"}
                self.laser_armed = False
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_devices(self, devices: list):
        for device in devices:
            arm_device = self.hardware_components.get(device)
            if arm_device:
                arm_device(None)

    def layout(self):
        return pn.Column(
            self.arm_rh_lever_button,
            self.arm_lh_lever_button,
            self.arm_cue_button,
            self.cue_duration_intslider,
            self.cue_frequency_intslider,
            self.arm_pump_button,
            self.arm_lick_circuit_button,
            self.arm_microscope_button,
            self.arm_laser_button
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

    def send_timeout(self, _):
        api_config = self.dashboard.get_api_config()
        data = {'command': f"SET_TIMEOUT_PERIOD_LENGTH:{self.timeout_intslider.value * 1000}"}
        try:
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error("Failed to send timeout interval", e)

    def send_trace(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            data = {'command': f"SET_TRACE_INTERVAL:{self.trace_intslider.value * 1000}"}
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error("Failed to send trace interval", e)

    def send_fixed_ratio(self, _):
        api_config = self.dashboard.get_api_config()
        try:
                data = {'command': f"SET_RATIO:{self.fixed_ratio_intslider.value}"}
                response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
                response_data = handle_response(response)

                status = response_data.get('status')
                self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error("Failed to send fixed ratio interval", e)

    def send_progressive_ratio(self, _):
        api_config = self.dashboard.get_api_config()
        try:
                data = {'command': f"SET_RATIO:{self.progressive_ratio_intslider.value}"}
                response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
                response_data = handle_response(response)

                status = response_data.get('status')
                self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error("Failed to send progressive ratio interval", e)

    def send_variable_interval(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            data = {'command': f"SET_VARIABLE_INTERVAL:{self.variable_interval_intslider.value}"}
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error("Failed to send variable interval", e)

    def send_omission_interval(self, _):
        api_config = self.dashboard.get_api_config()
        try:
            data = {'command': f"SET_OMISSION_INTERVAL:{self.omission_interval_intslider.value * 1000}"}
            response = requests.post(timeout=5, url=f"{f'http://{api_config["host"]}:{api_config["port"]}'}/serial/command", json=data)
            response_data = handle_response(response)

            status = response_data.get('status')
            self.dashboard.add_response(status)
        except Exception as e:
            self.dashboard.add_error("Failed to send omission interval", e)

    def reset(self):
        self.dashboard.add_response("Resetting schedule tab")

        self.timeout_intslider.value = 20
        self.trace_intslider.value = 0
        self.fixed_ratio_intslider.value = 1
        self.progressive_ratio_intslider.value = 2
        self.variable_interval_intslider.value = 15
        self.omission_interval_intslider.value = 20
    
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