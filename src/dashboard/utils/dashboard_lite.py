import panel as pn
import os, sys, datetime, time
import pandas as pd
import plotly.graph_objects as go
import matplotlib.pyplot as plt
import numpy as np
from utils.tools import *
from utils.api.framework import REACHER

class LDashboard:
    def __init__(self):
        self.reacher = REACHER()
        self.header = pn.pane.Alert("Program not started...", alert_type="info")
        self.home_tab = HomeTab(self, self.reacher)
        self.program_tab = ProgramTab(self,  self.reacher)
        self.hardware_tab = HardwareTab(self,  self.reacher)
        self.monitor_tab = MonitorTab(self,  self.reacher)
        self.schedule_tab = ScheduleTab(self,  self.reacher)
        self.response_textarea = pn.pane.HTML(
            f"REACHER Output:<br><br>",
            styles={"background-color": "#1e1e1e", "color": "white"},
            width=450,
            height=600,
        )

        self.dashboard = pn.Tabs(
            ("Home", self.home_tab.layout()),
            ("Program", self.program_tab.layout()),
            ("Monitor", self.monitor_tab.layout()),
            ("Hardware", self.hardware_tab.layout()),
            ("Schedule", self.schedule_tab.layout()),
            tabs_location="left",
        )    

    def layout(self):
        layout = pn.Column(
            self.header,
            pn.Row(self.dashboard, self.response_textarea)
        )
        return layout

    def get_response_terminal(self):
        return self.response_textarea
    
    def get_program_tab(self):
        return self.program_tab
    
    def get_hardware_tab(self):
        return self.hardware_tab
    
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
    def __init__(self, dashboard: LDashboard, reacher: REACHER):
        self.dashboard = dashboard
        self.reacher = reacher
        self.search_microcontrollers_button = pn.widgets.Button(name="Search Microcontrollers", icon="search")
        self.search_microcontrollers_button.on_click(self.search_for_microcontrollers)
        self.microcontroller_menu = pn.widgets.Select(name="Microcontroller", options=[])
        self.serial_connect_button = pn.widgets.Button(name="Connect")
        self.serial_connect_button.on_click(self.connect_to_microcontroller)
        self.serial_disconnect_button = pn.widgets.Button(name="Disconnect")
        self.serial_disconnect_button.on_click(self.disconnect_from_microcontroller)

    def search_for_microcontrollers(self, _):
        self.dashboard.add_response("Searching for microcontrollers...")
        available_ports = self.reacher.get_COM_ports()
        if available_ports and "No available ports" not in available_ports:
            self.microcontroller_menu.options = available_ports
            self.dashboard.add_response(f"Found {len(available_ports)} available ports.")
        else:
            self.dashboard.add_response(f"No valid COM ports found. Please connect a device and try again.")

    def set_COM(self):
        try:
            self.reacher.set_COM_port(self.microcontroller_menu.value)
            self.dashboard.add_response(f"Set COM port to {self.microcontroller_menu.value}")
        except Exception as e:
            self.dashboard.add_error(f"Exception caught while setting COM port", e)

    def connect_to_microcontroller(self, _):
        try:
            self.set_COM()
            self.reacher.open_serial()
            self.dashboard.add_response("Opened serial connection")
        except Exception as e:
            self.dashboard.add_error(f"Failed to connect to {self.microcontroller_menu.value}", e)

    def disconnect_from_microcontroller(self, _):
        try:
            self.reacher.close_serial()
            self.dashboard.add_response("Closed serial connection")
        except Exception as e:
            self.dashboard.add_error(f"Failed to disconnect from {self.microcontroller_menu.value}", e)
    
    def reset(self):
        self.dashboard.add_response("Resetting home tab")
        self.microcontroller_menu.options = []

    def layout(self):
        microcontroller_layout = pn.Column(
            pn.pane.Markdown("### COM Connection"),
            pn.Row(self.microcontroller_menu, self.search_microcontrollers_button),
            pn.Row(self.serial_connect_button, self.serial_disconnect_button)
        )

        return pn.Column(
                microcontroller_layout,
        ) 

class ProgramTab:
    def __init__(self, dashboard: LDashboard, reacher: REACHER):
        self.dashboard = dashboard
        self.reacher = reacher
        self.hardware_checkbuttongroup = pn.widgets.CheckButtonGroup(
            name="Select hardware to use:",
            options=["LH Lever", "RH Lever", "Cue", "Pump", "Lick Circuit", "Laser", "Imaging Microscope"],
            value=["LH Lever", "RH Lever", "Cue", "Pump"],
            orientation='vertical',
            button_style="outline"
        )
        self.presets_dict = {
            "Custom": self.set_custom,
            "SA High": self.set_sa_high,
            "SA Mid": self.set_sa_mid,
            "SA Low": self.set_sa_low,
            "SA Extinction": self.set_sa_extinction
        }
        self.presets_menubutton = pn.widgets.Select(
            name="Select a preset:",
            options=list(self.presets_dict.keys()),
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
        try:
            set_limit = self.presets_dict.get(self.presets_menubutton.value)
            if set_limit:
                set_limit()

            self.dashboard.add_response(f"Set limit type to {self.limit_type_radiobutton.value}")
            self.dashboard.add_response(f"Set infusion limit to {self.infusion_limit_intslider.value}")
            self.dashboard.add_response(f"Set time limit to {(self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value}")
            self.dashboard.add_response(f"Set stop delay to {self.stop_delay_intslider.value}")
        except Exception as e:
            self.dashboard.add_error(f"Failed to set program limit", e)

    def set_custom(self):
        self.reacher.set_limit_type(self.limit_type_radiobutton.value)
        self.reacher.set_infusion_limit(self.infusion_limit_intslider.value)
        self.reacher.set_time_limit((self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value)
        self.reacher.set_stop_delay(self.stop_delay_intslider.value)

    def set_sa_high(self):
        self.limit_type_radiobutton.value = "Both"
        self.hardware_checkbuttongroup.value = ["LH Lever", "RH Lever", "Cue", "Pump"]
        self.time_limit_hour_intslider.value = 1
        self.time_limit_min_intslider.value = 0
        self.time_limit_sec_intslider.value = 0
        self.infusion_limit_intslider.value = 10
        self.stop_delay_intslider.value = 10

        self.reacher.set_limit_type(self.limit_type_radiobutton.value)
        self.reacher.set_infusion_limit(self.infusion_limit_intslider.value)
        self.reacher.set_time_limit((self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value)
        self.reacher.set_stop_delay(self.stop_delay_intslider.value)

    def set_sa_mid(self):
        self.limit_type_radiobutton.value = "Both"
        self.hardware_checkbuttongroup.value = ["LH Lever", "RH Lever", "Cue", "Pump"]
        self.time_limit_hour_intslider.value = 1
        self.time_limit_min_intslider.value = 0
        self.time_limit_sec_intslider.value = 0
        self.infusion_limit_intslider.value = 20
        self.stop_delay_intslider.value = 10

        self.reacher.set_limit_type(self.limit_type_radiobutton.value)
        self.reacher.set_infusion_limit(self.infusion_limit_intslider.value)
        self.reacher.set_time_limit((self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value)
        self.reacher.set_stop_delay(self.stop_delay_intslider.value)

    def set_sa_low(self):
        self.limit_type_radiobutton.value = "Both"
        self.hardware_checkbuttongroup.value = ["LH Lever", "RH Lever", "Cue", "Pump"]
        self.time_limit_hour_intslider.value = 1
        self.time_limit_min_intslider.value = 0
        self.time_limit_sec_intslider.value = 0
        self.infusion_limit_intslider.value = 40
        self.stop_delay_intslider.value = 10

        self.reacher.set_limit_type(self.limit_type_radiobutton.value)
        self.reacher.set_infusion_limit(self.infusion_limit_intslider.value)
        self.reacher.set_time_limit((self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value)
        self.reacher.set_stop_delay(self.stop_delay_intslider.value)

    def set_sa_extinction(self):
        self.limit_type_radiobutton.value = "Time"
        self.hardware_checkbuttongroup.value = ["LH Lever", "RH Lever", "Cue", "Pump"]
        self.time_limit_hour_intslider.value = 1
        self.time_limit_min_intslider.value = 0
        self.time_limit_sec_intslider.value = 0
        self.infusion_limit_intslider.value = 0
        self.stop_delay_intslider.value = 0

        self.reacher.set_limit_type(self.limit_type_radiobutton.value)
        self.reacher.set_infusion_limit(self.infusion_limit_intslider.value)
        self.reacher.set_time_limit((self.time_limit_hour_intslider.value * 60 * 60) + (self.time_limit_min_intslider.value * 60) + self.time_limit_sec_intslider.value)
        self.reacher.set_stop_delay(self.stop_delay_intslider.value)

    def format_time(self, hours, minutes, seconds):
        total_minutes = minutes
        extra_hours, minutes = divmod(total_minutes, 60)
        hours += extra_hours
        return f"{hours}hr {minutes}min {seconds}s"

    def get_hardware(self):
        return self.hardware_checkbuttongroup.value
    
    def set_file_configuration(self, _):
        try:
            self.reacher.set_filename(self.filename_textinput.value)
            self.dashboard.add_response(f"Set filename to {self.filename_textinput.value}")
        except Exception as e:
            self.dashboard.add_error(f"Failed to set file name", e)
        try:
            self.reacher.set_data_destination(self.file_destination_textinput.value)
            self.dashboard.add_response(f"Set data destination to {self.file_destination_textinput.value}")
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

class HardwareTab:
    def __init__(self, dashboard: LDashboard, reacher: REACHER):
        self.dashboard = dashboard
        self.reacher = reacher
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
            name="Cue Frequency",
            start=0,
            end=20000,
            value=8000,
            step=50
        )
        self.cue_duration_intslider = pn.widgets.IntInput(
            name="Cue Duration",
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
            options=["Cycle", "Reward"],
            value="Cycle"
        )
        self.pulse_slider = pn.widgets.IntInput(
            name="Frequency (Hz)",
            start=0,
            end=50,
            step=1,
            value=20
        )
        self.stim_duration_slider = pn.widgets.IntInput(
            name="Stim Duration (sec)",
            start=0,
            end=300,
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
            pulses=self.pulse_slider, 
            stim_duration=self.stim_duration_slider
        )

    def set_active_lever(self, event):
        if event.new == "LH Lever":
            self.reacher.send_serial_command("ACTIVE_LEVER_LH")
            self.dashboard.add_response("Set active lever to LH lever")
        elif event.new == "RH Lever":
            self.reacher.send_serial_command("ACTIVE_LEVER_RH")
            self.dashboard.add_response("Set active lever to RH lever")

    def arm_rh_lever(self, _):
        try:
            if not self.rh_lever_armed:
                self.reacher.send_serial_command("ARM_LEVER_RH")
                self.dashboard.add_response("Armed RH Lever")
                self.rh_lever_armed = True
                self.arm_rh_lever_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_LEVER_RH")
                self.dashboard.add_response("Disarmed RH Lever")
                self.rh_lever_armed = False
                self.arm_rh_lever_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_lh_lever(self, _):
        try:
            if not self.lh_lever_armed:
                self.reacher.send_serial_command("ARM_LEVER_LH")
                self.dashboard.add_response("Armed LH Lever")
                self.lh_lever_armed = True
                self.arm_lh_lever_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_LEVER_LH")
                self.dashboard.add_response("Disarmed LH Lever")
                self.lh_lever_armed = False
                self.arm_lh_lever_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}")

    def arm_cs(self, _):
        try:
            if not self.cue_armed:
                self.reacher.send_serial_command("ARM_CS")
                self.dashboard.add_response("Armed CS")
                self.cue_armed = True
                self.arm_cue_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_CS")
                self.dashboard.add_response("Disarmed CS")  
                self.cue_armed = False
                self.arm_cue_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}") 

    def send_cue_configuration(self, _):
        self.reacher.send_serial_command(f"SET_FREQUENCY_CS:{self.cue_frequency_intslider.value}")
        self.dashboard.add_response(f"Changed cue frequency to {self.cue_frequency_intslider.value}")

        self.reacher.send_serial_command(f"SET_DURATION_CS:{self.cue_duration_intslider.value}")
        self.dashboard.add_response(f"Changed cue duration to {self.cue_duration_intslider.value}")

    def arm_pump(self, _):
        try:
            if not self.pump_armed:
                self.reacher.send_serial_command("ARM_PUMP")
                self.dashboard.add_response("Armed pump")
                self.pump_armed = True
                self.arm_pump_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_PUMP")
                self.dashboard.add_response("Disarmed pump")  
                self.pump_armed = False
                self.arm_pump_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}") 

    def arm_lick_circuit(self, _):
        try:
            if not self.lick_circuit_armed:
                self.reacher.send_serial_command("ARM_LICK_CIRCUIT")
                self.dashboard.add_response("Armed lick circuit")
                self.lick_circuit_armed = True
                self.arm_lick_circuit_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_LICK_CIRCUIT")
                self.dashboard.add_response("Disarmed lick circuit")  
                self.lick_circuit_armed = False
                self.arm_lick_circuit_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}") 

    def arm_frames(self, _):
        try:
            if not self.microscope_armed:
                self.reacher.send_serial_command("ARM_FRAME")
                self.dashboard.add_response("Armed microscope")
                self.microscope_armed = True
                self.arm_microscope_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_FRAME")
                self.dashboard.add_response("Disarmed microscope")  
                self.microscope_armed = False
                self.arm_microscope_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}") 

    def arm_laser(self, _):
        try:
            if not self.laser_armed:
                self.reacher.send_serial_command("ARM_LASER")
                self.dashboard.add_response("Armed laser")
                self.laser_armed = True
                self.arm_laser_button.icon = "unlock"
            else:
                self.reacher.send_serial_command("DISARM_LASER")
                self.dashboard.add_response("Disarmed laser")  
                self.laser_armed = False
                self.arm_laser_button.icon = "lock"
        except Exception as e:
            self.dashboard.add_error(f"{e}") 

    def send_laser_configuration(self, _):
        """
        Function to send laser configuration to the Arduino.
        """
        try:
            self.reacher.send_serial_command(f"LASER_STIM_MODE_{str(self.stim_mode_widget.value).upper()}")
            self.dashboard.add_response(f"Set stim mode to {str(self.stim_mode_widget.value)}")

            self.reacher.send_serial_command(f"LASER_DURATION:{str(self.stim_duration_slider.value * 1000)}")
            self.dashboard.add_response(f"Set laser duration to {str(self.stim_duration_slider.value)} seconds")

            self.reacher.send_serial_command(f"LASER_FREQUENCY:{str(self.pulse_slider.value)}")
            self.dashboard.add_response(f"Set laser frequency to {str(self.pulse_slider.value)}")
        except Exception as e:
            self.dashboard.add_error("Failed to send laser configuration", str(e))

    def plot_square_wave(self, pulses, stim_duration):
        """
        Function to plot a square wave.
        """
        total_duration = stim_duration
        t = np.linspace(0, total_duration, 1000)
        initial_low_duration = 1
        square_wave = np.zeros_like(t)

        period = (total_duration - initial_low_duration) / pulses
        for i, time_point in enumerate(t):
            if time_point >= initial_low_duration:
                relative_time = time_point - initial_low_duration
                if (relative_time // (period / 2)) % 2 == 0:
                    square_wave[i] = 1

        plt.figure(figsize=(5, 2))
        plt.plot(t, square_wave)
        plt.title(f'Square Wave - Pulses: {pulses}, Stim Duration: {stim_duration} sec')
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
            pn.pane.Markdown("### Laser (BETA)"),
            self.arm_laser_button,
            self.stim_mode_widget,
            self.pulse_slider,
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
    def __init__(self, dashboard: LDashboard, reacher: REACHER):
        self.dashboard = dashboard
        self.reacher = reacher
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
        self.summary_pane = pn.pane.DataFrame(
            index=False, 
            max_rows=10, 
            border=1,
            bold_rows=True,
            styles={"background-color": "#1e1e1e", "color": "white"}
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
        try:
            data = self.reacher.get_behavior_data()
            return pd.DataFrame(data)
        except requests.exceptions.RequestException as e:
            self.dashboard.add_error(f"RequestException caught while attempting to fetch data", e)
        except Exception as e:
            self.dashboard.add_error(f"Unexpected error fetching data", e)
        return pd.DataFrame() 
    
    def update_summary_table(self, df: pd.DataFrame):
        if df.empty:
            self.dashboard.add_response("No data available to summarize.")
            return pd.DataFrame(columns=["Action", "Component", "Count"])
        
        try:
            summary = df.groupby(["Action", "Component"]).size().reset_index(name="Count")
            return summary
        except KeyError as e:
            self.dashboard.add_error("KeyError: Missing column(s) in DataFrame.", str(e))
            return pd.DataFrame(columns=["Action", "Component", "Count"])

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
        is_active = self.reacher.get_program_running()
        if not is_active:
            self.periodic_callback.stop() 
            self.periodic_callback = None  
            self.animation_image.object = self.img_path
            self.animation_markdown.object = """`Finished.`"""
            self.dashboard.header.alert_type = "success"
            self.dashboard.header.object = "Program finished."
            self.dashboard.add_response("Program finished")
        new_data = self.fetch_data()
        if not new_data.empty:
            self.df = new_data
        self.plotly_pane.object = self.generate_plotly_plot()
        self.summary_pane.object = self.update_summary_table(new_data)

    def apply_preset(self):
        """
        Applies the selected program preset.
        """
        self.preset_name = self.program_tab.presets_menubutton.value
        preset_action = self.program_tab.presets_dict.get(self.preset_name)
        if preset_action:
            preset_action()

    def start_program(self, _):
        try:
            reacher_log_path = os.path.expanduser(r'~/REACHER/LOG')
            if os.path.exists(reacher_log_path):
                self.reacher.set_logging_stream_destination(reacher_log_path)
            else:
                os.makedirs(reacher_log_path, exist_ok=True)
                self.reacher.set_logging_stream_destination(reacher_log_path)

            self.reacher.start_program()
            local_time = time.localtime()
            formatted_time = time.strftime("%Y-%m-%d, %H:%M:%S", local_time)
            self.dashboard.add_response(f"Started program at {formatted_time}")

            if pn.state.curdoc:
                if self.periodic_callback is None:  
                    self.periodic_callback = pn.state.add_periodic_callback(self.update_plot, period=5000)
            self.animation_image.object = self.gif_path
            self.apply_preset()
            self.hardware_tab.arm_devices(self.program_tab.get_hardware())
            self.animation_markdown.object = f"""`Running...`"""
            self.start_program_button.disabled = True
            self.dashboard.header.alert_type = "warning"
            self.dashboard.header.object = "WARNING: Program in progress..."
        except Exception as e:
            self.dashboard.add_error("Failed to start program", e)

    def pause_program(self, _):
        try:
            if self.reacher.program_flag.is_set():
                self.reacher.resume_program()
                self.animation_image.object = self.gif_path
                self.animation_markdown = f"""`Running...`"""
                self.pause_program_button.icon = "player-pause"
            else:
                self.reacher.pause_program()
                self.animation_image.object = self.img_path
                self.animation_markdown.object = f"""`Paused...`"""
                self.pause_program_button.icon = "player-play"
        except Exception as e:
            self.dashboard.add_error("Failed to pause program", e)

    def stop_program(self, _):
        try:
            self.reacher.stop_program()
            local_time = time.localtime()
            formatted_time = time.strftime("%Y-%m-%d, %H:%M:%S", local_time)
            self.dashboard.add_response(f"Ended program at {formatted_time}")
            self.animation_image.object = self.img_path
            self.periodic_callback.stop() 
            self.periodic_callback = None
            self.animation_markdown.object = f"""`Finished.`"""
            self.dashboard.header.alert_type = "success"
            self.dashboard.header.object = "Program finished."
        except Exception as e:
            self.dashboard.add_error("Failed to end program", e)

    def download(self, _):
        try:
            start_time = datetime.datetime.fromtimestamp(self.reacher.get_start_time()).strftime('%H:%M:%S')
            end_time = datetime.datetime.fromtimestamp(self.reacher.get_end_time()).strftime('%H:%M:%S')
            arduino_configuration_summary = pd.Series(self.reacher.get_arduino_configuration())
            data = self.reacher.get_behavior_data()
            frames = self.reacher.get_frame_data()

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

            destination = self.reacher.make_destination_folder()
            df.to_csv(os.path.join(destination, self.reacher.get_filename()))
            series.to_csv(os.path.join(destination, "frame-timestamps.csv"))
            summary.to_csv(os.path.join(destination, 'summary.csv'))
            arduino_configuration_summary.to_csv(os.path.join(destination, 'arduino-configuration.csv'))    
            self.dashboard.add_response(f"Data saved successfully at '{destination}'")
        except Exception as e:
            self.dashboard.add_error("Failed to save data", e)

    def get_time(self):
        local_time = time.localtime()
        formatted_time = time.strftime("%Y-%m-%d_%H-%M-%S", local_time)
        return formatted_time
    
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
        plot_area = pn.Column(
            pn.Row(
                self.plotly_pane, 
                pn.Column(
                    pn.VSpacer(),
                    self.animation_image,
                    self.animation_markdown,
                    pn.VSpacer(),
                    width=210
                ),
                styles=dict(background="white")
            ),
            self.summary_pane
        )

        return pn.Column(
            program_control_area,
            plot_area
        )   

class ScheduleTab:
    def __init__(self, dashboard: LDashboard, reacher: REACHER):
        self.dashboard = dashboard
        self.reacher = reacher
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
        try:
            self.reacher.send_serial_command(f"SET_TIMEOUT_PERIOD_LENGTH:{self.timeout_intslider.value * 1000}")
            self.dashboard.add_response(f"Set timeout period to {self.timeout_intslider.value * 1000}")
        except Exception as e:
            self.dashboard.add_error("Failed to send timeout interval", e)

    def send_trace(self, _):
        try:
            self.reacher.send_serial_command(f"SET_TRACE_INTERVAL:{self.trace_intslider.value * 1000}")
            self.dashboard.add_response(f"Set trace interval to {self.trace_intslider.value * 1000}")
        except Exception as e:
            self.dashboard.add_error("Failed to send trace interval", e)

    def send_fixed_ratio(self, _):
        try:
            self.reacher.send_serial_command(f"SET_RATIO:{self.fixed_ratio_intslider.value}")
            self.dashboard.add_response(f"Set fixed ratio to {self.fixed_ratio_intslider.value}")
        except Exception as e:
            self.dashboard.add_error("Failed to send fixed ratio interval", e)

    def send_progressive_ratio(self, _):
        try:
            self.reacher.send_serial_command(f"SET_RATIO:{self.progressive_ratio_intslider.value}")
            self.dashboard.add_response(f"Set progressive ratio to {self.progressive_ratio_intslider.value}")
        except Exception as e:
            self.dashboard.add_error("Failed to send progressive ratio interval", e)

    def send_variable_interval(self, _):
        try:
            self.reacher.send_serial_command(f"SET_VARIABLE_INTERVAL:{self.variable_interval_intslider.value}")
            self.dashboard.add_response(f"Set variable interval to {self.variable_interval_intslider.value}")
        except Exception as e:
            self.dashboard.add_error("Failed to send variable interval", e)

    def send_omission_interval(self, _):
        try:
            self.reacher.send_serial_command(f"SET_OMISSION_INTERVAL:{self.omission_interval_intslider.value * 1000}")
            self.dashboard.add_response(f"Set omission interval to {self.omission_interval_intslider.value * 1000}")
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
    dashboard = LDashboard()
    pn.serve(dashboard.layout())